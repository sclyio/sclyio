import "server-only";
import { buildId, kv, sql } from "./common";

export function coverage() {
  const db = sql();
  const bySeason = db
    .prepare(
      `SELECT season, division, COUNT(*) AS tournaments, SUM(rating_eligible) AS rated, SUM(team_count) AS entries,
              MIN(start_date) AS first, MAX(end_date) AS last
       FROM tournaments GROUP BY season, division ORDER BY season DESC, division`,
    )
    .all() as { season: number; division: string; tournaments: number; rated: number; entries: number; first: string; last: string }[];
  const levels = db.prepare(`SELECT level, division, COUNT(*) c FROM tournaments GROUP BY level, division ORDER BY division, c DESC`).all() as {
    level: string;
    division: string;
    c: number;
  }[];
  const files = db.prepare(`SELECT status, COUNT(*) c FROM source_files GROUP BY status`).all() as { status: string; c: number }[];
  const counts = {
    schools: (db.prepare(`SELECT COUNT(*) c FROM schools`).get() as { c: number }).c,
    teamSeasons: (db.prepare(`SELECT COUNT(*) c FROM team_seasons`).get() as { c: number }).c,
    entries: (db.prepare(`SELECT COUNT(*) c FROM entries`).get() as { c: number }).c,
    unresolved: (db.prepare(`SELECT COUNT(*) c FROM entries WHERE resolution='unresolved'`).get() as { c: number }).c,
    results: (db.prepare(`SELECT COUNT(*) c FROM event_results`).get() as { c: number }).c,
    states: (db.prepare(`SELECT COUNT(DISTINCT state) c FROM schools`).get() as { c: number }).c,
  };
  return {
    bySeason,
    levels,
    files,
    counts,
    lastSync: kv("last_successful_sync"),
    lastBuild: kv("last_rating_build"),
    sourceRevision: kv("source_revision"),
    adapter: kv("source_adapter"),
    seasons: JSON.parse(kv("imported_seasons") ?? "[]") as number[],
  };
}

export function recentTournaments(limit = 8) {
  return sql()
    .prepare(`SELECT id, name, division, level, end_date, team_count FROM tournaments ORDER BY end_date DESC, name LIMIT ?`)
    .all(limit) as { id: string; name: string; division: string; level: string; end_date: string; team_count: number }[];
}

/** Results that were added to the archive recently but took place well before. */
export function recentlyAddedHistorical(limit = 6) {
  return sql()
    .prepare(
      `SELECT id, name, division, level, end_date, first_imported_at FROM tournaments
       WHERE julianday(first_imported_at) - julianday(end_date) > 60
       ORDER BY first_imported_at DESC, end_date DESC LIMIT ?`,
    )
    .all(limit) as { id: string; name: string; division: string; level: string; end_date: string; first_imported_at: string }[];
}

export function dataQuality() {
  const db = sql();
  const quarantined = db
    .prepare(`SELECT id, reason, result_url FROM source_files WHERE status IN ('quarantined','skipped','superseded','removed') ORDER BY id DESC`)
    .all() as { id: string; reason: string; result_url: string }[];
  const metadataIssues = db
    .prepare(`SELECT id, reason FROM source_files WHERE status='imported' AND reason IS NOT NULL ORDER BY id DESC`)
    .all() as { id: string; reason: string }[];
  const excluded = db
    .prepare(`SELECT id, name, exclusion_reason FROM tournaments WHERE rating_eligible=0 ORDER BY end_date DESC`)
    .all() as { id: string; name: string; exclusion_reason: string }[];
  const unresolvedByReason = db
    .prepare(
      `SELECT CASE WHEN resolution_reason LIKE 'No team designation%' THEN 'Unlabeled entry; school fielded several entries'
                   WHEN resolution_reason LIKE 'Designation%' THEN 'Duplicate designation within one tournament'
                   ELSE resolution_reason END AS reason, COUNT(*) c
       FROM entries WHERE resolution='unresolved' GROUP BY 1 ORDER BY c DESC`,
    )
    .all() as { reason: string; c: number }[];
  // Review queue: schools with both an unlabeled and a labeled team in one season.
  const labelSplits = db
    .prepare(
      `SELECT sc.id, sc.name, sc.state, ts.division, ts.season, GROUP_CONCAT(CASE WHEN ts.designation='' THEN '(unlabeled)' ELSE ts.display_designation END, ', ') AS labels
       FROM team_seasons ts JOIN schools sc ON sc.id=ts.school_id
       GROUP BY ts.school_id, ts.division, ts.season
       HAVING SUM(ts.designation='') > 0 AND COUNT(*) > 1
       ORDER BY ts.season DESC, sc.name LIMIT 200`,
    )
    .all() as { id: string; name: string; state: string; division: string; season: number; labels: string }[];
  const labelSplitTotal = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM (SELECT 1 FROM team_seasons ts GROUP BY ts.school_id, ts.division, ts.season HAVING SUM(ts.designation='') > 0 AND COUNT(*) > 1)`,
      )
      .get() as { c: number }
  ).c;
  const runs = db.prepare(`SELECT * FROM import_runs ORDER BY id DESC LIMIT 10`).all() as Record<string, unknown>[];
  const build = db.prepare(`SELECT * FROM rating_builds WHERE id=?`).get(buildId()) as Record<string, unknown>;
  const publishLog = db.prepare(`SELECT * FROM publish_log ORDER BY id DESC LIMIT 5`).all() as Record<string, unknown>[];
  const snapshotsDiag = db
    .prepare(
      `SELECT division, view, season, COUNT(*) n, SUM(has_event_detail) detail, MAX(as_of) last FROM snapshots WHERE build_id=? GROUP BY division, view, season ORDER BY season DESC, division, view`,
    )
    .all(buildId()) as { division: string; view: string; season: number; n: number; detail: number; last: string }[];
  const graph = db
    .prepare(`SELECT division, view, season, diagnostics FROM snapshots WHERE build_id=? AND id IN (SELECT MAX(id) FROM snapshots WHERE build_id=? GROUP BY division, view, season)`)
    .all(buildId(), buildId()) as { division: string; view: string; season: number; diagnostics: string }[];
  const backtest = db.prepare(`SELECT * FROM backtest_results ORDER BY division, view, split, metric, model`).all() as {
    run_at: string;
    division: string;
    view: string;
    split: string;
    model: string;
    metric: string;
    value: number | null;
    n: number;
    notes: string | null;
  }[];
  const formats = db.prepare(`SELECT format, COUNT(*) c FROM tournaments GROUP BY format`).all() as { format: string; c: number }[];
  return { quarantined, metadataIssues, excluded, unresolvedByReason, labelSplits, labelSplitTotal, runs, build, publishLog, snapshotsDiag, graph, backtest, formats };
}
