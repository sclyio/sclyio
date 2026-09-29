import type { DataSource } from "../accounts/actor";
import { deriveObservations, resultIneligibility, type ObsEntry, type ObsEvent, type ObsResult } from "../rating/observations";
import { COUNTED_STATUSES, type ClaimEvidence } from "./rating";

/**
 * Loads each claim's model-adjusted event performance from the published
 * Team Performance fit, read-only:
 *  - x: recomputed with the engine's own deriveObservations() for that one
 *    tournament event (same eligible-participant ranking, ties, and
 *    non-participation penalties as the rating job);
 *  - k and w: the field offset and normalized weight stored in field_fits for
 *    the season's latest event-detail team snapshot. All observations of one
 *    tournament event share one weight, so w = weight / n;
 *  - comparability: the team's component in that snapshot's event fit.
 * Claims from the three seasons before the rated season count toward the
 * event they are equivalent to this season (the engine's pools: same
 * equivalence group), with the season weights already in w.
 * Nothing falls back to a team's overall rating or a later event rating.
 */

export interface PersonalClaimInput {
  id: string;
  status: string;
  division: string;
  season: number;
  tournament_id: string;
  entry_id: string;
  tournament_event_id: string;
  event_def_id: string;
  source_state: string;
}

export interface RatingSnapshotRef {
  id: number;
  asOf: string;
  buildId: number;
}

/** The season's latest team-view snapshot with event detail in the published build (null = none yet). */
export async function seasonSnapshot(data: DataSource, division: string, season: number): Promise<RatingSnapshotRef | null> {
  const b = await data.get<{ value: string }>(`SELECT value FROM kv WHERE key = 'published_build_id'`);
  if (!b) return null;
  const s = await data.get<{ id: number; as_of: string }>(
    `SELECT id, as_of FROM snapshots WHERE build_id = ? AND division = ? AND view = 'team' AND season = ? AND has_event_detail = 1
     ORDER BY as_of DESC LIMIT 1`,
    [Number(b.value), division, season],
  );
  return s ? { id: s.id, asOf: s.as_of, buildId: Number(b.value) } : null;
}

interface TournamentBundle {
  t: { id: string; division: string; season: number; start_date: string; end_date: string; format: string; rating_eligible: number; exclusion_reason: string | null };
  events: Map<string, ObsEvent & { name: string; canceled: boolean; modelNote: string | null }>;
  entries: ObsEntry[];
  results: ObsResult[];
}

async function loadTournament(data: DataSource, id: string): Promise<TournamentBundle | null> {
  const [t, events, entries, results] = await Promise.all([
    data.get<TournamentBundle["t"]>(
      `SELECT id, division, season, start_date, end_date, format, rating_eligible, exclusion_reason FROM tournaments WHERE id = ?`,
      [id],
    ),
    data.all<{ id: string; event_def_id: string; name: string; model_eligible: number; trial: number; canceled: number; model_note: string | null }>(
      `SELECT id, event_def_id, name, model_eligible, (trial OR trialed) AS trial, canceled, model_note FROM tournament_events WHERE tournament_id = ?`,
      [id],
    ),
    data.all<Record<string, unknown>>(
      `SELECT id, school_id, team_id, exhibition, disqualified, withdrawn, number FROM entries WHERE tournament_id = ?`,
      [id],
    ),
    data.all<Record<string, unknown>>(
      `SELECT entry_id, tournament_event_id, status, place, exempt FROM event_results WHERE tournament_id = ?`,
      [id],
    ),
  ]);
  if (!t) return null;
  return {
    t,
    events: new Map(
      events.map((e) => [
        e.id,
        {
          id: e.id,
          eventDefId: e.event_def_id,
          modelEligible: Boolean(e.model_eligible),
          trial: Boolean(e.trial),
          name: e.name,
          canceled: Boolean(e.canceled),
          modelNote: e.model_note,
        },
      ]),
    ),
    entries: entries.map((e) => ({
      id: e.id as string,
      schoolId: e.school_id as string,
      teamId: (e.team_id as string | null) ?? null,
      exhibition: Boolean(e.exhibition),
      disqualified: Boolean(e.disqualified),
      withdrawn: Boolean(e.withdrawn),
      number: e.number as number,
    })),
    results: results.map((r) => ({
      entryId: r.entry_id as string,
      tournamentEventId: r.tournament_event_id as string,
      status: r.status as string,
      place: (r.place as number | null) ?? null,
      exempt: Boolean(r.exempt),
    })),
  };
}

/** Official events of the rated season, and which event definitions (any season) count toward each. */
async function targetEvents(data: DataSource, division: string, season: number) {
  const official = await data.all<{ id: string; name: string; equivalence_group: string | null }>(
    `SELECT id, name, equivalence_group FROM event_definitions WHERE division = ? AND season = ? AND official = 1`,
    [division, season],
  );
  const target = new Map<string, { id: string; name: string }>();
  for (const o of official) target.set(o.id, o);
  const groups = official.filter((o) => o.equivalence_group);
  if (groups.length) {
    const members = await data.all<{ id: string; equivalence_group: string }>(
      `SELECT id, equivalence_group FROM event_definitions WHERE division = ? AND equivalence_group IN (${groups.map(() => "?").join(",")})`,
      [division, ...groups.map((g) => g.equivalence_group!)],
    );
    for (const m of members) {
      const o = groups.find((g) => g.equivalence_group === m.equivalence_group)!;
      if (!target.has(m.id)) target.set(m.id, o);
    }
  }
  return target;
}

