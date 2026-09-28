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

/** Why a single official result is not a model observation (null = eligible). */
export function resultIneligibility(entry: ObsEntry, r: ObsResult): string | null {
  if (entry.withdrawn) return "withdrawn";
  if (entry.exhibition) return "exhibition entry";
  if (entry.disqualified) return "team disqualified";
  if (r.status !== "placed" || r.place === null) return r.status.replace("_", " ");
  if (r.exempt) return "exempt placing";
  return null;
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
      return e && resultIneligibility(e, r) === null;
    });
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
      const ranks = midranks(eligible, (r) => r.place!);
      for (const r of eligible) {
        const e = entryById.get(r.entryId)!;
        if (!e.teamSeasonId) continue;
        const rank = ranks.get(r)!;
        out.push({
          ...base,
          view: "team",
          entityId: e.teamSeasonId,
          sourceEntryId: e.id,
          sourcePlace: r.place!,
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
      if (
        !cur ||
        r.place! < cur.place! ||
        (r.place === cur.place && e.number < entryById.get(cur.entryId)!.number)
      ) {
        best.set(e.schoolId, r);
      }
    }
    const schoolRows = [...best.entries()];
    const ns = schoolRows.length;
    if (ns >= 2) {
      const ranks = midranks(schoolRows, ([, r]) => r.place!);
      for (const row of schoolRows) {
        const [schoolId, r] = row;
        const rank = ranks.get(row)!;
        out.push({
          ...base,
          view: "school",
          entityId: schoolId,
          sourceEntryId: r.entryId,
          sourcePlace: r.place!,
          modelRank: rank,
          n: ns,
          x: placementLogit(rank, ns),
        });
      }
    }
  }
  return out;
}
