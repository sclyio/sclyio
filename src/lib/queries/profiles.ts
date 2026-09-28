import "server-only";
import type { RatingView } from "../rating/config";
import { buildId, entityLabel, eventNames, officialEvents, snapshotsFor, sql, type EntityLabel } from "./common";

export interface HistoryPoint {
  asOf: string;
  snapshotId: number;
  hasDetail: boolean;
  usr: number | null;
  z: number | null;
  status: string | null;
  nationalRank: number | null;
  stateRank: number | null;
  comparableEvents: number | null;
  tournaments: number | null;
  prevZ: number | null;
  dAdded: number | null;
  dRecency: number | null;
  dField: number | null;
  dOther: number | null;
  explain: { e: [string, number, number, number, number][]; t: string[] } | null;
}

export function history(view: RatingView, entityId: string, division: string, season: number): HistoryPoint[] {
  const snaps = snapshotsFor(division, view, season);
  const q = sql().prepare(`SELECT * FROM overall_ratings WHERE snapshot_id=? AND entity_id=?`);
  return snaps.map((s) => {
    const o = q.get(s.id, entityId) as Record<string, unknown> | undefined;
    return {
      asOf: s.as_of,
      snapshotId: s.id,
      hasDetail: Boolean(s.has_event_detail),
      usr: (o?.usr as number) ?? null,
      z: (o?.z as number) ?? null,
      status: (o?.status as string) ?? null,
      nationalRank: (o?.national_rank as number) ?? null,
      stateRank: (o?.state_rank as number) ?? null,
      comparableEvents: (o?.comparable_events as number) ?? null,
      tournaments: (o?.tournaments as number) ?? null,
      prevZ: (o?.prev_z as number) ?? null,
      dAdded: (o?.d_added as number) ?? null,
      dRecency: (o?.d_recency as number) ?? null,
      dField: (o?.d_field as number) ?? null,
      dOther: (o?.d_other as number) ?? null,
      explain: o?.explain ? JSON.parse(o.explain as string) : null,
    };
  });
}

export interface AppearanceRow {
  tournamentId: string;
  tournamentName: string;
  level: string;
  startDate: string;
  endDate: string;
  resultUrl: string;
  entryId: string;
  number: number;
  rank: number | null;
  points: number | null;
  fieldSize: number;
  track: string | null;
  trackRank: number | null;
  exhibition: boolean;
  penaltyPoints: number;
  ratingEligible: boolean;
  exclusionReason: string | null;
  designation: string | null;
  resolution: string;
  before: HistoryPoint | null;
  after: HistoryPoint | null;
}

function attachRefits<T extends { startDate: string; endDate: string }>(rows: T[], hist: HistoryPoint[]) {
  return rows.map((r) => {
    const before = [...hist].reverse().find((h) => h.asOf < r.startDate && h.usr !== null) ?? null;
    const after = hist.find((h) => h.asOf >= r.endDate && h.usr !== null) ?? null;
    return { ...r, before, after };
  });
}

export function teamAppearances(teamSeasonId: string, hist: HistoryPoint[]): AppearanceRow[] {
  const rows = sql()
    .prepare(
      `SELECT t.id, t.name, t.level, t.start_date, t.end_date, t.result_url, t.rating_eligible, t.exclusion_reason,
              e.id AS entry_id, e.number, e.rank, e.points, e.track, e.track_rank, e.exhibition, e.penalty_points, e.raw_suffix, e.resolution,
              (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = t.id AND x.exhibition = 0) AS field
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id
       WHERE e.team_season_id = ? ORDER BY t.start_date, t.id`,
    )
    .all(teamSeasonId) as Record<string, unknown>[];
  return attachRefits(
    rows.map((r) => ({
      tournamentId: r.id as string,
      tournamentName: r.name as string,
      level: r.level as string,
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      resultUrl: r.result_url as string,
      entryId: r.entry_id as string,
      number: r.number as number,
      rank: r.rank as number | null,
      points: r.points as number | null,
      fieldSize: r.field as number,
      track: r.track as string | null,
      trackRank: r.track_rank as number | null,
      exhibition: Boolean(r.exhibition),
      penaltyPoints: r.penalty_points as number,
      ratingEligible: Boolean(r.rating_eligible),
      exclusionReason: r.exclusion_reason as string | null,
      designation: r.raw_suffix as string | null,
      resolution: r.resolution as string,
    })),
    hist,
  );
}

export interface EventBreakdownRow {
  eventDefId: string;
  name: string;
  rating: {
    usr: number;
    value: number;
    skill: number;
    appearances: number;
    uniqueOpponents: number;
    nEff: number;
    lastDate: string;
    shrinkage: number;
    component: number;
    weak: boolean;
    eventRank: number | null;
    evidence: string;
  } | null;
  results: {
    tournamentId: string;
    tournamentName: string;
    endDate: string;
    status: string;
    place: number | null;
    tie: boolean;
    dropped: boolean;
    points: number | null;
    modelRank: number | null;
    n: number | null;
    x: number | null;
    note: string | null;
    trial: boolean;
    fieldId: string;
    viaEntry?: string | null;
  }[];
  rankedCount: number;
}

