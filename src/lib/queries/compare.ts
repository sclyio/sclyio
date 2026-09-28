import "server-only";
import type { RatingView } from "../rating/config";
import { all, buildId, entityLabel, normQuery, officialEvents, snapshotsFor, type EntityLabel } from "./common";
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

type StandingRow = { id: string; name: string; end_date: string; rank: number | null; field: number };
type EventRatingRow = { event_def_id: string; usr: number; evidence: string; component: number; appearances: number; event_rank: number | null };

export async function compareData(view: RatingView, division: string, season: number, ids: string[]) {
  const errors: string[] = [];
  const entities: CompareEntity[] = [];
  const labels = await Promise.all(ids.slice(0, 4).map((id) => entityLabel(view, id)));
  const accepted: { id: string; label: NonNullable<(typeof labels)[number]> }[] = [];
  ids.slice(0, 4).forEach((id, i) => {
    const label = labels[i];
    if (!label) {
      errors.push(`“${id}” was not found in the ${view === "team" ? "Team Performance" : "School Potential"} pool.`);
    } else if (view === "team" && (label.division !== division || season < label.firstSeason! || season > label.season!)) {
      errors.push(
        `${label.schoolName} ${label.designation} did not compete in Division ${division} in ${season - 1}-${String(season).slice(2)}.`,
      );
    } else {
      accepted.push({ id, label });
    }
  });
  const [snaps, events, hists] = await Promise.all([
    snapshotsFor(division, view, season),
    officialEvents(division, season),
    Promise.all(accepted.map((a) => history(view, a.id, division, season))),
  ]);
  accepted.forEach((a, i) => {
    const rated = hists[i].filter((h) => h.usr !== null);
    entities.push({ label: a.label, hist: hists[i], latest: rated.length ? rated[rated.length - 1] : null });
  });
  const detail = [...snaps].reverse().find((s) => s.has_event_detail) ?? null;

  // Per-entity event ratings, actual placements, and model observations, fetched in parallel.
  const perEntity = await Promise.all(
    entities.map((e) =>
      Promise.all([
        detail
          ? all<EventRatingRow>(
              `SELECT event_def_id, usr, evidence, component, appearances, event_rank FROM event_ratings WHERE snapshot_id = ? AND entity_id = ?`,
              [detail.id, e.label.id],
            )
          : Promise.resolve([] as EventRatingRow[]),
        view === "team"
          ? all<StandingRow>(
              `SELECT t.id, t.name, t.end_date, e.rank, (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = t.id AND x.exhibition = 0) AS field
               FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.team_id = ? AND t.season = ? AND e.exhibition = 0`,
              [e.label.id, season],
            )
          : all<StandingRow>(
              `SELECT t.id, t.name, t.end_date, MIN(e.rank) AS rank, (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = t.id AND x.exhibition = 0) AS field
               FROM entries e JOIN tournaments t ON t.id = e.tournament_id
               WHERE e.school_id = ? AND t.division = ? AND t.season = ? AND e.exhibition = 0 GROUP BY t.id`,
              [e.label.id, division, season],
            ),
        // Event head-to-head uses official event places (best entry per school in the school view).
        view === "team"
          ? all<{ tournament_event_id: string; model_rank: number }>(
              `SELECT r.tournament_event_id, r.place AS model_rank
               FROM entries e JOIN tournaments t ON t.id = e.tournament_id
               JOIN event_results r ON r.tournament_id = e.tournament_id AND r.entry_id = e.id
               WHERE e.team_id = ? AND t.season = ? AND r.status = 'placed' AND e.exhibition = 0`,
              [e.label.id, season],
            )
          : all<{ tournament_event_id: string; model_rank: number }>(
              `SELECT r.tournament_event_id, MIN(r.place) AS model_rank
               FROM entries e JOIN tournaments t ON t.id = e.tournament_id
               JOIN event_results r ON r.tournament_id = e.tournament_id AND r.entry_id = e.id
               WHERE e.school_id = ? AND t.division = ? AND t.season = ? AND r.status = 'placed' AND e.exhibition = 0
               GROUP BY r.tournament_event_id`,
              [e.label.id, division, season],
            ),
      ]),
    ),
  );
  const eventRatings = new Map<string, Map<string, { usr: number; evidence: string; component: number; appearances: number; rank: number | null }>>();
  const standings = new Map<string, Map<string, Standing>>();
  const obs = new Map<string, Map<string, number>>();
  entities.forEach((e, i) => {
    const [er, st, ob] = perEntity[i];
    eventRatings.set(
      e.label.id,
      new Map(er.map((r) => [r.event_def_id, { usr: r.usr, evidence: r.evidence, component: r.component, appearances: r.appearances, rank: r.event_rank }])),
    );
    standings.set(e.label.id, new Map(st.map((r) => [r.id, { tournamentId: r.id, name: r.name, endDate: r.end_date, rank: r.rank, field: r.field }])));
    obs.set(e.label.id, new Map(ob.map((o) => [o.tournament_event_id, o.model_rank])));
  });
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

export async function compareCandidates(view: RatingView, division: string, season: number, q: string) {
  const nq = normQuery(q);
  if (nq.length < 2) return [];
  const like = `%${nq.replace(/ /g, "%")}%`;
  if (view === "team") {
    return all<{ id: string; name: string; designation: string; state: string }>(
      `SELECT ts.id, sc.name, ts.display_designation AS designation, sc.state FROM teams ts JOIN schools sc ON sc.id = ts.school_id
       WHERE ts.division = ? AND ? BETWEEN ts.first_season AND ts.last_season AND sc.search_text LIKE ? ORDER BY sc.name, ts.designation LIMIT 20`,
      [division, season, like],
    );
  }
  return all<{ id: string; name: string; designation: string | null; state: string }>(
    `SELECT DISTINCT sc.id, sc.name, NULL AS designation, sc.state FROM schools sc
     JOIN snapshots s ON s.build_id = ? AND s.division = ? AND s.view = 'school' AND s.season = ?
     JOIN overall_ratings o ON o.snapshot_id = s.id AND o.entity_id = sc.id
     WHERE sc.search_text LIKE ? ORDER BY sc.name LIMIT 20`,
    [await buildId(), division, season, like],
  );
}
