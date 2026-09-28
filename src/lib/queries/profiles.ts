import "server-only";
import type { RatingView } from "../rating/config";
import { all, buildId, entityLabel, get, officialEvents, type EntityLabel } from "./common";

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

/** Every refit of the pool, joined with this entity's rating (null before its first result). One query. */
export async function history(view: RatingView, entityId: string, division: string, season: number): Promise<HistoryPoint[]> {
  const rows = await all(
    `SELECT s.id AS sid, s.as_of, s.has_event_detail, o.usr, o.z, o.status, o.national_rank, o.state_rank, o.comparable_events,
            o.tournaments, o.prev_z, o.d_added, o.d_recency, o.d_field, o.d_other, o.explain
     FROM snapshots s LEFT JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ?
     WHERE s.build_id = ? AND s.division = ? AND s.view = ? AND s.season = ? ORDER BY s.as_of`,
    [entityId, await buildId(), division, view, season],
  );
  const n = (v: unknown) => (v === null || v === undefined ? null : (v as number));
  return rows.map((o) => ({
    asOf: o.as_of as string,
    snapshotId: o.sid as number,
    hasDetail: Boolean(o.has_event_detail),
    usr: n(o.usr),
    z: n(o.z),
    status: (o.status as string | null) ?? null,
    nationalRank: n(o.national_rank),
    stateRank: n(o.state_rank),
    comparableEvents: n(o.comparable_events),
    tournaments: n(o.tournaments),
    prevZ: n(o.prev_z),
    dAdded: n(o.d_added),
    dRecency: n(o.d_recency),
    dField: n(o.d_field),
    dOther: n(o.d_other),
    explain: o.explain ? JSON.parse(o.explain as string) : null,
  }));
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

export async function teamAppearances(teamSeasonId: string, hist: HistoryPoint[]): Promise<AppearanceRow[]> {
  const rows = await all(
      `SELECT t.id, t.name, t.level, t.start_date, t.end_date, t.result_url, t.rating_eligible, t.exclusion_reason,
              e.id AS entry_id, e.number, e.rank, e.points, e.track, e.track_rank, e.exhibition, e.penalty_points, e.raw_suffix, e.resolution,
              (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = t.id AND x.exhibition = 0) AS field
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id
       WHERE e.team_season_id = ? ORDER BY t.start_date, t.id`,
    [teamSeasonId],
  );
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
export async function eventBreakdown(
  view: RatingView,
  entityId: string,
  division: string,
  season: number,
  snapshotId: number | null,
): Promise<EventBreakdownRow[]> {
  // Official results (all statuses) for this entity's entries.
  const entryFilter =
    view === "team" ? `e.team_season_id = @id` : `e.school_id = @id AND t.division = @div AND t.season IN (@season, @season - 1)`;
  const [official, ratingRows, countRows, results, obsRows, equivRows] = await Promise.all([
    officialEvents(division, season),
    snapshotId ? all(`SELECT * FROM event_ratings WHERE snapshot_id = ? AND entity_id = ?`, [snapshotId, entityId]) : Promise.resolve([]),
    snapshotId
      ? all<{ event_def_id: string; c: number }>(
          `SELECT event_def_id, COUNT(*) AS c FROM event_ratings WHERE snapshot_id = ? AND event_rank IS NOT NULL GROUP BY event_def_id`,
          [snapshotId],
        )
      : Promise.resolve([]),
    all(
      `SELECT te.event_def_id, te.name AS event_name, te.trial, te.trialed, te.model_eligible, te.model_note, te.id AS field_id,
              t.id AS tid, t.name AS tname, t.end_date, r.status, r.place, r.tie, r.dropped, r.points, e.id AS entry_id, e.exhibition,
              e.raw_suffix, e.resolution
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id
       JOIN event_results r ON r.tournament_id = e.tournament_id AND r.entry_id = e.id
       JOIN tournament_events te ON te.id = r.tournament_event_id
       WHERE ${entryFilter}
       ORDER BY t.end_date`,
      { id: entityId, div: division, season },
    ),
    all<{ tournament_event_id: string; model_rank: number; n: number; x: number; source_entry_id: string }>(
      `SELECT tournament_event_id, model_rank, n, x, source_entry_id FROM observations WHERE view = ? AND entity_id = ?`,
      [view, entityId],
    ),
    all<{ id: string; equivalence_group: string }>(
      `SELECT d.id, d.equivalence_group FROM event_definitions d
       WHERE d.equivalence_group IN (SELECT equivalence_group FROM event_definitions WHERE division = ? AND season = ? AND official = 1)`,
      [division, season],
    ),
  ]);
  const ratings = new Map(ratingRows.map((r) => [r.event_def_id as string, r]));
  const counts = new Map(countRows.map((r) => [r.event_def_id, r.c]));
  const obs = new Map(obsRows.map((o) => [o.tournament_event_id, o]));
  // Map prior-season equivalent defs onto the target season's official def.
  const equivalents = new Map<string, string>();
  for (const ev of official) {
    equivalents.set(ev.id, ev.id);
    if (ev.equivalence_group) {
      for (const d of equivRows) if (d.equivalence_group === ev.equivalence_group) equivalents.set(d.id, ev.id);
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
  return out;
}

export function detailSnapshotId(hist: HistoryPoint[]): number | null {
  const withRating = hist.filter((h) => h.hasDetail && h.usr !== null);
  return withRating.length ? withRating[withRating.length - 1].snapshotId : null;
}

export async function teamSeason(id: string): Promise<(EntityLabel & { mappingNote: string | null }) | null> {
  const l = await entityLabel("team", id);
  if (!l) return null;
  const r = await get<{ mapping_note: string | null }>(`SELECT mapping_note FROM team_seasons WHERE id = ?`, [id]);
  return { ...l, mappingNote: r?.mapping_note ?? null };
}

export async function correctionsFor(tournamentIds: string[]) {
  if (!tournamentIds.length) return [];
  const ph = tournamentIds.map(() => "?").join(",");
  return all<{ file_id: string; change: string; detail: string | null; started_at: string }>(
    `SELECT c.file_id, c.change, c.detail, r.started_at FROM import_changes c JOIN import_runs r ON r.id = c.run_id
     WHERE c.file_id IN (${ph}) AND c.change IN ('changed','removed') ORDER BY r.started_at DESC`,
    tournamentIds,
  );
}

type LatestRating = { usr: number; status: string; national_rank: number | null; comparable_events: number; as_of: string; official_events: number };

export async function schoolProfile(id: string) {
  const school = await entityLabel("school", id);
  if (!school) return null;
  const build = await buildId();
  // Latest rating of each of this school's team-seasons and School Potential pools, in one query each.
  const [teams, pools, teamRatings, potentialRatings, unresolved, appearances] = await Promise.all([
    all<{ id: string; division: string; season: number; designation: string; mapping_note: string | null; appearances: number }>(
      `SELECT ts.id, ts.division, ts.season, ts.display_designation AS designation, ts.mapping_note,
              (SELECT COUNT(*) FROM entries e WHERE e.team_season_id = ts.id) AS appearances
       FROM team_seasons ts WHERE ts.school_id = ? ORDER BY ts.season DESC, ts.division, ts.designation`,
      [id],
    ),
    all<{ division: string; season: number }>(
      `SELECT DISTINCT t.division, t.season FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id = ? ORDER BY t.season DESC, t.division`,
      [id],
    ),
    all<LatestRating & { entity_id: string }>(
      `SELECT o.entity_id, o.usr, o.status, o.national_rank, o.comparable_events, s.as_of, s.official_events
       FROM team_seasons ts
       JOIN snapshots s ON s.build_id = ? AND s.division = ts.division AND s.view = 'team' AND s.season = ts.season
       JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ts.id
       WHERE ts.school_id = ? ORDER BY s.as_of`,
      [build, id],
    ),
    all<LatestRating & { division: string; season: number }>(
      `SELECT s.division, s.season, o.usr, o.status, o.national_rank, o.comparable_events, s.as_of, s.official_events
       FROM snapshots s JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ?
       WHERE s.build_id = ? AND s.view = 'school' ORDER BY s.as_of`,
      [id, build],
    ),
    all(
      `SELECT e.id, e.tournament_id, t.name, t.end_date, t.division, e.number, e.raw_suffix, e.rank, e.resolution_reason
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id = ? AND e.resolution = 'unresolved' ORDER BY t.end_date DESC`,
      [id],
    ),
    all(
      `SELECT t.id, t.name, t.level, t.division, t.season, t.end_date, COUNT(*) AS entries, MIN(e.rank) AS best_rank,
              (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = t.id AND x.exhibition = 0) AS field
       FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id = ? GROUP BY t.id ORDER BY t.end_date DESC`,
      [id],
    ),
  ]);
  // Rows are ordered by as_of, so the last write per key is the latest refit.
  const latestTeam = new Map<string, LatestRating>();
  for (const r of teamRatings) latestTeam.set(r.entity_id, r);
  const latestPotential = new Map<string, LatestRating>();
  for (const r of potentialRatings) latestPotential.set(`${r.division}-${r.season}`, r);
  return {
    school,
    teams: teams.map((t) => ({ ...t, rating: latestTeam.get(t.id) })),
    potential: pools.map((p) => ({ ...p, rating: latestPotential.get(`${p.division}-${p.season}`) })),
    unresolved,
    appearances,
  };
}
