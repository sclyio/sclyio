import { openDb } from "../src/lib/db/client";
import { rebuildRatings } from "../src/lib/rating/engine";
import { args, log } from "./cli";

/**
 * Usage:
 *   npm run ratings:rebuild              # recompute from the pending earliest affected date (or full)
 *   npm run ratings:rebuild -- --full    # recompute every snapshot
 *   npm run ratings:rebuild -- --from 2026-03-01
 */
const a = args();
const db = openDb();
const pending = (db.$client.prepare(`SELECT value FROM kv WHERE key='pending_rebuild_from'`).get() as { value: string } | undefined)?.value;
const from = a.full ? null : ((a.from as string) || pending || null);
if (!a.full && !a.from && !pending && !a.force) {
  const has = db.$client.prepare(`SELECT value FROM kv WHERE key='published_build_id'`).get();
  if (has) {
    log("no pending changes since the last published build; nothing to do (use --full to force)");
    process.exit(0);
  }
}
const t0 = Date.now();
try {
  const r = rebuildRatings({ db, from, log });
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${JSON.stringify(r)}`);
  db.$client.pragma("wal_checkpoint(TRUNCATE)");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  db.$client.close();
}
