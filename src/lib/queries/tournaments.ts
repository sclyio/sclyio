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
  /** "weight" (default): heaviest first; "date": newest first. */
  sort?: "weight" | "date";
  page: number;
}

export const T_PAGE = 40;

/** Tournaments ranked by rating weight (unrated tournaments last), or by date. */
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
  const order = p.sort === "date" ? "t.end_date DESC, f.weight DESC, t.name" : "f.weight IS NULL, f.weight DESC, t.end_date DESC, t.name";
  const base = `FROM tournaments t LEFT JOIN field_strength f ON f.build_id = @build AND f.tournament_id = t.id AND f.view = 'team' WHERE ${where.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    get<{ c: number }>(`SELECT COUNT(*) AS c ${base}`, args as InArgs),
    all(
      `SELECT t.id, t.name, t.level, t.division, t.season, t.state, t.end_date, t.team_count, t.format, t.result_url, f.weight
       ${base} ORDER BY ${order} LIMIT ${T_PAGE} OFFSET ${(Math.max(1, p.page) - 1) * T_PAGE}`,
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
