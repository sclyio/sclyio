import { normQuery } from "../format";
import type { DataSource } from "./actor";
import { sha256 } from "./db";

/**
 * Lookups against the active results dataset for the account flows. Every
 * id a user submits is re-read here; nothing about a school, tournament,
 * entry, event, or result is taken from the client.
 */

export interface SchoolRow {
  id: string;
  name: string;
  city: string | null;
  state: string;
}

export interface TournamentRow {
  id: string;
  name: string;
  division: string;
  season: number;
  level: string;
  start_date: string;
  end_date: string;
  result_url: string;
  rating_eligible: number;
  exclusion_reason: string | null;
  content_hash: string;
  team_count: number;
}

export interface EntryRow {
  id: string;
  tournament_id: string;
  number: number;
  school_id: string;
  team_id: string | null;
  raw_school: string;
  raw_suffix: string | null;
  track: string | null;
  exhibition: number;
  disqualified: number;
  withdrawn: number;
  rank: number | null;
  resolution: string;
  team_designation: string | null;
}

export interface TournamentEventRow {
  id: string;
  tournament_id: string;
  event_def_id: string;
  name: string;
  ordinal: number;
  trial: number;
  trialed: number;
  canceled: number;
  model_eligible: number;
  model_note: string | null;
}

export interface ResultRow {
  entry_id: string;
  tournament_event_id: string;
  status: string;
  place: number | null;
  tie: number;
  exempt: number;
  dropped: number;
}

export async function searchSchools(data: DataSource, q: string, limit = 20): Promise<SchoolRow[]> {
  const nq = normQuery(q);
  if (nq.length < 2) return [];
  return data.all<SchoolRow>(
    `SELECT id, name, city, state FROM schools WHERE search_text LIKE ? ORDER BY name, state LIMIT ?`,
    [`%${nq.replace(/ /g, "%")}%`, limit],
  );
}

export const schoolById = (data: DataSource, id: string) =>
  data.get<SchoolRow>(`SELECT id, name, city, state FROM schools WHERE id = ?`, [id]);

/** Division/season pairs in which the school has at least one imported entry. */
export const schoolSeasons = (data: DataSource, schoolId: string) =>
  data.all<{ division: string; season: number }>(
    `SELECT DISTINCT t.division, t.season FROM entries e JOIN tournaments t ON t.id = e.tournament_id
     WHERE e.school_id = ? ORDER BY t.season DESC, t.division`,
    [schoolId],
  );

const T_COLS = `t.id, t.name, t.division, t.season, t.level, t.start_date, t.end_date, t.result_url, t.rating_eligible, t.exclusion_reason,
  t.content_hash, t.team_count`;

export const tournamentById = (data: DataSource, id: string) =>
  data.get<TournamentRow>(`SELECT ${T_COLS} FROM tournaments t WHERE t.id = ?`, [id]);

/** Tournaments where the school had an entry, in one division and season. */
export const schoolTournaments = (data: DataSource, schoolId: string, division: string, season: number) =>
  data.all<TournamentRow>(
    `SELECT ${T_COLS} FROM tournaments t
     WHERE t.division = ? AND t.season = ? AND t.id IN (SELECT e.tournament_id FROM entries e WHERE e.school_id = ?)
     ORDER BY t.start_date, t.name`,
    [division, season, schoolId],
  );

const E_COLS = `e.id, e.tournament_id, e.number, e.school_id, e.team_id, e.raw_school, e.raw_suffix, e.track, e.exhibition, e.disqualified,
  e.withdrawn, e.rank, e.resolution, tm.display_designation AS team_designation`;

export const entryById = (data: DataSource, id: string) =>
  data.get<EntryRow>(`SELECT ${E_COLS} FROM entries e LEFT JOIN teams tm ON tm.id = e.team_id WHERE e.id = ?`, [id]);

export const schoolEntries = (data: DataSource, tournamentId: string, schoolId: string) =>
  data.all<EntryRow>(
    `SELECT ${E_COLS} FROM entries e LEFT JOIN teams tm ON tm.id = e.team_id
     WHERE e.tournament_id = ? AND e.school_id = ? ORDER BY e.number`,
    [tournamentId, schoolId],
  );

