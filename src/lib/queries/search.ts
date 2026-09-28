import "server-only";
import { all, buildId, normQuery } from "./common";

export async function search(q: string, limit = 25) {
  const nq = normQuery(q);
  if (nq.length < 2) return { schools: [], teams: [], tournaments: [] };
  const like = `%${nq.replace(/ /g, "%")}%`;
  const build = await buildId();
  const [schools, teams, tournaments] = await Promise.all([
    all<{ id: string; name: string; city: string | null; state: string; appearances: number }>(
      `SELECT sc.id, sc.name, sc.city, sc.state,
              (SELECT COUNT(*) FROM entries e WHERE e.school_id = sc.id) AS appearances
       FROM schools sc WHERE sc.search_text LIKE ? ORDER BY appearances DESC, sc.name LIMIT ?`,
      [like, limit],
    ),
    all<{ id: string; division: string; season: number; designation: string; name: string; state: string; usr: number | null }>(
      `SELECT ts.id, ts.division, ts.last_season AS season, ts.display_designation AS designation, sc.name, sc.state,
              (SELECT o.usr FROM snapshots s JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = ts.id
               WHERE s.build_id = ? AND s.division = ts.division AND s.view = 'team' AND s.season = ts.last_season ORDER BY s.as_of DESC LIMIT 1) AS usr
       FROM teams ts JOIN schools sc ON sc.id = ts.school_id
       WHERE sc.search_text LIKE ? ORDER BY ts.last_season DESC, sc.name, ts.division, ts.designation LIMIT ?`,
      [build, like, limit * 2],
    ),
    all<{ id: string; name: string; division: string; level: string; end_date: string; result_url: string }>(
      `SELECT id, name, division, level, end_date, result_url FROM tournaments WHERE search_text LIKE ? ORDER BY end_date DESC LIMIT ?`,
      [like, limit],
    ),
  ]);
  return { schools, teams, tournaments };
}
