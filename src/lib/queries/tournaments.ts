import "server-only";
import { buildId, normQuery, sql } from "./common";

export interface TournamentListParams {
  q?: string;
  division?: string;
  season?: number;
  level?: string;
  state?: string;
  from?: string;
  to?: string;
  page: number;
}

export const T_PAGE = 40;

export function listTournaments(p: TournamentListParams) {
  const where: string[] = ["1=1"];
  const args: Record<string, unknown> = { build: buildId() };
  if (p.q) {
    where.push("t.search_text LIKE @q");
    args.q = `%${normQuery(p.q).replace(/ /g, "%")}%`;
  }
  if (p.division) {
    where.push("t.division = @division");
    args.division = p.division;
  }
  if (p.season) {
    where.push("t.season = @season");
    args.season = p.season;
  }
  if (p.level) {
    where.push("t.level = @level");
    args.level = p.level;
  }
  if (p.state) {
    where.push("t.state = @state");
    args.state = p.state;
  }
  if (p.from) {
    where.push("t.end_date >= @from");
    args.from = p.from;
  }
  if (p.to) {
    where.push("t.start_date <= @to");
    args.to = p.to;
  }
  const db = sql();
  const base = `FROM tournaments t LEFT JOIN field_strength f ON f.build_id=@build AND f.tournament_id=t.id AND f.view='team' WHERE ${where.join(" AND ")}`;
  const total = (db.prepare(`SELECT COUNT(*) c ${base}`).get(args) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.short_name, t.level, t.division, t.season, t.state, t.location, t.start_date, t.end_date,
              t.team_count, t.rating_eligible, t.preliminary, t.exclusion_reason, f.established, f.entries AS fs_entries, f.mean_usr
       ${base} ORDER BY t.end_date DESC, t.name LIMIT ${T_PAGE} OFFSET ${(Math.max(1, p.page) - 1) * T_PAGE}`,
    )
    .all(args) as Record<string, unknown>[];
  return { total, rows };
}

export function tournamentFilters() {
  const db = sql();
  return {
    seasons: (db.prepare(`SELECT DISTINCT season FROM tournaments ORDER BY season DESC`).all() as { season: number }[]).map((r) => r.season),
    levels: (db.prepare(`SELECT DISTINCT level FROM tournaments ORDER BY level`).all() as { level: string }[]).map((r) => r.level),
    states: (db.prepare(`SELECT DISTINCT state FROM tournaments WHERE state IS NOT NULL ORDER BY state`).all() as { state: string }[]).map((r) => r.state),
  };
}

export function tournamentDetail(id: string) {
  const db = sql();
  const t = db.prepare(`SELECT * FROM tournaments WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!t) return null;
  const source = db.prepare(`SELECT * FROM source_files WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  const events = db
    .prepare(`SELECT id, name, ordinal, trial, trialed, canceled, model_eligible, model_note, event_def_id FROM tournament_events WHERE tournament_id=? ORDER BY ordinal`)
    .all(id) as {
    id: string;
    name: string;
    ordinal: number;
    trial: number;
    trialed: number;
    canceled: number;
    model_eligible: number;
    model_note: string | null;
    event_def_id: string;
  }[];
  const entries = db
    .prepare(
      `SELECT e.*, sc.name AS school_name, sc.state AS school_state FROM entries e JOIN schools sc ON sc.id = e.school_id
       WHERE e.tournament_id=? ORDER BY e.rank IS NULL, e.rank, e.number`,
    )
    .all(id) as Record<string, unknown>[];
  const results = db
    .prepare(`SELECT entry_id, tournament_event_id, status, place, tie, exempt, dropped, points FROM event_results WHERE tournament_id=?`)
    .all(id) as {
    entry_id: string;
    tournament_event_id: string;
    status: string;
    place: number | null;
    tie: number;
    exempt: number;
    dropped: number;
    points: number | null;
  }[];
  const tracks = db.prepare(`SELECT * FROM tracks WHERE tournament_id=?`).all(id) as Record<string, unknown>[];
  const build = buildId();
  const strength = db.prepare(`SELECT * FROM field_strength WHERE build_id=? AND tournament_id=?`).all(build, id) as {
    view: string;
    pre_snapshot_as_of: string | null;
    entries: number;
    rated: number;
    established: number;
    mean_usr: number | null;
    top5_mean_usr: number | null;
  }[];
  // Retrospective field offsets from the season's final detail snapshot.
  const snap = db
    .prepare(
      `SELECT id, as_of FROM snapshots WHERE build_id=? AND division=? AND season=? AND view='team' AND has_event_detail=1 AND as_of >= ? ORDER BY as_of LIMIT 1`,
    )
    .get(build, t.division, t.season, t.end_date) as { id: number; as_of: string } | undefined;
  const k = snap
    ? new Map(
        (
          db
            .prepare(`SELECT tournament_event_id, k FROM field_fits WHERE snapshot_id=? AND tournament_event_id IN (SELECT id FROM tournament_events WHERE tournament_id=?)`)
            .all(snap.id, id) as { tournament_event_id: string; k: number }[]
        ).map((r) => [r.tournament_event_id, r.k]),
      )
    : new Map<string, number>();
  const penalties = db.prepare(`SELECT entry_id, points FROM penalties WHERE tournament_id=?`).all(id) as { entry_id: string; points: number }[];
  const changes = db
    .prepare(
      `SELECT c.change, c.detail, c.old_hash, c.new_hash, r.started_at FROM import_changes c JOIN import_runs r ON r.id=c.run_id WHERE c.file_id=? ORDER BY r.started_at DESC`,
    )
    .all(id) as Record<string, unknown>[];
  return { t, source, events, entries, results, tracks, strength, k, kSnapshot: snap?.as_of ?? null, penalties, changes };
}
