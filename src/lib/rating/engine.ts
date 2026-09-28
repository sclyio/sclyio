import { createHash } from "node:crypto";
import type { DB } from "../db/client";
import { DEFAULT_PARAMS, MODEL_VERSION, type ModelParams, type RatingView } from "./config";
import { addDays, toUsr } from "./math";
import {
  attributeChange,
  computeSnapshot,
  ratingStatus,
  type PoolObservation,
  type SnapshotResult,
} from "./model";

/**
 * Rating rebuild job (trusted CLI only). Computes snapshots into a new
 * build, copies unaffected earlier snapshots from the published build, then
 * flips the published pointer in one transaction, so visitors never see a
 * half-recomputed ranking.
 */

export interface RebuildOptions {
  db: DB;
  params?: ModelParams;
  /** Earliest affected date; null = full rebuild. */
  from?: string | null;
  log: (m: string) => void;
  /** Months (1-12) whose last snapshot stores full event-level detail. */
  eventDetailMonths?: number[];
}

export function paramsHash(p: ModelParams) {
  return createHash("sha256").update(MODEL_VERSION + JSON.stringify(p)).digest("hex").slice(0, 16);
}

/** Sunday on or after the given date. Snapshots are dated Sundays. */
export function sundayOnOrAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const add = (7 - d.getUTCDay()) % 7;
  return addDays(iso, add);
}

