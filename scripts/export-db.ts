import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "../src/lib/db/client";
import { args, log } from "./cli";

/**
 * Write a compact, read-only deployment copy of the database containing only
 * the published rating build. The live database is not modified.
 *
 *   npm run db:export -- --out dist-data/sclyio.db
 */
const a = args();
const out = path.resolve((a.out as string) || "dist-data/sclyio.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.rmSync(out);

const src = new Database(databasePath(), { readonly: true });
src.prepare(`VACUUM INTO ?`).run(out);
src.close();

const db = new Database(out);
const published = Number((db.prepare(`SELECT value FROM kv WHERE key='published_build_id'`).get() as { value: string }).value);
db.transaction(() => {
  const stale = `SELECT id FROM snapshots WHERE build_id <> ${published}`;
  for (const t of ["overall_ratings", "event_ratings", "field_fits"]) db.prepare(`DELETE FROM ${t} WHERE snapshot_id IN (${stale})`).run();
  db.prepare(`DELETE FROM snapshots WHERE build_id <> ?`).run(published);
  db.prepare(`DELETE FROM field_strength WHERE build_id <> ?`).run(published);
})();
db.pragma("journal_mode = DELETE");
db.exec("VACUUM");
db.close();
log(`exported published build ${published} to ${out} (${(fs.statSync(out).size / 1e6).toFixed(0)} MB)`);
