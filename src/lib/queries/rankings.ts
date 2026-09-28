import "server-only";
import type { RatingView } from "../rating/config";
import { addDays } from "../rating/math";
import { normQuery, officialEvents, pickSnapshot, seasonsFor, snapshotsFor, sql, type SnapshotRow } from "./common";

export type SortKey = "rank" | "usr" | "change" | "tournaments" | "last" | "name";
export type StatusFilter = "established" | "provisional" | "inactive" | "all";
export type Period = "1w" | "4w" | "season";

export interface RankingsParams {
  division: "B" | "C";
  view: RatingView;
  season?: number;
  asOf?: string;
  mode: "overall" | "event";
  event?: string;
  state?: string;
  level?: string;
  status: StatusFilter;
  q?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  onePerSchool: boolean;
  period: Period;
}

export const PAGE_SIZE = 50;

export interface RankingRow {
  entityId: string;
  schoolId: string;
  schoolName: string;
  city: string | null;
  state: string | null;
  designation: string | null;
  usr: number;
  z: number;
  status: string;
  nationalRank: number | null;
  stateRank: number | null;
  prevUsr: number | null;
  tournaments: number;
  comparableEvents: number;
  lastCompetition: string | null;
  // event mode
  eventRank?: number | null;
  appearances?: number;
  nEff?: number;
  evidence?: string;
  component?: number;
}

export interface RankingsResult {
  snapshot: SnapshotRow | null;
  snapshots: SnapshotRow[];
  seasons: number[];
  season: number | null;
  compareSnapshot: SnapshotRow | null;
  rows: RankingRow[];
  total: number;
  eventDetailUnavailable: boolean;
}

