import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import { usedArgs } from "../db/args";

/**
 * Writable accounts database (users, sessions, memberships, claims, reviews,
 * personal rating snapshots). Kept apart from the result datasets, which are
 * read-only and replaced on every publish.
 *
 *   ACCOUNTS_DATABASE_URL         libsql://… (Turso) or file:…
 *   ACCOUNTS_DATABASE_AUTH_TOKEN  read-write token for that database
 * Local default: file:./data/accounts.db
 */

let shared: Client | null = null;

export function accountsDbUrl(): { url: string; authToken?: string } {
  if (process.env.ACCOUNTS_DATABASE_URL) {
    return { url: process.env.ACCOUNTS_DATABASE_URL, authToken: process.env.ACCOUNTS_DATABASE_AUTH_TOKEN || undefined };
  }
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.ACCOUNTS_DATABASE_PATH ?? "./data/accounts.db");
  return { url: `file:${file}` };
}

export function accountsDb(): Client {
  if (!shared) {
    const { url, authToken } = accountsDbUrl();
    shared = createClient({ url, authToken, intMode: "number" });
  }
  return shared;
}

/** Anything that can run statements: the client or an open transaction. */
export type Exec = Pick<Client, "execute"> | Transaction;

export type Row = Record<string, unknown>;

export async function rows<T = Row>(db: Exec, sqlText: string, args?: InArgs): Promise<T[]> {
  const rs = await db.execute({ sql: sqlText, args: usedArgs(sqlText, args) });
  return rs.rows.map((r) => {
    const o: Row = {};
    rs.columns.forEach((c, i) => (o[c] = r[i]));
    return o as T;
  });
}

export async function row<T = Row>(db: Exec, sqlText: string, args?: InArgs): Promise<T | undefined> {
  return (await rows<T>(db, sqlText, args))[0];
}

export async function run(db: Exec, sqlText: string, args?: InArgs): Promise<number> {
  const rs = await db.execute({ sql: sqlText, args: usedArgs(sqlText, args) });
  return rs.rowsAffected;
}

/** Run fn in a write transaction; commits on success, rolls back on any error. */
export async function tx<T>(db: Client, fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await db.transaction("write");
  try {
    const out = await fn(t);
    await t.commit();
    return out;
  } catch (e) {
    await t.rollback().catch(() => {});
    throw e;
  } finally {
    t.close();
  }
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString("base64url")}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Apply accounts/migrations/*.sql in order (idempotent, additive only). */
export async function migrateAccounts(db: Client, dir = path.resolve("accounts/migrations")): Promise<string[]> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  await db.execute("PRAGMA foreign_keys = ON");
  const done = new Set((await rows<{ name: string }>(db, `SELECT name FROM _migrations`)).map((r) => r.name));
  const applied: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const sqlText = fs.readFileSync(path.join(dir, f), "utf8");
    await db.executeMultiple(`BEGIN;\n${sqlText}\nINSERT INTO _migrations (name, applied_at) VALUES ('${f}', '${new Date().toISOString()}');\nCOMMIT;`);
    applied.push(f);
  }
  return applied;
}

/** A read-only DataSource over a libSQL client (CLI jobs and tests; the app uses db/read.ts). */
export function libsqlSource(client: Pick<Client, "execute">) {
  return {
    all: <T = Row>(sqlText: string, args?: InArgs) => rows<T>(client, sqlText, args),
    get: <T = Row>(sqlText: string, args?: InArgs) => row<T>(client, sqlText, args),
  };
}
