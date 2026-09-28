import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { publishToTurso } from "../src/lib/publish/turso";
import { args, log } from "./cli";

/**
 * Publish the exported dataset to Turso (see src/lib/publish/turso.ts).
 *
 *   npm run db:export
 *   npm run publish:turso                    # uses dist-data/sclyio.db
 *   npm run publish:turso -- --file other.db
 *   npm run publish:turso -- --force        # upload even if unchanged
 *
 * Env: TURSO_API_TOKEN, TURSO_ORG, TURSO_GROUP (default "default"),
 *      TURSO_META_DB (default "sclyio-meta"), TURSO_DATASET_PREFIX (default "sclyio-data"),
 *      TURSO_KEEP (default 2)
 */
async function main() {
  const a = args();
  const file = path.resolve((a.file as string) || "dist-data/sclyio.db");
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  if (!fs.existsSync(file)) throw new Error(`${file} not found; run npm run db:export first`);

  // Turso requires WAL mode with a checkpointed, truncated WAL.
  const db = new Database(file);
  const mode = db.pragma("journal_mode = WAL", { simple: true });
  db.pragma("wal_checkpoint(TRUNCATE)");
  const buildId = Number((db.prepare(`SELECT value FROM kv WHERE key='published_build_id'`).get() as { value: string }).value);
  const rev = (db.prepare(`SELECT value FROM kv WHERE key='source_revision'`).get() as { value: string } | undefined)?.value ?? null;
  const builtAt = (db.prepare(`SELECT value FROM kv WHERE key='last_rating_build'`).get() as { value: string } | undefined)?.value ?? "";
  db.close();
  if (mode !== "wal") throw new Error(`could not switch ${file} to WAL mode (got ${mode})`);
  for (const ext of ["-wal", "-shm"]) if (fs.existsSync(file + ext) && fs.statSync(file + ext).size > 0) throw new Error(`${file}${ext} not empty after checkpoint`);

  const r = await publishToTurso({
    apiToken: need("TURSO_API_TOKEN"),
    org: need("TURSO_ORG"),
    group: process.env.TURSO_GROUP ?? "default",
    metaDb: process.env.TURSO_META_DB ?? "sclyio-meta",
    prefix: process.env.TURSO_DATASET_PREFIX ?? "sclyio-data",
    keep: Number(process.env.TURSO_KEEP ?? 2),
    file: await fs.openAsBlob(file),
    expectedBuildId: buildId,
    sourceRevision: rev,
    marker: `${buildId}@${builtAt}`,
    skipIfCurrent: !a.force,
    log,
  });
  if (!r.skipped) log(`published build ${buildId} as ${r.name} (${r.url})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
