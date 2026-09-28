import type { RatingView } from "./config";
import { midranks, placementLogit } from "./math";

/**
 * Converts one tournament's official event results into model
 * observations. Official standings are never modified; this produces a
 * separate model ranking among eligible participants only.
 */

export interface ObsTournament {
  id: string;
  division: string;
  season: number;
  startDate: string;
  endDate: string;
  format: string;
  ratingEligible: boolean;
}

export interface ObsEvent {
  id: string;
  eventDefId: string;
  modelEligible: boolean;
  /** Held as a trial (or trialed): non-participants are not penalized. */
  trial?: boolean;
}

export interface ObsEntry {
  id: string;
  schoolId: string;
  teamSeasonId: string | null; // null = unresolved identity
  exhibition: boolean;
  disqualified: boolean; // team-level disqualification
  withdrawn: boolean;
  number: number;
}

export interface ObsResult {
  entryId: string;
  tournamentEventId: string;
  status: string;
  place: number | null;
  exempt: boolean;
}

export interface ObservationRow {
  view: RatingView;
  tournamentEventId: string;
  entityId: string;
  tournamentId: string;
  eventDefId: string;
  division: string;
  season: number;
  startDate: string;
  endDate: string;
  sourceEntryId: string;
  sourcePlace: number;
  modelRank: number;
  n: number;
  nSchools: number;
  x: number;
  format: string;
}

/**
 * Non-participation penalty (official scoring order): in a non-trial event,
 * participation-only ranks below every placed team, then no-shows, then
 * disqualifications. Entries with the same status share a midrank.
 */
const PENALIZED: Record<string, number> = { participation_only: 1, no_show: 2, disqualified: 3 };

/** Why a single official result is not a model observation (null = eligible). */
export function resultIneligibility(entry: ObsEntry, r: ObsResult, trialEvent = false): string | null {
  if (entry.withdrawn) return "withdrawn";
  if (entry.exhibition) return "exhibition entry";
  if (entry.disqualified) return "team disqualified";
  if (r.exempt) return "exempt placing";
  if (r.status === "placed" && r.place !== null) return null;
  if (!trialEvent && PENALIZED[r.status]) return null; // ranked last (penalty)
  return r.status.replace("_", " ");
}

/** Model ordering key: official place, or below the whole field for penalties. */
function orderKey(r: ObsResult, maxPlace: number): number {
  if (r.status === "placed" && r.place !== null) return r.place;
  return maxPlace + PENALIZED[r.status];
}

export function deriveObservations(
  t: ObsTournament,
  events: ObsEvent[],
  entries: ObsEntry[],
  results: ObsResult[],
): ObservationRow[] {
  if (!t.ratingEligible) return [];
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const byEvent = new Map<string, ObsResult[]>();
  for (const r of results) {
    let arr = byEvent.get(r.tournamentEventId);
    if (!arr) byEvent.set(r.tournamentEventId, (arr = []));
    arr.push(r);
  }
  const out: ObservationRow[] = [];
  for (const ev of events) {
    if (!ev.modelEligible) continue;
    const eligible = (byEvent.get(ev.id) ?? []).filter((r) => {
      const e = entryById.get(r.entryId);
      return e && resultIneligibility(e, r, Boolean(ev.trial)) === null;
    });
    // Require at least one real placing; a field of only penalties is not a contest.
    const placed = eligible.filter((r) => r.status === "placed" && r.place !== null);
    if (!placed.length) continue;
    const maxPlace = Math.max(...placed.map((r) => r.place!));
    const key = (r: ObsResult) => orderKey(r, maxPlace);
    const nSchools = new Set(eligible.map((r) => entryById.get(r.entryId)!.schoolId)).size;
    const base = {
      tournamentEventId: ev.id,
      tournamentId: t.id,
      eventDefId: ev.eventDefId,
      division: t.division,
      season: t.season,
      startDate: t.startDate,
      endDate: t.endDate,
      nSchools,
      format: t.format,
    };

    // Team Performance: rank eligible entries (unresolved entries count as
    // competitors but produce no observation).
    const n = eligible.length;
    if (n >= 2) {
      const ranks = midranks(eligible, key);
      for (const r of eligible) {
        const e = entryById.get(r.entryId)!;
        if (!e.teamSeasonId) continue;
        const rank = ranks.get(r)!;
        out.push({
          ...base,
          view: "team",
          entityId: e.teamSeasonId,
          sourceEntryId: e.id,
          sourcePlace: r.place ?? 0,
          modelRank: rank,
          n,
          x: placementLogit(rank, n),
        });
      }
    }

    // School Potential: superscore within this tournament event — best
    // eligible finish per school — then re-rank unique schools.
    const best = new Map<string, ObsResult>();
    for (const r of eligible) {
      const e = entryById.get(r.entryId)!;
      const cur = best.get(e.schoolId);
      if (!cur || key(r) < key(cur) || (key(r) === key(cur) && e.number < entryById.get(cur.entryId)!.number)) {
        best.set(e.schoolId, r);
      }
    }
    const schoolRows = [...best.entries()];
    const ns = schoolRows.length;
    if (ns >= 2) {
      const ranks = midranks(schoolRows, ([, r]) => key(r));
      for (const row of schoolRows) {
        const [schoolId, r] = row;
        const rank = ranks.get(row)!;
        out.push({
          ...base,
          view: "school",
          entityId: schoolId,
          sourceEntryId: r.entryId,
          sourcePlace: r.place ?? 0,
          modelRank: rank,
          n: ns,
          x: placementLogit(rank, ns),
        });
      }
    }
  }
  return out;
}
