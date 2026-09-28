import fs from "node:fs";
import { openDb } from "../src/lib/db/client";
import { runBacktest, type MetricRow } from "../src/lib/rating/backtest";
import { args, log } from "./cli";
import { compareWithReference } from "./sentienttree-compare";

/**
 * Chronological backtest of v2 vs. the v1 Elo and an unadjusted
 * placement-logit baseline. Writes results to the backtest_results table and
 * docs/backtest.md.
 *
 *   npm run backtest
 *   npm run backtest -- --sentienttree-dir ../cache/st   # optional external comparison
 *   npm run backtest -- --if-missing                     # only when no results are stored
 */
const a = args();
const db = openDb();
if (a["if-missing"]) {
  const n = (db.$client.prepare(`SELECT COUNT(*) AS c FROM backtest_results`).get() as { c: number }).c;
  if (n > 0) {
    log(`backtest results already present (${n} metrics); skipping (--if-missing)`);
    process.exit(0);
  }
}
const t0 = Date.now();
const rows: MetricRow[] = runBacktest(db, { log });
const external = a["sentienttree-dir"] ? compareWithReference(db, String(a["sentienttree-dir"]), log) : [];
const runAt = new Date().toISOString();
db.$client.transaction(() => {
  db.$client.prepare(`DELETE FROM backtest_results`).run();
  const ins = db.$client.prepare(
    `INSERT INTO backtest_results (run_at, division, view, split, model, metric, value, n, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of [...rows, ...external]) ins.run(runAt, r.division, r.view, r.split, r.model, r.metric, r.value, r.n, r.notes ?? null);
})();
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/backtest.md", renderMarkdown([...rows, ...external], runAt));
log(`backtest done in ${((Date.now() - t0) / 1000).toFixed(0)}s; ${rows.length + external.length} metrics; see docs/backtest.md`);
db.$client.close();

function renderMarkdown(all: MetricRow[], at: string): string {
  const lines = [
    `# Backtest results`,
    ``,
    `Generated ${at} by \`npm run backtest\`. Chronological by tournament: each target tournament is predicted from a snapshot dated the Sunday strictly before its start date. Pairwise accuracy counts correctly ordered pairs among entrants every model could rate; ties in prediction count one half.`,
    ``,
    `Splits: **validation** = targets starting 2024-12-01 to 2026-01-31 (used for any parameter choice); **test** = targets starting 2026-02-01 or later (held out; reported once for the defaults).`,
    ``,
  ];
  const groups = new Map<string, MetricRow[]>();
  for (const r of all) {
    const k = `${r.division} · ${r.view === "team" ? "Team Performance" : "School Potential"} · ${r.split}`;
    let arr = groups.get(k);
    if (!arr) groups.set(k, (arr = []));
    arr.push(r);
  }
  for (const [k, arr] of groups) {
    lines.push(`## ${k}`, "", "| model | metric | value | n |", "|---|---|---|---|");
    for (const r of arr) lines.push(`| ${r.model} | ${r.metric} | ${r.value === null ? "—" : r.value.toFixed(4)} | ${r.n}${r.notes ? ` (${r.notes})` : ""} |`);
    lines.push("");
  }
  return lines.join("\n");
}