export const tournamentEvents = (data: DataSource, tournamentId: string) =>
  data.all<TournamentEventRow>(
    `SELECT id, tournament_id, event_def_id, name, ordinal, trial, trialed, canceled, model_eligible, model_note
     FROM tournament_events WHERE tournament_id = ? ORDER BY name`,
    [tournamentId],
  );

export const tournamentEventById = (data: DataSource, id: string) =>
  data.get<TournamentEventRow>(
    `SELECT id, tournament_id, event_def_id, name, ordinal, trial, trialed, canceled, model_eligible, model_note
     FROM tournament_events WHERE id = ?`,
    [id],
  );

export const entryResults = (data: DataSource, tournamentId: string, entryId: string) =>
  data.all<ResultRow>(
    `SELECT entry_id, tournament_event_id, status, place, tie, exempt, dropped FROM event_results WHERE tournament_id = ? AND entry_id = ?`,
    [tournamentId, entryId],
  );

export const eventResult = (data: DataSource, tournamentId: string, entryId: string, tournamentEventId: string) =>
  data.get<ResultRow>(
    `SELECT entry_id, tournament_event_id, status, place, tie, exempt, dropped FROM event_results
     WHERE tournament_id = ? AND entry_id = ? AND tournament_event_id = ?`,
    [tournamentId, entryId, tournamentEventId],
  );

export async function datasetBuildId(data: DataSource): Promise<number | null> {
  const r = await data.get<{ value: string }>(`SELECT value FROM kv WHERE key = 'published_build_id'`);
  return r ? Number(r.value) : null;
}

/** "Team 1 · Gold · #12": the source suffix and tournament team number exactly as imported. */
export function entryLabel(e: Pick<EntryRow, "raw_suffix" | "number" | "team_designation" | "track">): string {
  const parts = [e.raw_suffix ? `“${e.raw_suffix}”` : "no suffix", `team #${e.number}`];
  if (e.track) parts.push(`${e.track} track`);
  if (e.team_designation) parts.push(`scly.io ${e.team_designation}`);
  return parts.join(" · ");
}

export function resultText(r: Pick<ResultRow, "status" | "place" | "tie" | "exempt" | "dropped"> | null | undefined): string {
  if (!r) return "no official result";
  const base =
    r.status === "placed" && r.place !== null
      ? `${r.tie ? "T-" : ""}${ordinal(r.place)} place`
      : ({ participation_only: "participation only", no_show: "no show", disqualified: "disqualified" } as Record<string, string>)[r.status] ??
        r.status.replace("_", " ");
  return [base, r.exempt ? "exempt" : "", r.dropped ? "dropped" : ""].filter(Boolean).join(", ");
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export interface SourceSnapshot {
  hash: string;
  missing: boolean;
  tournament?: TournamentRow;
  entry?: EntryRow;
  event?: TournamentEventRow;
  result?: ResultRow | null;
}

/**
 * Fingerprint of everything about a claimed result that could change its
 * meaning or rating eligibility. A verified claim whose fingerprint changes
 * after a source correction is flagged for re-review.
 */
export async function sourceSnapshot(
  data: DataSource,
  c: { tournament_id: string; entry_id: string; tournament_event_id: string },
): Promise<SourceSnapshot> {
  const [tournament, entry, event, result] = await Promise.all([
    tournamentById(data, c.tournament_id),
    entryById(data, c.entry_id),
    tournamentEventById(data, c.tournament_event_id),
    eventResult(data, c.tournament_id, c.entry_id, c.tournament_event_id),
  ]);
  if (!tournament || !entry || !event || entry.tournament_id !== tournament.id || event.tournament_id !== tournament.id) {
    return { hash: "missing", missing: true };
  }
  const material = {
    t: [tournament.division, tournament.season, tournament.rating_eligible],
    e: [entry.school_id, entry.team_id, entry.exhibition, entry.disqualified, entry.withdrawn],
    v: [event.event_def_id, event.trial, event.trialed, event.canceled, event.model_eligible],
    r: result ? [result.status, result.place, result.tie, result.exempt, result.dropped] : null,
  };
  return { hash: sha256(JSON.stringify(material)).slice(0, 32), missing: false, tournament, entry, event, result: result ?? null };
}
