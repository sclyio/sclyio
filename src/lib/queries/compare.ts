import "server-only";
import type { RatingView } from "../rating/config";
import { buildId, entityLabel, normQuery, officialEvents, snapshotsFor, sql, type EntityLabel } from "./common";
import { history, type HistoryPoint } from "./profiles";

export interface CompareEntity {
  label: EntityLabel;
  hist: HistoryPoint[];
  latest: HistoryPoint | null;
}

export interface Standing {
  tournamentId: string;
  name: string;
  endDate: string;
  rank: number | null;
  field: number;
}

export function compareData(view: RatingView, division: string, season: number, ids: string[]) {
  const errors: string[] = [];
  const entities: CompareEntity[] = [];
  for (const id of ids.slice(0, 4)) {
    const label = entityLabel(view, id);
    if (!label) {
      errors.push(`“${id}” was not found in the ${view === "team" ? "Team Performance" : "School Potential"} pool.`);
      continue;
    }
    if (view === "team" && (label.division !== division || label.season !== season)) {
      errors.push(
        `${label.schoolName} ${label.designation || "(unlabeled)"} is a Division ${label.division} ${label.season} team; it cannot be compared in the Division ${division} ${season} pool.`,
      );
      continue;
    }
    const hist = history(view, id, division, season);
    const rated = hist.filter((h) => h.usr !== null);
    entities.push({ label, hist, latest: rated.length ? rated[rated.length - 1] : null });
  }
  const snaps = snapshotsFor(division, view, season);
  const detail = [...snaps].reverse().find((s) => s.has_event_detail) ?? null;
  const events = officialEvents(division, season);
  const eventRatings = new Map<string, Map<string, { usr: number; evidence: string; component: number; appearances: number; rank: number | null }>>();
  if (detail) {
    const q = sql().prepare(`SELECT event_def_id, usr, evidence, component, appearances, event_rank FROM event_ratings WHERE snapshot_id=? AND entity_id=?`);
    for (const e of entities) {
      eventRatings.set(
        e.label.id,
        new Map(
          (q.all(detail.id, e.label.id) as { event_def_id: string; usr: number; evidence: string; component: number; appearances: number; event_rank: number | null }[]).map(
            (r) => [r.event_def_id, { usr: r.usr, evidence: r.evidence, component: r.component, appearances: r.appearances, rank: r.event_rank }],
          ),
        ),
      );
    }
  }

  // Actual placements at tournaments in this pool's season.
  const standings = new Map<string, Map<string, Standing>>();
  const qTeam = sql().prepare(
    `SELECT t.id, t.name, t.end_date, e.rank, (SELECT COUNT(*) FROM entries x WHERE x.tournament_id=t.id AND x.exhibition=0) AS field
     FROM entries e JOIN tournaments t ON t.id=e.tournament_id WHERE e.team_season_id=? AND e.exhibition=0`,
  );
  const qSchool = sql().prepare(
    `SELECT t.id, t.name, t.end_date, MIN(e.rank) AS rank, (SELECT COUNT(*) FROM entries x WHERE x.tournament_id=t.id AND x.exhibition=0) AS field
     FROM entries e JOIN tournaments t ON t.id=e.tournament_id WHERE e.school_id=? AND t.division=? AND t.season=? AND e.exhibition=0 GROUP BY t.id`,
  );
  for (const e of entities) {
    const rows = (view === "team" ? qTeam.all(e.label.id) : qSchool.all(e.label.id, division, season)) as {
      id: string;
      name: string;
      end_date: string;
      rank: number | null;
      field: number;
    }[];
    standings.set(e.label.id, new Map(rows.map((r) => [r.id, { tournamentId: r.id, name: r.name, endDate: r.end_date, rank: r.rank, field: r.field }])));
  }
  const allT = new Map<string, { name: string; endDate: string; count: number }>();
  for (const m of standings.values()) {
    for (const s of m.values()) {
      const cur = allT.get(s.tournamentId) ?? { name: s.name, endDate: s.endDate, count: 0 };
      cur.count++;
      allT.set(s.tournamentId, cur);
    }
  }
  const common = [...allT.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => (a[1].endDate < b[1].endDate ? 1 : -1))
    .map(([id, v]) => ({ id, ...v }));

  // Pairwise head-to-head: overall placements and event-level model ranks.
  const obs = new Map<string, Map<string, number>>();
  const qObs = sql().prepare(`SELECT tournament_event_id, model_rank FROM observations WHERE view=? AND entity_id=? AND division=?`);
  for (const e of entities) {
    obs.set(
      e.label.id,
      new Map((qObs.all(view, e.label.id, division) as { tournament_event_id: string; model_rank: number }[]).map((o) => [o.tournament_event_id, o.model_rank])),
    );
  }
  const pairs: { a: string; b: string; overall: [number, number, number]; events: [number, number, number] }[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i].label.id;
      const b = entities[j].label.id;
      const overall: [number, number, number] = [0, 0, 0];
      for (const [tid, sa] of standings.get(a)!) {
        const sb = standings.get(b)!.get(tid);
        if (!sb || sa.rank === null || sb.rank === null) continue;
        if (sa.rank < sb.rank) overall[0]++;
        else if (sa.rank > sb.rank) overall[1]++;
        else overall[2]++;
      }
      const events: [number, number, number] = [0, 0, 0];
      for (const [f, ra] of obs.get(a)!) {
        const rb = obs.get(b)!.get(f);
        if (rb === undefined) continue;
        if (ra < rb) events[0]++;
        else if (ra > rb) events[1]++;
        else events[2]++;
      }
      pairs.push({ a, b, overall, events });
    }
  }
  return { entities, errors, snaps, detail, events, eventRatings, standings, common, pairs };
}

export function compareCandidates(view: RatingView, division: string, season: number, q: string) {
  const nq = normQuery(q);
  if (nq.length < 2) return [];
  const like = `%${nq.replace(/ /g, "%")}%`;
  const build = buildId();
  if (view === "team") {
    return sql()
      .prepare(
        `SELECT ts.id, sc.name, ts.display_designation AS designation, sc.state FROM team_seasons ts JOIN schools sc ON sc.id=ts.school_id
         WHERE ts.division=? AND ts.season=? AND sc.search_text LIKE ? ORDER BY sc.name, ts.designation LIMIT 20`,
      )
      .all(division, season, like) as { id: string; name: string; designation: string; state: string }[];
  }
  return sql()
    .prepare(
      `SELECT DISTINCT sc.id, sc.name, NULL AS designation, sc.state FROM schools sc
       JOIN snapshots s ON s.build_id=? AND s.division=? AND s.view='school' AND s.season=?
       JOIN overall_ratings o ON o.snapshot_id=s.id AND o.entity_id=sc.id
       WHERE sc.search_text LIKE ? ORDER BY sc.name LIMIT 20`,
    )
    .all(build, division, season, like) as { id: string; name: string; designation: string | null; state: string }[];
}
