import fs from "node:fs";
import path from "node:path";
import type { DB } from "../src/lib/db/client";
import { normText } from "../src/lib/identity/normalize";
import { spearman } from "../src/lib/rating/math";
import type { MetricRow } from "../src/lib/rating/backtest";

/**
 * External comparison with SentientTree's displayed 2026 FINAL rankings
 * (School Potential only — both superscore schools). This is NOT ground
 * truth and never used for training. The FINAL tab's as-of date and whether
 * Nationals were included are not established, so differences are expected.
 *
 * Input: a directory containing divb.csv / divc.csv exported locally from the
 * public spreadsheet (school,state,overall_rank,overall_score). The export is
 * not committed to this repository.
 */
const expand = (s: string) =>
  s
    .replace(/\bJ\.?H\.?S\.?(?=\s|$)/gi, "Junior High School")
    .replace(/\bH\.?S\.?(?=\s|$)/gi, "High School")
    .replace(/\bM\.?S\.?(?=\s|$)/gi, "Middle School")
    .replace(/\bJr\.? High\b/gi, "Junior High");

export function compareWithReference(db: DB, dir: string, log: (m: string) => void): MetricRow[] {
  const s = db.$client;
  const out: MetricRow[] = [];
  const build = (s.prepare(`SELECT value FROM kv WHERE key='published_build_id'`).get() as { value: string }).value;
  for (const div of ["B", "C"]) {
    const file = path.join(dir, `div${div.toLowerCase()}.csv`);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1);
    const ref = lines.map((l) => {
      const m = l.match(/^"?(.*?) \((.*), ([A-Z]{2})\)"?,([A-Z]{2}),([\d.]+),/);
      return m ? { name: normText(expand(m[1])), city: normText(m[2]), state: m[3], rank: Number(m[5]) } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    const snap = s
      .prepare(`SELECT id, as_of FROM snapshots WHERE build_id=? AND division=? AND view='school' AND season=2026 ORDER BY as_of DESC LIMIT 1`)
      .get(build, div) as { id: number; as_of: string };
    const ours = s
      .prepare(
        `SELECT o.national_rank AS rank, sc.name, sc.city, sc.state FROM overall_ratings o JOIN schools sc ON sc.id=o.entity_id
         WHERE o.snapshot_id=? AND o.national_rank IS NOT NULL`,
      )
      .all(snap.id) as { rank: number; name: string; city: string | null; state: string }[];
    const key = (n: string, c: string | null, st: string) => `${normText(expand(n))}|${normText(c)}|${st.replace(/^[ns]CA$/, "CA")}`;
    const oursByKey = new Map(ours.map((o) => [key(o.name, o.city, o.state), o.rank]));
    const pairs: [number, number][] = [];
    for (const r of ref) {
      const k = `${r.name}|${r.city}|${r.state}`;
      const o = oursByKey.get(k);
      if (o !== undefined) pairs.push([o, r.rank]);
    }
    const rho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    const top = (n: number) => {
      const a = new Set(pairs.filter((p) => p[0] <= n).map((p) => p[1]));
      const refTop = pairs.filter((p) => p[1] <= n).length;
      return { overlap: pairs.filter((p) => p[0] <= n && p[1] <= n).length, refTop, ours: a.size };
    };
    const t25 = top(25);
    const note = `scly.io School Potential established ranks as of ${snap.as_of} vs SentientTree 'Div ${div} FINAL' (as-of date unknown)`;
    out.push({ division: div, view: "school", split: "external", model: "sentienttree", metric: "matched_schools", value: pairs.length, n: ref.length, notes: note });
    out.push({ division: div, view: "school", split: "external", model: "sentienttree", metric: "rank_spearman_matched", value: rho, n: pairs.length, notes: note });
    out.push({ division: div, view: "school", split: "external", model: "sentienttree", metric: "top25_overlap", value: t25.overlap, n: 25, notes: note });
    log(`SentientTree Div ${div}: matched ${pairs.length}/${ref.length}, spearman ${rho.toFixed(3)}, top-25 overlap ${t25.overlap}`);
  }
  return out;
}