/** Event breakdown at the latest snapshot that stores event detail on or before asOf. */
export function eventBreakdown(
  view: RatingView,
  entityId: string,
  division: string,
  season: number,
  snapshotId: number | null,
): EventBreakdownRow[] {
  const db = sql();
  const names = eventNames();
  const official = officialEvents(division, season);
  const ratings = new Map(
    snapshotId
      ? (db.prepare(`SELECT * FROM event_ratings WHERE snapshot_id=? AND entity_id=?`).all(snapshotId, entityId) as Record<string, unknown>[]).map(
          (r) => [r.event_def_id as string, r],
        )
      : [],
  );
  const counts = new Map(
    snapshotId
      ? (
          db
            .prepare(`SELECT event_def_id, COUNT(*) c FROM event_ratings WHERE snapshot_id=? AND event_rank IS NOT NULL GROUP BY event_def_id`)
            .all(snapshotId) as { event_def_id: string; c: number }[]
        ).map((r) => [r.event_def_id, r.c])
      : [],
  );
  // Official results (all statuses) for this entity's entries.
  const entryFilter = view === "team" ? `e.team_season_id = @id` : `e.school_id = @id AND t.division = @div AND t.season IN (@season, @season - 1)`;
  const results = db
    .prepare(
      `SELECT te.event_def_id, te.name AS event_name, te.trial, te.trialed, te.model_eligible, te.model_note, te.id AS field_id,
              t.id AS tid, t.name AS tname, t.end_date, r.status, r.place, r.tie, r.dropped, r.points, e.id AS entry_id, e.exhibition,
              e.raw_suffix, e.resolution
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id
       JOIN event_results r ON r.tournament_id = e.tournament_id AND r.entry_id = e.id
       JOIN tournament_events te ON te.id = r.tournament_event_id
       WHERE ${entryFilter}
       ORDER BY t.end_date`,
    )
    .all({ id: entityId, div: division, season }) as Record<string, unknown>[];
  const obs = new Map(
    (
      db.prepare(`SELECT tournament_event_id, model_rank, n, x, source_entry_id FROM observations WHERE view=? AND entity_id=?`).all(view, entityId) as {
        tournament_event_id: string;
        model_rank: number;
        n: number;
        x: number;
        source_entry_id: string;
      }[]
    ).map((o) => [o.tournament_event_id, o]),
  );
  // Map prior-season equivalent defs onto the target season's official def.
  const equivalents = new Map<string, string>();
  for (const ev of official) {
    equivalents.set(ev.id, ev.id);
    if (ev.equivalence_group) {
      for (const d of db.prepare(`SELECT id FROM event_definitions WHERE equivalence_group=?`).all(ev.equivalence_group) as { id: string }[]) {
        equivalents.set(d.id, ev.id);
      }
    }
  }
  const byDef = new Map<string, EventBreakdownRow["results"]>();
  const extra = new Map<string, EventBreakdownRow["results"]>();
  for (const r of results) {
    const def = r.event_def_id as string;
    const target = equivalents.get(def);
    // School view: keep only the selected (superscore) entry's result per field.
    const o = obs.get(r.field_id as string);
    if (view === "school" && o && o.source_entry_id !== r.entry_id) continue;
    if (view === "school" && !o && r.status === "placed" && r.model_eligible) continue;
    const reason = !r.model_eligible
      ? (r.model_note as string) ?? "Not rated"
      : r.exhibition
        ? "Exhibition entry"
        : r.resolution === "unresolved" && view === "team"
          ? "Unresolved identity"
          : r.status !== "placed"
            ? r.status === "participation_only"
              ? "Participation only — not a comparative result"
              : `${String(r.status).replace("_", " ")} — excluded from rating`
            : !o
              ? "Not a rating observation"
              : (r.model_note as string | null);
    const row = {
      tournamentId: r.tid as string,
      tournamentName: r.tname as string,
      endDate: r.end_date as string,
      status: r.status as string,
      place: r.place as number | null,
      tie: Boolean(r.tie),
      dropped: Boolean(r.dropped),
      points: r.points as number | null,
      modelRank: o?.model_rank ?? null,
      n: o?.n ?? null,
      x: o?.x ?? null,
      note: reason,
      trial: Boolean(r.trial || r.trialed),
      fieldId: r.field_id as string,
      viaEntry: view === "school" ? ((r.raw_suffix as string | null) ?? "") : null,
    };
    const m = target ? byDef : extra;
    const key = target ?? (r.event_name as string);
    let arr = m.get(key);
    if (!arr) m.set(key, (arr = []));
    arr.push(row);
  }
  const out: EventBreakdownRow[] = official.map((ev) => {
    const r = ratings.get(ev.id);
    return {
      eventDefId: ev.id,
      name: ev.name,
      rankedCount: counts.get(ev.id) ?? 0,
      rating: r
        ? {
            usr: r.usr as number,
            value: r.value as number,
            skill: r.skill as number,
            appearances: r.appearances as number,
            uniqueOpponents: r.unique_opponents as number,
            nEff: r.n_eff as number,
            lastDate: r.last_date as string,
            shrinkage: r.shrinkage as number,
            component: r.component as number,
            weak: Boolean(r.weak),
            eventRank: r.event_rank as number | null,
            evidence: r.evidence as string,
          }
        : null,
      results: byDef.get(ev.id) ?? [],
    };
  });
  for (const [name, rows] of extra) {
    out.push({ eventDefId: `other:${name}`, name, rating: null, results: rows, rankedCount: 0 });
  }
  void names;
  return out;
}

