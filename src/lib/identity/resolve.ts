import type { Mappings } from "./mappings";
import { normDesignation, normText, schoolIdFromKey, schoolMatchKey, teamSeasonId } from "./normalize";

export interface RawEntry {
  tournamentId: string;
  number: number;
  school: string;
  city: string | null;
  state: string;
  suffix: string | null;
  division: string;
  season: number;
}

export interface ResolvedEntry {
  schoolId: string;
  teamSeasonId: string | null;
  designation: string | null;
  displayDesignation: string | null;
  resolution: "resolved" | "unresolved";
  reason: string | null;
}

export interface ResolvedSchool {
  id: string;
  name: string;
  city: string | null;
  state: string;
  matchKey: string;
}

export interface ResolvedTeamSeason {
  id: string;
  schoolId: string;
  division: string;
  season: number;
  designation: string;
  displayDesignation: string;
  mappingNote: string | null;
}

export interface Resolution {
  schools: Map<string, ResolvedSchool>;
  teamSeasons: Map<string, ResolvedTeamSeason>;
  entries: Map<string, ResolvedEntry>; // key: tournamentId#number
}

export const entryKey = (tournamentId: string, number: number) => `${tournamentId}#${number}`;

/**
 * Deterministic identity resolution.
 *
 *  - School = normalized name + city + state, after reviewed aliases.
 *  - TeamSeason = school + division + season + normalized designation.
 *  - An unlabeled entry is its own "unlabeled" team only when it is the
 *    school's sole entry at that tournament; otherwise it is unresolved.
 *    Unlabeled teams are never assumed to be the "A" team.
 *  - Duplicate designations within a tournament are unresolved.
 *  - Finishing place and team numbers are never used for identity.
 */
