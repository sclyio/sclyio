import type { DB } from "../db/client";
import { DEFAULT_PARAMS, type ModelParams, type RatingView } from "./config";
import { EloV1, type EloTournament } from "./elo-v1";
import { loadObservations, planPools, sundayOnOrAfter } from "./engine";
import { addDays, spearman } from "./math";
import { computeSnapshot, seasonEndsOf, type PoolObservation, type SnapshotResult } from "./model";

/**
 * Chronological, tournament-level backtest. For each target tournament the
 * models only see results completed before its start date (snapshot dated
 * the Sunday strictly before the start). Rows are never randomly split.
 */

export interface Split {
  name: "validation" | "test";
  from: string;
  to: string;
}

export const DEFAULT_SPLITS: Split[] = [
  { name: "validation", from: "2024-12-01", to: "2026-01-31" },
  { name: "test", from: "2026-02-01", to: "2026-06-30" },
];

export interface MetricRow {
  division: string;
  view: RatingView;
  split: string;
  model: string;
  metric: string;
  value: number | null;
  n: number;
  notes?: string;
}

interface Acc {
  pairsCorrect: number;
  pairs: number;
  spearman: number[];
}
const acc = (): Acc => ({ pairsCorrect: 0, pairs: 0, spearman: [] });

function score(a: Acc, pred: number[], actualRank: number[]) {
  for (let i = 0; i < pred.length; i++) {
    for (let j = i + 1; j < pred.length; j++) {
      if (actualRank[i] === actualRank[j]) continue;
      a.pairs++;
      const better = actualRank[i] < actualRank[j] ? i : j;
      const worse = better === i ? j : i;
      if (pred[better] > pred[worse]) a.pairsCorrect++;
      else if (pred[better] === pred[worse]) a.pairsCorrect += 0.5;
    }
  }
  const rho = spearman(pred, actualRank.map((r) => -r));
  if (Number.isFinite(rho)) a.spearman.push(rho);
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export interface Variant {
  name: string;
  params: ModelParams;
}

export function defaultVariants(): Variant[] {
  const p = DEFAULT_PARAMS;
  return [
    { name: "v2-default", params: p },
    { name: "v2-online-weight-1", params: { ...p, onlineWeight: 1 } },
    { name: "v2-current-season-only", params: { ...p, seasonWeights: [1] } },
    { name: "v2-seasons-flat", params: { ...p, seasonWeights: [1, 1, 1, 1] } },
    { name: "v2-fieldsize-0", params: { ...p, fieldSizeExponent: 0 } },
    { name: "v2-2-seasons", params: { ...p, seasonWeights: [1, 0.5] } },
    { name: "v2-no-competitiveness", params: { ...p, competitivenessExponent: 0 } },
    { name: "v2-competitiveness-1", params: { ...p, competitivenessExponent: 1 } },
    { name: "v2-flat-levels", params: { ...p, levelWeights: {}, earlyInvitationalWeights: {} } },
    { name: "v2-no-recency", params: { ...p, decayDays: 1e9 } },
    { name: "v2-decay-100", params: { ...p, decayDays: 100 } },
    { name: "v2-lambdaS-0.5", params: { ...p, lambdaS: 0.5 } },
    { name: "v2-lambdaS-2 (v2-exp.1)", params: { ...p, lambdaS: 2 } },
    { name: "v2-lambdaK-3", params: { ...p, lambdaK: 3 } },
  ];
}

interface Target {
  id: string;
  season: number;
  startDate: string;
  endDate: string;
  format: string;
}

export function runBacktest(db: DB, opts: { variants?: Variant[]; splits?: Split[]; log: (m: string) => void }): MetricRow[] {
  const s = db.$client;
  const variants = opts.variants ?? defaultVariants();
  const splits = opts.splits ?? DEFAULT_SPLITS;
  const pools = planPools(db);
  const out: MetricRow[] = [];

  for (const division of ["B", "C"]) {
    for (const view of ["team", "school"] as RatingView[]) {
      const byDef = loadObservations(db, division, view);
      const seasonEnds = seasonEndsOf(byDef);
      // Observations grouped by tournament event (targets).
      const byField = new Map<string, PoolObservation[]>();
      for (const arr of byDef.values()) {
        for (const o of arr) {
          let a = byField.get(o.fieldId);
          if (!a) byField.set(o.fieldId, (a = []));
          a.push(o);
        }
      }
      const obsByTournament = new Map<string, Map<string, PoolObservation[]>>();
      for (const [fid, arr] of byField) {
        const tid = arr[0].tournamentId;
        let m = obsByTournament.get(tid);
        if (!m) obsByTournament.set(tid, (m = new Map()));
        m.set(fid, arr);
      }
      const eloTournaments = buildEloStandings(db, division, view, obsByTournament);
      const targets = s
        .prepare(
          `SELECT id, season, start_date AS startDate, end_date AS endDate, format FROM tournaments
           WHERE division=? AND rating_eligible=1 ORDER BY start_date, id`,
        )
        .all(division) as Target[];
      const standingsById = new Map(eloTournaments.map((t) => [t.id, t]));

      for (const split of splits) {
        const inSplit = targets.filter((t) => t.startDate >= split.from && t.startDate <= split.to);
        // Elo, advanced chronologically (frozen before each target's start).
        const eloSorted = [...eloTournaments].sort((a, b) => (a.date < b.date ? -1 : 1));
        const elo = new EloV1();
        let ptr = 0;
        const evAcc = new Map<string, Acc>();
        const ovAcc = new Map<string, Acc>();
        const sub = new Map<string, Acc>();
        const get = (m: Map<string, Acc>, k: string) => {
          let a = m.get(k);
          if (!a) m.set(k, (a = acc()));
          return a;
        };
        const snapCache = new Map<string, SnapshotResult>();
        let cachedAsOf = "";

        for (const t of inSplit) {
          const pool = pools.find((p) => p.division === division && p.season === t.season);
          if (!pool) continue;
          // Advance Elo through tournaments ending before this start date.
          while (ptr < eloSorted.length && eloSorted[ptr].date < t.startDate) {
            const d = eloSorted[ptr].date;
            const batch: EloTournament[] = [];
            while (ptr < eloSorted.length && eloSorted[ptr].date === d) batch.push(eloSorted[ptr++]);
            elo.applyDate(batch);
          }
          const asOf = preTournamentAsOf(t.startDate);
          // Targets are in start-date order, so as-of dates never decrease:
          // keep only the current as-of date's snapshots in memory.
          if (cachedAsOf !== asOf) {
            snapCache.clear();
            cachedAsOf = asOf;
          }
          const fields = obsByTournament.get(t.id);
          if (!fields) continue;

          for (const variant of variants) {
            const key = `${variant.name}|${t.season}|${asOf}`;
            let snap = snapCache.get(key);
            if (!snap) {
              snap = computeSnapshot({
                asOf,
                season: t.season,
                view,
                officialEventDefs: pool.officialDefs,
                poolDefs: pool.poolDefs,
                observationsByDef: byDef,
                params: variant.params,
                seasonEnds,
              });
              snapCache.set(key, snap);
            }
            const isDefault = variant.name === "v2-default";
            // ----- event ordering -----
            for (const [, obs] of fields) {
              const def = obs[0].eventDefId;
              const st = snap.events.get(def);
              if (!st) continue; // not an official event of this season
              const rated = obs.filter((o) => st.own.has(o.entityId) && elo.has(o.entityId));
              if (rated.length < 3) continue;
              const actual = rated.map((o) => rankOf(o));
              const v2 = rated.map((o) => (view === "school" ? st.q.get(o.entityId)! : st.s.get(o.entityId)!));
              score(get(evAcc, variant.name), v2, actual);
              if (isDefault) {
                const baseline = rated.map((o) => {
                  const own = st.own.get(o.entityId)!;
                  return own.reduce((a, b) => a + b.x, 0) / own.length;
                });
                score(get(evAcc, "placement-logit-baseline"), baseline, actual);
                score(get(evAcc, "v1-elo"), rated.map((o) => elo.get(o.entityId)), actual);
                // Subgroups for the default model.
                const sparse = rated.filter((o) => (snap!.overall.get(o.entityId)?.tournaments ?? 0) <= 2);
                if (sparse.length >= 3) score(get(sub, "sparse(<=2 prior tournaments)"), sparse.map((o) => (view === "school" ? st.q.get(o.entityId)! : st.s.get(o.entityId)!)), sparse.map(rankOf));
                const local = rated.filter((o) => st.component.get(o.entityId) !== 0);
                if (local.length >= 3) score(get(sub, "outside-reference-component"), local.map((o) => (view === "school" ? st.q.get(o.entityId)! : st.s.get(o.entityId)!)), local.map(rankOf));
                if (t.format === "online") score(get(sub, "online-tournaments"), v2, actual);
              }
            }
            // ----- overall standings -----
            const standing = standingsById.get(t.id);
            if (standing) {
              const rated = standing.standings.filter((x) => snap!.overall.has(x.entityId) && elo.has(x.entityId));
              if (rated.length >= 3) {
                const actual = rated.map((x) => x.rank);
                score(get(ovAcc, variant.name), rated.map((x) => snap!.overall.get(x.entityId)!.z), actual);
                if (isDefault) {
                  const M = pool.officialDefs.length;
                  const baseline = rated.map((x) => {
                    let sum = 0;
                    for (const def of pool.officialDefs) {
                      const own = snap!.events.get(def)?.own.get(x.entityId);
                      if (own?.length) sum += own.reduce((a, b) => a + b.x, 0) / own.length;
                    }
                    return sum / M;
                  });
                  score(get(ovAcc, "placement-logit-baseline"), baseline, actual);
                  score(get(ovAcc, "v1-elo"), rated.map((x) => elo.get(x.entityId)), actual);
                }
              }
            }
          }
        }
        const push = (m: Map<string, Acc>, level: string) => {
          for (const [model, a] of m) {
            out.push({ division, view, split: split.name, model, metric: `${level}_pairwise_accuracy`, value: a.pairs ? a.pairsCorrect / a.pairs : null, n: a.pairs });
            out.push({ division, view, split: split.name, model, metric: `${level}_mean_spearman`, value: mean(a.spearman), n: a.spearman.length });
          }
        };
        push(evAcc, "event");
        push(ovAcc, "overall");
        for (const [k, a] of sub) {
          out.push({ division, view, split: split.name, model: "v2-default", metric: `event_pairwise_accuracy[${k}]`, value: a.pairs ? a.pairsCorrect / a.pairs : null, n: a.pairs });
        }
        const onlineTargets = inSplit.filter((t) => t.format === "online").length;
        out.push({
          division,
          view,
          split: split.name,
          model: "coverage",
          metric: "target_tournaments",
          value: inSplit.length,
          n: inSplit.length,
          notes: `${onlineTargets} explicitly online targets`,
        });
        opts.log(`backtest ${division}/${view}/${split.name}: ${inSplit.length} target tournaments`);
      }
    }
  }
  return out;
}

/** Ordering proxy for the actual model rank (higher x = better finish). */
const rankOf = (o: PoolObservation) => -o.x;

/** Latest Sunday strictly before the start date: no same-tournament leakage. */
export function preTournamentAsOf(startDate: string): string {
  return sundayOnOrAfter(addDays(startDate, -7));
}

/**
 * Overall standings per tournament for Elo and overall evaluation.
 * Team view: official overall ranks of resolved, non-exhibition entries.
 * School view: superscored standing — sum over eligible official events of
 * the school's re-ranked event place (missing events count as n + 1).
 */
function buildEloStandings(
  db: DB,
  division: string,
  view: RatingView,
  obsByTournament: Map<string, Map<string, PoolObservation[]>>,
): EloTournament[] {
  const s = db.$client;
  const ts = s
    .prepare(`SELECT id, end_date FROM tournaments WHERE division=? AND rating_eligible=1`)
    .all(division) as { id: string; end_date: string }[];
  const out: EloTournament[] = [];
  const qEntries = s.prepare(
    `SELECT team_id AS id, rank FROM entries WHERE tournament_id=? AND exhibition=0 AND team_id IS NOT NULL AND rank IS NOT NULL`,
  );
  for (const t of ts) {
    if (view === "team") {
      const rows = qEntries.all(t.id) as { id: string; rank: number }[];
      out.push({ id: t.id, date: t.end_date, standings: rows.map((r) => ({ entityId: r.id, rank: r.rank })) });
    } else {
      const fields = obsByTournament.get(t.id);
      if (!fields) continue;
      const schools = new Set<string>();
      for (const arr of fields.values()) for (const o of arr) schools.add(o.entityId);
      const total = new Map<string, number>([...schools].map((x) => [x, 0]));
      for (const arr of fields.values()) {
        const n = arr.length;
        const present = new Set(arr.map((o) => o.entityId));
        const ranks = [...arr].sort((a, b) => b.x - a.x);
        ranks.forEach((o) => total.set(o.entityId, total.get(o.entityId)! + (n + 1) / (1 + Math.exp(o.x))));
        for (const sc of schools) if (!present.has(sc)) total.set(sc, total.get(sc)! + n + 1);
      }
      const sorted = [...total.entries()].sort((a, b) => a[1] - b[1]);
      out.push({
        id: t.id,
        date: t.end_date,
        standings: sorted.map(([entityId, v]) => ({ entityId, rank: 1 + sorted.filter((x) => x[1] < v).length })),
      });
    }
  }
  return out;
}