export function detailSnapshotId(hist: HistoryPoint[]): number | null {
  const withRating = hist.filter((h) => h.hasDetail && h.usr !== null);
  return withRating.length ? withRating[withRating.length - 1].snapshotId : null;
}

export function teamSeason(id: string): (EntityLabel & { mappingNote: string | null }) | null {
  const l = entityLabel("team", id);
  if (!l) return null;
  const r = sql().prepare(`SELECT mapping_note FROM team_seasons WHERE id=?`).get(id) as { mapping_note: string | null };
  return { ...l, mappingNote: r.mapping_note };
}

export function correctionsFor(tournamentIds: string[]) {
  if (!tournamentIds.length) return [];
  const ph = tournamentIds.map(() => "?").join(",");
  return sql()
    .prepare(
      `SELECT c.file_id, c.change, c.detail, r.started_at FROM import_changes c JOIN import_runs r ON r.id = c.run_id
       WHERE c.file_id IN (${ph}) AND c.change IN ('changed','removed') ORDER BY r.started_at DESC`,
    )
    .all(...tournamentIds) as { file_id: string; change: string; detail: string | null; started_at: string }[];
}

export function schoolProfile(id: string) {
  const db = sql();
  const school = entityLabel("school", id);
  if (!school) return null;
  const teams = db
    .prepare(
      `SELECT ts.id, ts.division, ts.season, ts.display_designation AS designation, ts.mapping_note,
              (SELECT COUNT(*) FROM entries e WHERE e.team_season_id = ts.id) AS appearances
       FROM team_seasons ts WHERE ts.school_id=? ORDER BY ts.season DESC, ts.division, ts.designation`,
    )
    .all(id) as { id: string; division: string; season: number; designation: string; mapping_note: string | null; appearances: number }[];
  const build = buildId();
  const latestTeam = db.prepare(
    `SELECT o.usr, o.status, o.national_rank, o.comparable_events, s.as_of, s.official_events FROM snapshots s
     JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ?
     WHERE s.build_id=? AND s.division=? AND s.view=? AND s.season=? ORDER BY s.as_of DESC LIMIT 1`,
  );
  const teamRows = teams.map((t) => ({
    ...t,
    rating: latestTeam.get(t.id, build, t.division, "team", t.season) as
      | { usr: number; status: string; national_rank: number | null; comparable_events: number; as_of: string; official_events: number }
      | undefined,
  }));
  const pools = db
    .prepare(
      `SELECT DISTINCT t.division, t.season FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id=? ORDER BY t.season DESC, t.division`,
    )
    .all(id) as { division: string; season: number }[];
  const potential = pools.map((p) => ({
    ...p,
    rating: latestTeam.get(id, build, p.division, "school", p.season) as
      | { usr: number; status: string; national_rank: number | null; comparable_events: number; as_of: string; official_events: number }
      | undefined,
  }));
  const unresolved = db
    .prepare(
      `SELECT e.id, e.tournament_id, t.name, t.end_date, t.division, e.number, e.raw_suffix, e.rank, e.resolution_reason
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id=? AND e.resolution='unresolved' ORDER BY t.end_date DESC`,
    )
    .all(id) as Record<string, unknown>[];
  const appearances = db
    .prepare(
      `SELECT t.id, t.name, t.level, t.division, t.season, t.end_date, COUNT(*) AS entries, MIN(e.rank) AS best_rank,
              (SELECT COUNT(*) FROM entries x WHERE x.tournament_id=t.id AND x.exhibition=0) AS field
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id=? GROUP BY t.id ORDER BY t.end_date DESC`,
    )
    .all(id) as Record<string, unknown>[];
  return { school, teams: teamRows, potential, unresolved, appearances };
}