export function resolveIdentities(raw: RawEntry[], mappings: Mappings): Resolution {
  const aliasMap = new Map<string, { name: string; city: string | null; state: string }>();
  for (const a of mappings.schoolAliases.aliases) {
    aliasMap.set(schoolMatchKey({ name: a.from.name, city: a.from.city ?? null, state: a.from.state }), {
      name: a.to.name,
      city: a.to.city ?? null,
      state: a.to.state,
    });
  }
  const entryOverride = new Map<string, { designation?: string; unresolved?: string; reason: string }>();
  for (const e of mappings.teamIdentity.entries) entryOverride.set(entryKey(e.tournament, e.number), e);
  const merges = new Map<string, { into: string; reason: string }>();
  for (const m of mappings.teamIdentity.merges) {
    merges.set(`${m.school}|${m.division}|${m.season}|${normDesignation(m.from)}`, {
      into: normDesignation(m.into),
      reason: m.reason,
    });
  }

  // 1. Schools
  const nameVotes = new Map<string, Map<string, number>>();
  const schoolOf = new Map<string, { key: string; place: { name: string; city: string | null; state: string } }>();
  for (const r of raw) {
    const origKey = schoolMatchKey({ name: r.school, city: r.city, state: r.state });
    const alias = aliasMap.get(origKey);
    const place = alias ?? { name: r.school, city: r.city, state: r.state };
    const key = alias ? schoolMatchKey(alias) : origKey;
    schoolOf.set(entryKey(r.tournamentId, r.number), { key, place });
    let votes = nameVotes.get(key);
    if (!votes) nameVotes.set(key, (votes = new Map()));
    const label = JSON.stringify([place.name, place.city ?? null, place.state]);
    votes.set(label, (votes.get(label) ?? 0) + (alias ? 1000 : 1));
  }
  const schools = new Map<string, ResolvedSchool>();
  for (const [key, votes] of nameVotes) {
    const [label] = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const [name, city, state] = JSON.parse(label) as [string, string | null, string];
    const id = schoolIdFromKey(key);
    schools.set(id, { id, name, city, state: state.toUpperCase(), matchKey: key });
  }

  // 2. Team seasons, grouped per tournament + school.
  const groups = new Map<string, RawEntry[]>();
  for (const r of raw) {
    const s = schoolOf.get(entryKey(r.tournamentId, r.number))!;
    const g = `${r.tournamentId}|${s.key}`;
    let arr = groups.get(g);
    if (!arr) groups.set(g, (arr = []));
    arr.push(r);
  }

  const entries = new Map<string, ResolvedEntry>();
  const teamSeasons = new Map<string, ResolvedTeamSeason>();
  const displayVotes = new Map<string, Map<string, number>>();

  for (const [, group] of groups) {
    const schoolId = schoolIdFromKey(schoolOf.get(entryKey(group[0].tournamentId, group[0].number))!.key);
    const desig = group.map((r) => {
      const ov = entryOverride.get(entryKey(r.tournamentId, r.number));
      if (ov?.unresolved) return { r, d: null as string | null, display: r.suffix, note: ov.reason, forced: "unresolved" as const };
      if (ov?.designation !== undefined) {
        return { r, d: normDesignation(ov.designation), display: ov.designation, note: ov.reason, forced: "resolved" as const };
      }
      return { r, d: normDesignation(r.suffix), display: r.suffix ?? "", note: null, forced: null };
    });
    const counts = new Map<string, number>();
    for (const x of desig) if (x.d !== null) counts.set(x.d, (counts.get(x.d) ?? 0) + 1);

    for (const x of desig) {
      const key = entryKey(x.r.tournamentId, x.r.number);
      let reason: string | null = null;
      if (x.forced === "unresolved") reason = `Mapped as unresolved: ${x.note}`;
      else if (x.forced !== "resolved") {
        if (x.d === "" && group.length > 1) {
          reason = `No team designation, and this school fielded ${group.length} entries at this tournament`;
        } else if (x.d !== null && (counts.get(x.d) ?? 0) > 1) {
          reason = `Designation "${x.display}" is used by more than one entry from this school at this tournament`;
        }
      }
      if (reason || x.d === null) {
        entries.set(key, {
          schoolId,
          teamSeasonId: null,
          designation: null,
          displayDesignation: x.display || null,
          resolution: "unresolved",
          reason: reason ?? "Unresolved",
        });
        continue;
      }
      let d = x.d;
      let note = x.note;
      const merge = merges.get(`${schoolId}|${x.r.division}|${x.r.season}|${d}`);
      if (merge) {
        d = merge.into;
        note = `Merged by reviewed mapping: ${merge.reason}`;
      }
      const id = teamSeasonId(schoolId, x.r.division, x.r.season, d);
      if (!teamSeasons.has(id)) {
        teamSeasons.set(id, {
          id,
          schoolId,
          division: x.r.division,
          season: x.r.season,
          designation: d,
          displayDesignation: "",
          mappingNote: note,
        });
      } else if (note && !teamSeasons.get(id)!.mappingNote) {
        teamSeasons.get(id)!.mappingNote = note;
      }
      let v = displayVotes.get(id);
      if (!v) displayVotes.set(id, (v = new Map()));
      const disp = (merge ? "" : x.display)?.trim() || "";
      v.set(disp, (v.get(disp) ?? 0) + 1);
      entries.set(key, {
        schoolId,
        teamSeasonId: id,
        designation: d,
        displayDesignation: x.display || null,
        resolution: "resolved",
        reason: note,
      });
    }
  }
  for (const [id, votes] of displayVotes) {
    const ts = teamSeasons.get(id)!;
    const best = [...votes.entries()].filter(([k]) => k !== "").sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    ts.displayDesignation = ts.designation === "" ? "" : (best?.[0] ?? ts.designation.toUpperCase());
  }
  return { schools, teamSeasons, entries };
}

/** Human label for a team designation. */
export function designationLabel(display: string | null | undefined): string {
  return display && display.trim() ? display.trim() : "Unlabeled team";
}

export const _test = { normText };
