import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function databasePath(): string {
  // Runtime-configured location; excluded from build-time file tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/sclyio.db");
}

/**
 * Writable better-sqlite3 connection for the trusted CLI jobs (import,
 * rebuild, backtest, export). Web requests use ./read.ts instead.
 */
export function openDb(file = databasePath()): DB {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle(sqlite, { schema }) as DB;
}