export function snapshotDates(endDates: string[]): string[] {
  if (!endDates.length) return [];
  const sorted = [...endDates].sort();
  const first = sundayOnOrAfter(sorted[0]);
  const last = sundayOnOrAfter(sorted[sorted.length - 1]);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

interface PoolSpec {
  division: string;
  season: number;
  officialDefs: string[];
  poolDefs: Map<string, string[]>;
  dates: string[];
}

export function publishedBuildId(db: DB): number | null {
  const r = db.$client.prepare(`SELECT value FROM kv WHERE key='published_build_id'`).get() as { value: string } | undefined;
  return r ? Number(r.value) : null;
}

export function rebuildRatings(opts: RebuildOptions) {
  const { db, log } = opts;
  const s = db.$client;
  const p = opts.params ?? DEFAULT_PARAMS;
  const detailMonths = new Set(opts.eventDetailMonths ?? [1, 3]);
  const pHash = paramsHash(p);
  const prevBuild = publishedBuildId(db);
  const prevMeta = prevBuild
    ? (s.prepare(`SELECT params FROM rating_builds WHERE id=?`).get(prevBuild) as { params: string } | undefined)
    : undefined;
  const prevHash = prevMeta ? (JSON.parse(prevMeta.params) as { hash?: string }).hash : undefined;
  // A parameter/model change always forces a full rebuild.
  let from = opts.from ?? null;
  if (!prevBuild || prevHash !== pHash) from = null;
  const sourceRevision =
    (s.prepare(`SELECT value FROM kv WHERE key='source_revision'`).get() as { value: string } | undefined)?.value ?? null;

  const buildId = Number(
    s
      .prepare(
        `INSERT INTO rating_builds (started_at, status, model_version, params, source_revision, recomputed_from) VALUES (?, 'running', ?, ?, ?, ?)`,
      )
      .run(new Date().toISOString(), MODEL_VERSION, JSON.stringify({ ...p, hash: pHash }), sourceRevision, from).lastInsertRowid,
  );
  log(`build ${buildId}: ${from ? `recomputing snapshots on/after ${from}` : "full rebuild"} (model ${MODEL_VERSION}, params ${pHash})`);

  try {
    const pools = planPools(db);
    const schoolState = new Map(
      (s.prepare(`SELECT id, state FROM schools`).all() as { id: string; state: string }[]).map((r) => [r.id, r.state]),
    );
    const teamSchool = new Map(
      (s.prepare(`SELECT id, school_id FROM team_seasons`).all() as { id: string; school_id: string }[]).map((r) => [
        r.id,
        r.school_id,
      ]),
    );
    const stateOf = (view: RatingView, id: string) =>
      view === "school" ? schoolState.get(id) ?? null : schoolState.get(teamSchool.get(id) ?? "") ?? null;

    const insSnap = s.prepare(
      `INSERT INTO snapshots (build_id, division, view, season, as_of, official_events, entity_count, established_count, excluded_counts,
        has_event_detail, diagnostics, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insOverall = s.prepare(
      `INSERT INTO overall_ratings (snapshot_id, entity_id, z, usr, status, national_rank, state_rank, state, comparable_events,
        observed_events, tournaments, observations, last_competition, prev_z, d_added, d_recency, d_field, d_other, explain, event_vector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    );
    const insEvent = s.prepare(
      `INSERT INTO event_ratings (snapshot_id, entity_id, event_def_id, value, skill, usr, appearances, unique_opponents, n_eff, last_date,
        shrinkage, component, weak, event_rank, evidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insField = s.prepare(`INSERT INTO field_fits (snapshot_id, tournament_event_id, k, weight, n) VALUES (?, ?, ?, ?, ?)`);

    let snapshotsComputed = 0;
    let snapshotsCopied = 0;
    const failures: string[] = [];

    for (const view of ["team", "school"] as RatingView[]) {
      for (const division of ["B", "C"]) {
        const byDef = loadObservations(db, division, view);
        for (const pool of pools.filter((x) => x.division === division)) {
          const M = pool.officialDefs.length;
          let prev: SnapshotResult | null = null;
          for (let di = 0; di < pool.dates.length; di++) {
            const asOf = pool.dates[di];
            const nextDate = pool.dates[di + 1];
            const affected = !from || asOf >= from || (nextDate !== undefined && nextDate >= from);
            if (!affected) continue; // copied below
            const snap = computeSnapshot({
              asOf,
              season: pool.season,
              view,
              officialEventDefs: pool.officialDefs,
              poolDefs: pool.poolDefs,
              observationsByDef: byDef,
              params: p,
            });
            const failed = snap.diagnostics.filter((d) => !d.converged);
            if (failed.length) {
              failures.push(`${division}/${view}/${pool.season}@${asOf}: ${failed.map((f) => f.eventDefId).join(", ")}`);
            }
            // The snapshot just before `from` is recomputed only to seed
            // change attribution; its stored copy comes from the prior build.
            if (from && asOf < from) {
              prev = snap;
              continue;
            }
            const month = Number(asOf.slice(5, 7));
            const isFinal = di === pool.dates.length - 1;
            const isMonthEnd = !nextDate || nextDate.slice(5, 7) !== asOf.slice(5, 7);
            const detail = isFinal || (isMonthEnd && detailMonths.has(month));
            writeSnapshot({
              snap,
              prev,
              pool,
              view,
              M,
              detail,
              buildId,
              p,
              stateOf,
              ins: { insSnap, insOverall, insEvent, insField },
              db,
            });
            snapshotsComputed++;
            prev = snap;
          }
        }
      }
      log(`build ${buildId}: ${view} view computed (${snapshotsComputed} snapshots so far)`);
    }
    if (failures.length) {
      throw new Error(`Fits failed to converge; build not published: ${failures.slice(0, 5).join("; ")}`);
    }

    // Copy unaffected snapshots (as_of before `from`) from the published build.
    if (from && prevBuild) {
      snapshotsCopied = copySnapshots(db, prevBuild, buildId, from);
    }
    computeFieldStrength(db, buildId);

    // Atomic publish.
    s.transaction(() => {
      s.prepare(`UPDATE rating_builds SET status='retired' WHERE status='published'`).run();
      s.prepare(`UPDATE rating_builds SET status='published', finished_at=?, summary=? WHERE id=?`).run(
        new Date().toISOString(),
        JSON.stringify({ snapshotsComputed, snapshotsCopied }),
        buildId,
      );
      s.prepare(`INSERT INTO kv (key, value) VALUES ('published_build_id', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
        String(buildId),
      );
      s.prepare(`INSERT INTO kv (key, value) VALUES ('last_rating_build', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
        new Date().toISOString(),
      );
      s.prepare(`DELETE FROM kv WHERE key='pending_rebuild_from'`).run();
      s.prepare(`INSERT INTO publish_log (build_id, published_at, source_revision, note) VALUES (?, ?, ?, ?)`).run(
        buildId,
        new Date().toISOString(),
        sourceRevision,
        from ? `recomputed from ${from}` : "full rebuild",
      );
    })();
    // Keep the previous build one cycle for in-flight requests; drop older ones.
    pruneBuilds(db, buildId, prevBuild);
    log(`build ${buildId} published: ${snapshotsComputed} computed, ${snapshotsCopied} copied`);
    return { buildId, snapshotsComputed, snapshotsCopied };
  } catch (e) {
    s.prepare(`UPDATE rating_builds SET status='failed', finished_at=?, summary=? WHERE id=?`).run(
      new Date().toISOString(),
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      buildId,
    );
    deleteBuildRows(db, buildId);
    throw e;
  }
}

export function planPools(db: DB): PoolSpec[] {
  const s = db.$client;
  const meta = s.prepare(`SELECT division, season FROM event_metadata`).all() as { division: string; season: number }[];
  const seasons = s
    .prepare(`SELECT DISTINCT division, season FROM tournaments WHERE rating_eligible=1 ORDER BY division, season`)
    .all() as { division: string; season: number }[];
  const out: PoolSpec[] = [];
  for (const { division, season } of seasons) {
    if (!meta.some((m) => m.division === division && m.season === season)) continue;
    const defs = s
      .prepare(`SELECT id, equivalence_group AS grp FROM event_definitions WHERE division=? AND season=? AND official=1 ORDER BY name`)
      .all(division, season) as { id: string; grp: string | null }[];
    const poolDefs = new Map<string, string[]>();
    for (const d of defs) {
      const members = d.grp
        ? (s.prepare(`SELECT id FROM event_definitions WHERE equivalence_group=? AND division=?`).all(d.grp, division) as { id: string }[]).map(
            (r) => r.id,
          )
        : [d.id];
      poolDefs.set(d.id, members);
    }
    const ends = (
      s.prepare(`SELECT end_date FROM tournaments WHERE division=? AND season=? AND rating_eligible=1`).all(division, season) as {
        end_date: string;
      }[]
    ).map((r) => r.end_date);
    out.push({ division, season, officialDefs: defs.map((d) => d.id), poolDefs, dates: snapshotDates(ends) });
  }
  return out;
}

export function loadObservations(db: DB, division: string, view: RatingView): Map<string, PoolObservation[]> {
  const rows = db.$client
    .prepare(
      `SELECT entity_id AS entityId, tournament_event_id AS fieldId, tournament_id AS tournamentId, event_def_id AS eventDefId,
              season AS defSeason, end_date AS endDate, n_schools AS nSchools, x, format
       FROM observations WHERE division=? AND view=? ORDER BY end_date, tournament_event_id, entity_id`,
    )
    .all(division, view) as PoolObservation[];
  const byDef = new Map<string, PoolObservation[]>();
  for (const r of rows) {
    let arr = byDef.get(r.eventDefId);
    if (!arr) byDef.set(r.eventDefId, (arr = []));
    arr.push(r);
  }
  return byDef;
}

function writeSnapshot(a: {
  snap: SnapshotResult;
  prev: SnapshotResult | null;
  pool: PoolSpec;
  view: RatingView;
  M: number;
  detail: boolean;
  buildId: number;
  p: ModelParams;
  stateOf: (v: RatingView, id: string) => string | null;
  ins: {
    insSnap: import("better-sqlite3").Statement;
    insOverall: import("better-sqlite3").Statement;
    insEvent: import("better-sqlite3").Statement;
    insField: import("better-sqlite3").Statement;
  };
  db: DB;
}) {
  const { snap, prev, pool, view, M, p } = a;
  const rows = [...snap.overall.values()].filter((o) => o.hasCurrentSeason);
  const withStatus = rows.map((o) => ({ o, status: ratingStatus(o, M, snap.asOf, p), state: a.stateOf(view, o.entityId) }));
  const established = withStatus.filter((r) => r.status === "established").sort((x, y) => y.o.z - x.o.z || (x.o.entityId < y.o.entityId ? -1 : 1));
  const nationalRank = new Map<string, number>();
  established.forEach((r, i) => {
    const prevRow = established[i - 1];
    nationalRank.set(r.o.entityId, prevRow && prevRow.o.z === r.o.z ? nationalRank.get(prevRow.o.entityId)! : i + 1);
  });
  const stateRank = new Map<string, number>();
  const byState = new Map<string, typeof established>();
  for (const r of established) {
    const k = r.state ?? "";
    let arr = byState.get(k);
    if (!arr) byState.set(k, (arr = []));
    arr.push(r);
  }
  for (const arr of byState.values()) arr.forEach((r, i) => stateRank.set(r.o.entityId, i + 1));

  const excluded = {
    provisional: withStatus.filter((r) => r.status === "provisional").length,
    inactive: withStatus.filter((r) => r.status === "inactive").length,
    belowEventCoverage: withStatus.filter((r) => r.o.comparableEvents < Math.ceil(M * p.minComparableEventFraction)).length,
    belowTournamentCount: withStatus.filter((r) => r.o.tournaments < p.minTournaments).length,
    priorSeasonOnly: snap.overall.size - rows.length,
  };
  const newTournaments = (entityId: string) => {
    const set = new Set<string>();
    for (const st of snap.events.values()) {
      const before = prev?.events.get(st.eventDefId)?.own.get(entityId);
      const prevFields = new Set((before ?? []).map((o) => o.fieldId));
      for (const o of st.own.get(entityId) ?? []) if (!prevFields.has(o.fieldId)) set.add(o.tournamentId);
    }
    return [...set];
  };

  const s = a.db.$client;
  s.transaction(() => {
    const snapshotId = Number(
      a.ins.insSnap.run(
        a.buildId,
        pool.division,
        view,
        pool.season,
        snap.asOf,
        M,
        rows.length,
        established.length,
        JSON.stringify(excluded),
        a.detail ? 1 : 0,
        JSON.stringify(snap.diagnostics),
        new Date().toISOString(),
      ).lastInsertRowid,
    );
    for (const { o, status, state } of withStatus) {
      const att = attributeChange(o.entityId, prev, snap, pool.officialDefs, view, p);
      // Compact: [eventDefId, added, recency, field, other] for the 3 largest moves.
      const r5 = (v: number) => Number(v.toPrecision(4));
      const top = att.events
        .map((e) => ({ e, total: e.added + e.recency + e.field + e.other }))
        .filter((x) => Math.abs(x.total) > 1e-6)
        .sort((x, y) => Math.abs(y.total) - Math.abs(x.total))
        .slice(0, 3)
        .map(({ e }) => [e.eventDefId, r5(e.added), r5(e.recency), r5(e.field), r5(e.other)]);
      a.ins.insOverall.run(
        snapshotId,
        o.entityId,
        o.z,
        o.usr,
        status,
        nationalRank.get(o.entityId) ?? null,
        stateRank.get(o.entityId) ?? null,
        state,
        o.comparableEvents,
        o.observedEvents,
        o.tournaments,
        o.observations,
        o.lastCompetition,
        att.prevZ,
        att.dAdded,
        att.dRecency,
        att.dField,
        att.dOther,
        JSON.stringify({ e: top, t: newTournaments(o.entityId) }),
      );
    }
    if (a.detail) {
      const current = new Set(rows.map((r) => r.entityId));
      const byEvent = new Map<string, typeof snap.eventRatings>();
      for (const r of snap.eventRatings) {
        if (!current.has(r.entityId)) continue;
        let arr = byEvent.get(r.eventDefId);
        if (!arr) byEvent.set(r.eventDefId, (arr = []));
        arr.push(r);
      }
      for (const arr of byEvent.values()) {
        const ranked = arr.filter((r) => r.component === 0).sort((x, y) => y.value - x.value || (x.entityId < y.entityId ? -1 : 1));
        const rank = new Map(ranked.map((r, i) => [r.entityId, i + 1]));
        for (const r of arr) {
          a.ins.insEvent.run(
            snapshotId,
            r.entityId,
            r.eventDefId,
            r.value,
            r.skill,
            toUsr(r.value, p.scaleMax, p.scaleSpread),
            r.appearances,
            r.uniqueOpponents,
            r.nEff,
            r.lastDate,
            r.shrinkage,
            r.component,
            r.weak ? 1 : 0,
            rank.get(r.entityId) ?? null,
            r.evidence,
          );
        }
      }
      for (const f of snap.fieldFits) a.ins.insField.run(snapshotId, f.fieldId, f.k, f.weight, f.n);
    }
  })();
}

function copySnapshots(db: DB, fromBuild: number, toBuild: number, before: string): number {
  const s = db.$client;
  const snaps = s.prepare(`SELECT * FROM snapshots WHERE build_id=? AND as_of < ?`).all(fromBuild, before) as Record<string, unknown>[];
  s.transaction(() => {
    for (const sn of snaps) {
      const newId = Number(
        s
          .prepare(
            `INSERT INTO snapshots (build_id, division, view, season, as_of, official_events, entity_count, established_count, excluded_counts,
              has_event_detail, diagnostics, computed_at) SELECT ?, division, view, season, as_of, official_events, entity_count, established_count,
              excluded_counts, has_event_detail, diagnostics, computed_at FROM snapshots WHERE id=?`,
          )
          .run(toBuild, sn.id).lastInsertRowid,
      );
      s.prepare(
        `INSERT INTO overall_ratings SELECT ?, entity_id, z, usr, status, national_rank, state_rank, state, comparable_events, observed_events,
          tournaments, observations, last_competition, prev_z, d_added, d_recency, d_field, d_other, explain, event_vector
         FROM overall_ratings WHERE snapshot_id=?`,
      ).run(newId, sn.id);
      s.prepare(
        `INSERT INTO event_ratings SELECT ?, entity_id, event_def_id, value, skill, usr, appearances, unique_opponents, n_eff, last_date,
          shrinkage, component, weak, event_rank, evidence FROM event_ratings WHERE snapshot_id=?`,
      ).run(newId, sn.id);
      s.prepare(`INSERT INTO field_fits SELECT ?, tournament_event_id, k, weight, n FROM field_fits WHERE snapshot_id=?`).run(newId, sn.id);
    }
  })();
  return snaps.length;
}

/**
 * Pre-tournament field strength: ratings from the latest snapshot strictly
 * before the tournament's start date (no post-tournament information).
 */
function computeFieldStrength(db: DB, buildId: number) {
  const s = db.$client;
  const tournaments = s.prepare(`SELECT id, division, season, start_date FROM tournaments`).all() as {
    id: string;
    division: string;
    season: number;
    start_date: string;
  }[];
  const ins = s.prepare(
    `INSERT INTO field_strength (build_id, tournament_id, view, pre_snapshot_as_of, entries, rated, established, mean_usr, top5_mean_usr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findSnap = s.prepare(
    `SELECT id, as_of FROM snapshots WHERE build_id=? AND division=? AND view=? AND season=? AND as_of < ? ORDER BY as_of DESC LIMIT 1`,
  );
  s.transaction(() => {
    for (const t of tournaments) {
      for (const view of ["team", "school"] as RatingView[]) {
        const entities =
          view === "team"
            ? (s
                .prepare(`SELECT DISTINCT team_season_id AS id FROM entries WHERE tournament_id=? AND exhibition=0`)
                .all(t.id) as { id: string | null }[])
            : (s.prepare(`SELECT DISTINCT school_id AS id FROM entries WHERE tournament_id=? AND exhibition=0`).all(t.id) as {
                id: string | null;
              }[]);
        const total = view === "team" ? (s.prepare(`SELECT COUNT(*) c FROM entries WHERE tournament_id=? AND exhibition=0`).get(t.id) as { c: number }).c : entities.length;
        const snap = findSnap.get(buildId, t.division, view, t.season, t.start_date) as { id: number; as_of: string } | undefined;
        if (!snap) {
          ins.run(buildId, t.id, view, null, total, 0, 0, null, null);
          continue;
        }
        const ids = entities.map((e) => e.id).filter((x): x is string => Boolean(x));
        const ratings: { usr: number; status: string }[] = [];
        const q = s.prepare(`SELECT usr, status FROM overall_ratings WHERE snapshot_id=? AND entity_id=?`);
        for (const id of ids) {
          const r = q.get(snap.id, id) as { usr: number; status: string } | undefined;
          if (r) ratings.push(r);
        }
        const est = ratings.filter((r) => r.status === "established").map((r) => r.usr).sort((a, b) => b - a);
        const mean = est.length ? est.reduce((a, b) => a + b, 0) / est.length : null;
        const top5 = est.length >= 5 ? est.slice(0, 5).reduce((a, b) => a + b, 0) / 5 : null;
        ins.run(buildId, t.id, view, snap.as_of, total, ratings.length, est.length, mean, top5);
      }
    }
  })();
}

function deleteBuildRows(db: DB, buildId: number) {
  const s = db.$client;
  s.transaction(() => {
    const ids = `SELECT id FROM snapshots WHERE build_id=${Number(buildId)}`;
    s.prepare(`DELETE FROM overall_ratings WHERE snapshot_id IN (${ids})`).run();
    s.prepare(`DELETE FROM event_ratings WHERE snapshot_id IN (${ids})`).run();
    s.prepare(`DELETE FROM field_fits WHERE snapshot_id IN (${ids})`).run();
    s.prepare(`DELETE FROM snapshots WHERE build_id=?`).run(buildId);
    s.prepare(`DELETE FROM field_strength WHERE build_id=?`).run(buildId);
  })();
}

function pruneBuilds(db: DB, keep: number, keepPrev: number | null) {
  const s = db.$client;
  const old = s
    .prepare(`SELECT id FROM rating_builds WHERE id NOT IN (?, ?) AND status IN ('retired','failed')`)
    .all(keep, keepPrev ?? -1) as { id: number }[];
  for (const b of old) deleteBuildRows(db, b.id);
}
