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

/** A configuration problem, with a short machine-readable code. Messages never include secrets. */
export class AccountsConfigError extends Error {
  constructor(
    public code: "missing_url" | "invalid_url" | "missing_token" | "client_error",
    message: string,
  ) {
    super(message);
    this.name = "AccountsConfigError";
  }
}

/** Env values pasted into dashboards often carry whitespace, a trailing newline, or quotes. */
export function cleanEnv(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  return t || undefined;
}

export function accountsDbUrl(): { url: string; authToken?: string } {
  const url = cleanEnv(process.env.ACCOUNTS_DATABASE_URL);
  const authToken = cleanEnv(process.env.ACCOUNTS_DATABASE_AUTH_TOKEN);
  if (url) {
    if (!/^(libsql|https?|wss?|file):/i.test(url)) {
      throw new AccountsConfigError("invalid_url", "ACCOUNTS_DATABASE_URL must start with libsql:// (or https://, wss://, file:).");
    }
    if (!url.startsWith("file:") && !authToken) {
      throw new AccountsConfigError("missing_token", "ACCOUNTS_DATABASE_AUTH_TOKEN is not set for this deployment.");
    }
    return { url, authToken };
  }
  // A serverless deployment has no writable local file: the URL is required there.
  if (process.env.VERCEL) {
    throw new AccountsConfigError("missing_url", "ACCOUNTS_DATABASE_URL is not set for this deployment (check the Production environment and redeploy).");
  }
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.ACCOUNTS_DATABASE_PATH ?? "./data/accounts.db");
  return { url: `file:${file}` };
}

export function accountsDb(): Client {
  if (!shared) {
    let cfg: { url: string; authToken?: string };
    try {
      cfg = accountsDbUrl();
      shared = createClient({ url: cfg.url, authToken: cfg.authToken, intMode: "number" });
    } catch (e) {
      const err =
        e instanceof AccountsConfigError
          ? e
          : new AccountsConfigError("client_error", `Could not open the accounts database: ${e instanceof Error ? e.name : "error"}.`);
      console.error(`[scly.io] ${err.message}`);
      throw err;
    }
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

/** Newest migration this code needs. A test keeps it in step with accounts/migrations. */
export const REQUIRED_ACCOUNTS_MIGRATION = "0002_profiles_and_trend.sql";

export class AccountsSchemaError extends Error {
  constructor(missing: string) {
    super(`The accounts database is missing migration ${missing}. Run \`npm run accounts:migrate\` against it (see README).`);
    this.name = "AccountsSchemaError";
  }
}

let schemaChecked: Promise<void> | null = null;

/** Verify once per process that the accounts database has been migrated far enough. */
export function ensureAccountsSchema(client?: Client): Promise<void> {
  if (!schemaChecked) {
    schemaChecked = (async () => {
      const db = client ?? accountsDb();
      let applied: string[] = [];
      try {
        applied = (await rows<{ name: string }>(db, `SELECT name FROM _migrations`)).map((r) => r.name);
      } catch (e) {
        // No _migrations table means never migrated; anything else (auth, network) is a connection problem.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/no such table/i.test(msg)) {
          throw new AccountsConfigError("client_error", `The accounts database could not be queried (${msg.slice(0, 160)}). Check ACCOUNTS_DATABASE_URL and ACCOUNTS_DATABASE_AUTH_TOKEN.`);
        }
      }
      if (!applied.includes(REQUIRED_ACCOUNTS_MIGRATION)) throw new AccountsSchemaError(REQUIRED_ACCOUNTS_MIGRATION);
    })().catch((e) => {
      schemaChecked = null; // re-check after the operator migrates
      console.error(`[scly.io] ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    });
  }
  return schemaChecked;
}