export async function loadEvidence(
  data: DataSource,
  claims: PersonalClaimInput[],
  snapshot: RatingSnapshotRef | null,
  verifiedIds: Set<string>,
  rated: { division: string; season: number },
): Promise<ClaimEvidence[]> {
  const bundles = new Map<string, Promise<TournamentBundle | null>>();
  const bundle = (id: string) => {
    let p = bundles.get(id);
    if (!p) bundles.set(id, (p = loadTournament(data, id)));
    return p;
  };
  const targets = claims.length ? await targetEvents(data, rated.division, rated.season) : new Map<string, { id: string; name: string }>();

  const out: ClaimEvidence[] = [];
  for (const c of claims) {
    const base = {
      claimId: c.id,
      status: c.status,
      verified: c.status === "VERIFIED" && verifiedIds.has(c.id),
      tournamentId: c.tournament_id,
      season: c.season,
      eventDefId: c.event_def_id,
      eventName: c.event_def_id,
    };
    const b = await bundle(c.tournament_id);
    const ev = b?.events.get(c.tournament_event_id);
    if (ev) base.eventName = ev.name;
    const no = (outcome: ClaimEvidence["outcome"], reason: string): ClaimEvidence => ({ ...base, outcome, reason });

    if (!COUNTED_STATUSES.has(c.status)) {
      out.push(no("not_counted", `${c.status.toLowerCase().replace("_", " ")} claims do not count`));
      continue;
    }
    if (c.source_state === "missing" || !b || !ev) {
      out.push(no("no_eligible_result", "the official result is no longer in the published results"));
      continue;
    }
    const entry = b.entries.find((e) => e.id === c.entry_id);
    if (!entry) {
      out.push(no("no_eligible_result", "the team entry is no longer in the published results"));
      continue;
    }
    if (!b.t.rating_eligible) {
      out.push(no("no_eligible_result", `this tournament is not rated${b.t.exclusion_reason ? ` (${b.t.exclusion_reason})` : ""}`));
      continue;
    }
    if (ev.trial) {
      out.push(no("no_eligible_result", "trial events are not rated"));
      continue;
    }
    if (ev.canceled || !ev.modelEligible) {
      out.push(no("no_eligible_result", ev.modelNote ?? "this event is not rated at this tournament"));
      continue;
    }
    const target = targets.get(ev.eventDefId);
    if (!target) {
      out.push(
        no("no_eligible_result", c.season === rated.season ? "not an official event this season" : `no equivalent official event in ${rated.season - 1}-${String(rated.season).slice(2)}`),
      );
      continue;
    }
    const result = b.results.find((r) => r.entryId === c.entry_id && r.tournamentEventId === c.tournament_event_id);
    if (!result) {
      out.push(no("no_eligible_result", "no official result for this team in this event"));
      continue;
    }
    const why = resultIneligibility(entry, result, ev.trial);
    if (why) {
      out.push(no("no_eligible_result", `result not rated: ${why}`));
      continue;
    }
    if (!entry.teamId) {
      out.push(no("no_eligible_result", "this entry's team identity is unresolved, so the model has no estimate for it"));
      continue;
    }
    const obs = deriveObservations({ ...b.t, startDate: b.t.start_date, endDate: b.t.end_date, ratingEligible: true }, [ev], b.entries, b.results).find(
      (o) => o.view === "team" && o.sourceEntryId === c.entry_id,
    );
    if (!obs) {
      out.push(no("no_eligible_result", "fewer than two eligible teams in this event"));
      continue;
    }
    if (!snapshot) {
      out.push(no("pending", "no rating refit for this season has been published yet"));
      continue;
    }
    const [fit, er] = await Promise.all([
      data.get<{ k: number; weight: number; n: number }>(`SELECT k, weight, n FROM field_fits WHERE snapshot_id = ? AND tournament_event_id = ?`, [
        snapshot.id,
        c.tournament_event_id,
      ]),
      data.get<{ component: number }>(`SELECT component FROM event_ratings WHERE snapshot_id = ? AND entity_id = ? AND event_def_id = ?`, [
        snapshot.id,
        entry.teamId,
        target.id,
      ]),
    ]);
    if (!fit || !(fit.n > 0) || !(fit.weight > 0)) {
      out.push(no("no_model_estimate", `the ${snapshot.asOf} refit has no field adjustment for this tournament event yet`));
      continue;
    }
    const w = fit.weight / fit.n;
    out.push({
      ...base,
      eventDefId: target.id,
      eventName: target.name,
      outcome: "counted",
      reason: null,
      x: obs.x,
      k: fit.k,
      w,
      a: obs.x + fit.k,
      modelRank: obs.modelRank,
      n: obs.n,
      comparable: er?.component === 0,
    });
  }
  return out;
}
