import "server-only";
import type { InArgs } from "@libsql/client";
import { all, buildId, get, normQuery } from "./common";

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

export async function listTournaments(p: TournamentListParams) {
  const where: string[] = ["1=1"];
  const args: Record<string, string | number> = { build: await buildId() };
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
  const base = `FROM tournaments t LEFT JOIN field_strength f ON f.build_id = @build AND f.tournament_id = t.id AND f.view = 'team' WHERE ${where.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    get<{ c: number }>(`SELECT COUNT(*) AS c ${base}`, args as InArgs),
    all(
      `SELECT t.id, t.name, t.short_name, t.level, t.division, t.season, t.state, t.location, t.start_date, t.end_date,
              t.team_count, t.rating_eligible, t.preliminary, t.exclusion_reason, f.established, f.entries AS fs_entries, f.mean_usr
       ${base} ORDER BY t.end_date DESC, t.name LIMIT ${T_PAGE} OFFSET ${(Math.max(1, p.page) - 1) * T_PAGE}`,
      args as InArgs,
    ),
  ]);
  return { total: count?.c ?? 0, rows };
}

export async function tournamentFilters() {
  const [seasons, levels, states] = await Promise.all([
    all<{ season: number }>(`SELECT DISTINCT season FROM tournaments ORDER BY season DESC`),
    all<{ level: string }>(`SELECT DISTINCT level FROM tournaments ORDER BY level`),
    all<{ state: string }>(`SELECT DISTINCT state FROM tournaments WHERE state IS NOT NULL ORDER BY state`),
  ]);
  return { seasons: seasons.map((r) => r.season), levels: levels.map((r) => r.level), states: states.map((r) => r.state) };
}

export interface TEventRow {
  id: string;
  name: string;
  ordinal: number;
  trial: number;
  trialed: number;
  canceled: number;
  model_eligible: number;
  model_note: string | null;
  event_def_id: string;
}

export interface TResultRow {
  entry_id: string;
  tournament_event_id: string;
  status: string;
  place: number | null;
  tie: number;
  exempt: number;
  dropped: number;
  points: number | null;
}

export interface StrengthRow {
  view: string;
  pre_snapshot_as_of: string | null;
  entries: number;
  rated: number;
  established: number;
  mean_usr: number | null;
  top5_mean_usr: number | null;
}

export async function tournamentDetail(id: string) {
  const t = await get(`SELECT * FROM tournaments WHERE id = ?`, [id]);
  if (!t) return null;
  const build = await buildId();
  const [source, events, entries, results, tracks, strength, snap, penalties, changes] = await Promise.all([
    get(`SELECT * FROM source_files WHERE id = ?`, [id]),
    all<TEventRow>(
      `SELECT id, name, ordinal, trial, trialed, canceled, model_eligible, model_note, event_def_id FROM tournament_events WHERE tournament_id = ? ORDER BY ordinal`,
      [id],
    ),
    all(
      `SELECT e.*, sc.name AS school_name, sc.state AS school_state FROM entries e JOIN schools sc ON sc.id = e.school_id
       WHERE e.tournament_id = ? ORDER BY e.rank IS NULL, e.rank, e.number`,
      [id],
    ),
    all<TResultRow>(
      `SELECT entry_id, tournament_event_id, status, place, tie, exempt, dropped, points FROM event_results WHERE tournament_id = ?`,
      [id],
    ),
    all(`SELECT * FROM tracks WHERE tournament_id = ?`, [id]),
    all<StrengthRow>(`SELECT * FROM field_strength WHERE build_id = ? AND tournament_id = ?`, [build, id]),
    // Retrospective field offsets come from the season's first event-detail refit after this tournament.
    get<{ id: number; as_of: string }>(
      `SELECT id, as_of FROM snapshots WHERE build_id = ? AND division = ? AND season = ? AND view = 'team' AND has_event_detail = 1 AND as_of >= ?
       ORDER BY as_of LIMIT 1`,
      [build, t.division as string, t.season as number, t.end_date as string],
    ),
    all<{ entry_id: string; points: number }>(`SELECT entry_id, points FROM penalties WHERE tournament_id = ?`, [id]),
    all(
      `SELECT c.change, c.detail, c.old_hash, c.new_hash, r.started_at FROM import_changes c JOIN import_runs r ON r.id = c.run_id
       WHERE c.file_id = ? ORDER BY r.started_at DESC`,
      [id],
    ),
  ]);
  const k = snap
    ? new Map(
        (
          await all<{ tournament_event_id: string; k: number }>(
            `SELECT tournament_event_id, k FROM field_fits WHERE snapshot_id = ? AND tournament_event_id IN (SELECT id FROM tournament_events WHERE tournament_id = ?)`,
            [snap.id, id],
          )
        ).map((r) => [r.tournament_event_id, r.k]),
      )
    : new Map<string, number>();
  return { t, source, events, entries, results, tracks, strength, k, kSnapshot: snap?.as_of ?? null, penalties, changes };
}