export function getRankings(p: RankingsParams): RankingsResult {
  const seasons = seasonsFor(p.division);
  const season = p.season && seasons.includes(p.season) ? p.season : (seasons[0] ?? null);
  if (season === null) {
    return { snapshot: null, snapshots: [], seasons, season, compareSnapshot: null, rows: [], total: 0, eventDetailUnavailable: false };
  }
  if (p.mode === "event") {
    const evs = officialEvents(p.division, season);
    if (!p.event || !evs.some((e) => e.id === p.event)) p = { ...p, event: evs[0]?.id };
  }
  const snaps = snapshotsFor(p.division, p.view, season);
  const snapshot = pickSnapshot(snaps, p.asOf, p.mode === "event");
  if (!snapshot) {
    return { snapshot: null, snapshots: snaps, seasons, season, compareSnapshot: null, rows: [], total: 0, eventDetailUnavailable: p.mode === "event" };
  }
  const eventDetailUnavailable = p.mode === "event" && Boolean(p.asOf) && snapshot.as_of !== pickSnapshot(snaps, p.asOf)?.as_of;

  // Comparison snapshot for the change column.
  const target =
    p.period === "1w" ? addDays(snapshot.as_of, -7) : p.period === "4w" ? addDays(snapshot.as_of, -28) : null;
  const compareSnapshot =
    p.period === "season"
      ? snaps[0].id !== snapshot.id
        ? snaps[0]
        : null
      : (snaps.filter((s) => s.as_of <= target!).pop() ?? null);

  const team = p.view === "team";
  const joins = team
    ? `JOIN team_seasons ts ON ts.id = o.entity_id JOIN schools sc ON sc.id = ts.school_id`
    : `JOIN schools sc ON sc.id = o.entity_id`;
  const where: string[] = [`o.snapshot_id = @snap`];
  const args: Record<string, unknown> = { snap: snapshot.id, prev: compareSnapshot?.id ?? -1 };
  if (p.state) {
    where.push(`o.state = @state`);
    args.state = p.state;
  }
  if (p.status !== "all") {
    where.push(`o.status = @status`);
    args.status = p.status;
  }
  if (p.q) {
    const nq = normQuery(p.q);
    if (nq) {
      where.push(team ? `(sc.search_text LIKE @q OR lower(ts.display_designation) LIKE @q)` : `sc.search_text LIKE @q`);
      args.q = `%${nq}%`;
    }
  }
  if (p.level) {
    args.level = p.level;
    args.asOf = snapshot.as_of;
    args.div = p.division;
    args.season = season;
    where.push(
      team
        ? `EXISTS (SELECT 1 FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.team_season_id = o.entity_id AND t.level = @level AND t.end_date <= @asOf)`
        : `EXISTS (SELECT 1 FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.school_id = o.entity_id AND t.division = @div AND t.season = @season AND t.level = @level AND t.end_date <= @asOf)`,
    );
  }

  let base: string;
  if (p.mode === "event" && p.event) {
    args.event = p.event;
    base = `SELECT o.entity_id, sc.id AS school_id, sc.name, sc.city, o.state, ${team ? "ts.display_designation" : "NULL"} AS designation,
        er.usr, er.value AS z, o.status, o.national_rank, o.state_rank, pe.usr AS prev_usr, o.tournaments, o.comparable_events,
        er.last_date AS last_competition, er.event_rank, er.appearances, er.n_eff, er.evidence, er.component
      FROM event_ratings er
      JOIN overall_ratings o ON o.snapshot_id = er.snapshot_id AND o.entity_id = er.entity_id
      ${joins}
      LEFT JOIN event_ratings pe ON pe.snapshot_id = @prev AND pe.entity_id = er.entity_id AND pe.event_def_id = er.event_def_id
      WHERE er.snapshot_id = @snap AND er.event_def_id = @event AND ${where.join(" AND ")}`;
  } else {
    base = `SELECT o.entity_id, sc.id AS school_id, sc.name, sc.city, o.state, ${team ? "ts.display_designation" : "NULL"} AS designation,
        o.usr, o.z, o.status, o.national_rank, o.state_rank, po.usr AS prev_usr, o.tournaments, o.comparable_events, o.last_competition
        ${team && p.onePerSchool ? `, ROW_NUMBER() OVER (PARTITION BY ts.school_id ORDER BY (o.status = 'established') DESC, o.z DESC, o.entity_id) AS school_pick` : ""}
      FROM overall_ratings o ${joins}
      LEFT JOIN overall_ratings po ON po.snapshot_id = @prev AND po.entity_id = o.entity_id
      WHERE ${where.join(" AND ")}`;
  }
  const filtered = team && p.onePerSchool && p.mode !== "event" ? `SELECT * FROM (${base}) WHERE school_pick = 1` : `SELECT * FROM (${base})`;

  const dir = p.dir === "asc" ? "ASC" : "DESC";
  const rankCol = p.mode === "event" ? "event_rank" : "national_rank";
  const order: Record<SortKey, string> = {
    rank: `${rankCol} IS NULL, ${rankCol} ${p.dir === "desc" ? "DESC" : "ASC"}, z DESC`,
    usr: `z ${dir}, entity_id`,
    change: `(usr - prev_usr) IS NULL, (usr - prev_usr) ${dir}, z DESC`,
    tournaments: `tournaments ${dir}, z DESC`,
    last: `last_competition ${dir}, z DESC`,
    name: `name ${dir === "DESC" ? "DESC" : "ASC"}, designation`,
  };
  const db = sql();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM (${filtered})`).get(args) as { c: number }).c;
  const rows = db
    .prepare(`${filtered} ORDER BY ${order[p.sort]} LIMIT ${PAGE_SIZE} OFFSET ${(Math.max(1, p.page) - 1) * PAGE_SIZE}`)
    .all(args) as Record<string, unknown>[];
  return {
    snapshot,
    snapshots: snaps,
    seasons,
    season,
    compareSnapshot,
    total,
    eventDetailUnavailable,
    rows: rows.map((r) => ({
      entityId: r.entity_id as string,
      schoolId: r.school_id as string,
      schoolName: r.name as string,
      city: r.city as string | null,
      state: r.state as string | null,
      designation: r.designation as string | null,
      usr: r.usr as number,
      z: r.z as number,
      status: r.status as string,
      nationalRank: r.national_rank as number | null,
      stateRank: r.state_rank as number | null,
      prevUsr: r.prev_usr as number | null,
      tournaments: r.tournaments as number,
      comparableEvents: r.comparable_events as number,
      lastCompetition: r.last_competition as string | null,
      eventRank: r.event_rank as number | null | undefined,
      appearances: r.appearances as number | undefined,
      nEff: r.n_eff as number | undefined,
      evidence: r.evidence as string | undefined,
      component: r.component as number | undefined,
    })),
  };
}

export function levels(): string[] {
  return (sql().prepare(`SELECT DISTINCT level FROM tournaments ORDER BY level`).all() as { level: string }[]).map((r) => r.level);
}
