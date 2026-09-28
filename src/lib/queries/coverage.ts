import "server-only";
import { all } from "./common";

export async function recentTournaments(limit = 8) {
  return all<{ id: string; name: string; division: string; level: string; end_date: string; team_count: number; result_url: string }>(
    `SELECT id, name, division, level, end_date, team_count, result_url FROM tournaments ORDER BY end_date DESC, name LIMIT ?`,
    [limit],
  );
}
