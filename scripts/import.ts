import { openDb } from "../src/lib/db/client";
import { loadMappings } from "../src/lib/identity/mappings";
import { runImport } from "../src/lib/import/importer";
import { args, log, makeAdapter } from "./cli";

/**
 * Usage:
 *   npm run import                      # full import, every season in the archive
 *   npm run import -- --seasons 2024,2025,2026   # historical backfill
 *   npm run import -- --local ../duosmium/data   # offline, local checkout
 *   npm run sync                        # incremental (unchanged blobs skipped)
 */
async function main() {
  const a = args();
  const mode = a.incremental ? "incremental" : "full";
  const seasonsArg = (a.seasons as string) || process.env.IMPORT_SEASONS || "all";
  const seasons = seasonsArg === "auto" || seasonsArg === "all" ? seasonsArg : seasonsArg.split(",").map((s) => Number(s.trim()));
  const db = openDb();
  const summary = await runImport({
    db,
    adapter: makeAdapter(a),
    mappings: loadMappings(),
    mode,
    seasons,
    divisions: ((a.divisions as string) || "B,C").split(","),
    concurrency: Number(a.concurrency ?? process.env.FETCH_CONCURRENCY ?? 4),
    today: (a.today as string) || new Date().toISOString().slice(0, 10),
    log,
  });
  log(`import summary: ${JSON.stringify(summary, null, 2)}`);
  db.$client.close();
  if (summary.status === "failed") process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
