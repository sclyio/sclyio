import "server-only";
import { all, buildId, get, kv } from "./common";

type SiteCounts = { schools: number; teamSeasons: number; entries: number; unresolved: number; results: number; states: number };

export async function coverage() {
  const [bySeason, levels, files, counts, lastSync, lastBuild, sourceRevision, adapter, seasons] = await Promise.all([
    all<{ season: number; division: string; tournaments: number; rated: number; entries: number; first: string; last: string }>(
      `SELECT season, division, COUNT(*) AS tournaments, SUM(rating_eligible) AS rated, SUM(team_count) AS entries,
              MIN(start_date) AS first, MAX(end_date) AS last
       FROM tournaments GROUP BY season, division ORDER BY season DESC, division`,
    ),
    all<{ level: string; division: string; c: number }>(`SELECT level, division, COUNT(*) AS c FROM tournaments GROUP BY level, division ORDER BY division, c DESC`),
    all<{ status: string; c: number }>(`SELECT status, COUNT(*) AS c FROM source_files GROUP BY status`),
    // Deployed datasets carry precomputed counts (scripts/export-db.ts); local dev counts live.
    kv("site_counts").then(async (v) =>
      v
        ? (JSON.parse(v) as SiteCounts)
        : get<SiteCounts>(
            `SELECT (SELECT COUNT(*) FROM schools) AS schools, (SELECT COUNT(*) FROM team_seasons) AS teamSeasons,
                    (SELECT COUNT(*) FROM entries) AS entries, (SELECT COUNT(*) FROM entries WHERE resolution = 'unresolved') AS unresolved,
                    (SELECT COUNT(*) FROM event_results) AS results, (SELECT COUNT(DISTINCT state) FROM schools) AS states`,
          ),
    ),
    kv("last_successful_sync"),
    kv("last_rating_build"),
    kv("source_revision"),
    kv("source_adapter"),
    kv("imported_seasons"),
  ]);
  return {
    bySeason,
    levels,
    files,
    counts: counts!,
    lastSync,
    lastBuild,
    sourceRevision,
    adapter,
    seasons: JSON.parse(seasons ?? "[]") as number[],
  };
}

export async function recentTournaments(limit = 8) {
  return all<{ id: string; name: string; division: string; level: string; end_date: string; team_count: number }>(
    `SELECT id, name, division, level, end_date, team_count FROM tournaments ORDER BY end_date DESC, name LIMIT ?`,
    [limit],
  );
}

/** Results that were added to the archive recently but took place well before. */
export async function recentlyAddedHistorical(limit = 6) {
  return all<{ id: string; name: string; division: string; level: string; end_date: string; first_imported_at: string }>(
    `SELECT id, name, division, level, end_date, first_imported_at FROM tournaments
     WHERE julianday(first_imported_at) - julianday(end_date) > 60
     ORDER BY first_imported_at DESC, end_date DESC LIMIT ?`,
    [limit],
  );
}

export interface BacktestRow {
  run_at: string;
  division: string;
  view: string;
  split: string;
  model: string;
  metric: string;
  value: number | null;
  n: number;
  notes: string | null;
}

export async function backtestResults() {
  return all<BacktestRow>(`SELECT * FROM backtest_results ORDER BY division, view, split, metric, model`);
}

export async function dataQuality() {
  const build = await buildId();
  const [quarantined, metadataIssues, excluded, unresolvedByReason, labelSplits, labelSplitCount, runs, buildRow, publishLog, snapshotsDiag, graph, formats] =
    await Promise.all([
      all<{ id: string; reason: string; result_url: string }>(
        `SELECT id, reason, result_url FROM source_files WHERE status IN ('quarantined','skipped','superseded','removed') ORDER BY id DESC`,
      ),
      all<{ id: string; reason: string }>(`SELECT id, reason FROM source_files WHERE status = 'imported' AND reason IS NOT NULL ORDER BY id DESC`),
      all<{ id: string; name: string; exclusion_reason: string }>(
        `SELECT id, name, exclusion_reason FROM tournaments WHERE rating_eligible = 0 ORDER BY end_date DESC`,
      ),
      all<{ reason: string; c: number }>(
        `SELECT CASE WHEN resolution_reason LIKE 'No team designation%' THEN 'Unlabeled entry; school fielded several entries'
                     WHEN resolution_reason LIKE 'Designation%' THEN 'Duplicate designation within one tournament'
                     ELSE resolution_reason END AS reason, COUNT(*) AS c
         FROM entries WHERE resolution = 'unresolved' GROUP BY 1 ORDER BY c DESC`,
      ),
      // Review queue: schools with both an unlabeled and a labeled team in one season.
      all<{ id: string; name: string; state: string; division: string; season: number; labels: string }>(
        `SELECT sc.id, sc.name, sc.state, ts.division, ts.season,
                GROUP_CONCAT(CASE WHEN ts.designation = '' THEN '(unlabeled)' ELSE ts.display_designation END, ', ') AS labels
         FROM team_seasons ts JOIN schools sc ON sc.id = ts.school_id
         GROUP BY ts.school_id, ts.division, ts.season
         HAVING SUM(ts.designation = '') > 0 AND COUNT(*) > 1
         ORDER BY ts.season DESC, sc.name LIMIT 200`,
      ),
      get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM (SELECT 1 FROM team_seasons ts GROUP BY ts.school_id, ts.division, ts.season HAVING SUM(ts.designation = '') > 0 AND COUNT(*) > 1)`,
      ),
      all(`SELECT * FROM import_runs ORDER BY id DESC LIMIT 10`),
      get(`SELECT * FROM rating_builds WHERE id = ?`, [build]),
      all(`SELECT * FROM publish_log ORDER BY id DESC LIMIT 5`),
      all<{ division: string; view: string; season: number; n: number; detail: number; last: string }>(
        `SELECT division, view, season, COUNT(*) AS n, SUM(has_event_detail) AS detail, MAX(as_of) AS last
         FROM snapshots WHERE build_id = ? GROUP BY division, view, season ORDER BY season DESC, division, view`,
        [build],
      ),
      all<{ division: string; view: string; season: number; diagnostics: string }>(
        `SELECT division, view, season, diagnostics FROM snapshots
         WHERE build_id = ? AND id IN (SELECT MAX(id) FROM snapshots WHERE build_id = ? GROUP BY division, view, season)`,
        [build, build],
      ),
      all<{ format: string; c: number }>(`SELECT format, COUNT(*) AS c FROM tournaments GROUP BY format`),
    ]);
  return {
    quarantined,
    metadataIssues,
    excluded,
    unresolvedByReason,
    labelSplits,
    labelSplitTotal: labelSplitCount?.c ?? 0,
    runs,
    build: buildRow!,
    publishLog,
    snapshotsDiag,
    graph,
    formats,
  };
}
