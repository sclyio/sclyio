import "server-only";
import { buildId, normQuery, sql } from "./common";

export function search(q: string, limit = 25) {
  const nq = normQuery(q);
  if (nq.length < 2) return { schools: [], teams: [], tournaments: [] };
  const like = `%${nq.replace(/ /g, "%")}%`;
  const db = sql();
  const schools = db
    .prepare(
      `SELECT sc.id, sc.name, sc.city, sc.state,
              (SELECT COUNT(*) FROM entries e WHERE e.school_id = sc.id) AS appearances
       FROM schools sc WHERE sc.search_text LIKE ? ORDER BY appearances DESC, sc.name LIMIT ?`,
    )
    .all(like, limit) as { id: string; name: string; city: string | null; state: string; appearances: number }[];
  const build = buildId();
  const teams = db
    .prepare(
      `SELECT ts.id, ts.division, ts.season, ts.display_designation AS designation, sc.name, sc.state,
              (SELECT o.usr FROM snapshots s JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ts.id
               WHERE s.build_id = ? AND s.division = ts.division AND s.view = 'team' AND s.season = ts.season ORDER BY s.as_of DESC LIMIT 1) AS usr
       FROM team_seasons ts JOIN schools sc ON sc.id = ts.school_id
       WHERE sc.search_text LIKE ? ORDER BY ts.season DESC, sc.name, ts.division, ts.designation LIMIT ?`,
    )
    .all(build, like, limit * 2) as { id: string; division: string; season: number; designation: string; name: string; state: string; usr: number | null }[];
  const tournaments = db
    .prepare(`SELECT id, name, division, level, end_date FROM tournaments WHERE search_text LIKE ? ORDER BY end_date DESC LIMIT ?`)
    .all(like, limit) as { id: string; name: string; division: string; level: string; end_date: string }[];
  return { schools, teams, tournaments };
}

export function teamDirectory(p: { q?: string; division?: string; season?: number; state?: string; page: number }, pageSize = 50) {
  const where = ["1=1"];
  const args: Record<string, unknown> = { build: buildId() };
  if (p.q) {
    where.push("sc.search_text LIKE @q");
    args.q = `%${normQuery(p.q).replace(/ /g, "%")}%`;
  }
  if (p.division) {
    where.push("ts.division = @division");
    args.division = p.division;
  }
  if (p.season) {
    where.push("ts.season = @season");
    args.season = p.season;
  }
  if (p.state) {
    where.push("sc.state = @state");
    args.state = p.state;
  }
  const db = sql();
  const base = `FROM team_seasons ts JOIN schools sc ON sc.id = ts.school_id WHERE ${where.join(" AND ")}`;
  const total = (db.prepare(`SELECT COUNT(*) c ${base}`).get(args) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT ts.id, ts.division, ts.season, ts.display_designation AS designation, sc.id AS school_id, sc.name, sc.city, sc.state,
              (SELECT COUNT(*) FROM entries e WHERE e.team_season_id = ts.id) AS appearances,
              (SELECT o.usr || '|' || o.status FROM snapshots s JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ts.id
               WHERE s.build_id = @build AND s.division = ts.division AND s.view = 'team' AND s.season = ts.season ORDER BY s.as_of DESC LIMIT 1) AS rating
       ${base} ORDER BY ts.season DESC, sc.name, ts.division, ts.designation LIMIT ${pageSize} OFFSET ${(Math.max(1, p.page) - 1) * pageSize}`,
    )
    .all(args) as Record<string, unknown>[];
  return { total, rows };
}
