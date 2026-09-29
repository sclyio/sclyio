import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InArgs } from "@libsql/client";
import { usedArgs } from "./args";

/**
 * Read-only database access for web requests.
 *
 * Production (Turso): `npm run publish:turso` uploads each finished dataset as a
 * new Turso database, then flips a one-row pointer in a small "meta" database.
 * Requests resolve the pointer (cached for a minute) and read the active
 * dataset, so a publish is atomic from a visitor's point of view.
 *   TURSO_META_URL   libsql://… URL of the meta database
 *   TURSO_READ_TOKEN read-only group token (valid for every database in the group)
 *
 * Direct URL: DATABASE_URL (libsql://… or file:…) + optional DATABASE_AUTH_TOKEN.
 * Local default: file:./data/sclyio.db (written by the CLI jobs).
 */

export class DataUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      `The scly.io database is not available${detail ? ` (${detail})` : ""}. Run \`npm run setup\` locally, or publish a dataset to Turso.`,
    );
    this.name = "DataUnavailableError";
  }
}

const POINTER_TTL_MS = 60_000;
const clients = new Map<string, Client>();
let pointer: { url: string; at: number } | null = null;

function client(url: string, authToken?: string): Client {
  let c = clients.get(url);
  if (!c) {
    c = createClient({ url, authToken, intMode: "number" });
    clients.set(url, c);
  }
  return c;
}

async function resolveUrl(): Promise<{ url: string; token?: string }> {
  const metaUrl = process.env.TURSO_META_URL;
  const token = process.env.TURSO_READ_TOKEN;
  if (metaUrl && token) {
    const now = Date.now();
    if (!pointer || now - pointer.at > POINTER_TTL_MS) {
      let rs;
      try {
        rs = await client(metaUrl, token).execute("SELECT db_url FROM active_dataset WHERE id = 1");
      } catch (e) {
        throw new DataUnavailableError(`meta database unreachable: ${e instanceof Error ? e.message : String(e)}`);
      }
      const url = rs.rows[0]?.db_url as string | undefined;
      if (!url) throw new DataUnavailableError("no dataset has been published yet");
      pointer = { url, at: now };
    }
    return { url: pointer.url, token };
  }
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, token: process.env.DATABASE_AUTH_TOKEN || undefined };
  }
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/sclyio.db");
  if (!fs.existsSync(file)) throw new DataUnavailableError("no local database file");
  return { url: `file:${file}` };
}

export type Row = Record<string, unknown>;

export { usedArgs };

async function exec(sqlText: string, args?: InArgs) {
  const { url, token } = await resolveUrl();
  return client(url, token).execute({ sql: sqlText, args: usedArgs(sqlText, args) });
}

/** All rows as plain objects. */
export async function all<T = Row>(sqlText: string, args?: InArgs): Promise<T[]> {
  const rs = await exec(sqlText, args);
  return rs.rows.map((r) => {
    const o: Row = {};
    rs.columns.forEach((c, i) => (o[c] = r[i]));
    return o as T;
  });
}

/** First row or undefined. */
export async function get<T = Row>(sqlText: string, args?: InArgs): Promise<T | undefined> {
  return (await all<T>(sqlText, args))[0];
}
