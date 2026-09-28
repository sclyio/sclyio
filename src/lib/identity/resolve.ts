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
  /** Official overall rank and field size (used only to rank a school's labeled teams). */
  rank?: number | null;
  fieldSize?: number | null;
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
  // Unlabeled entries wait until every labeled team is known (pass 2).
  const pending: { r: RawEntry; schoolId: string; display: string; tournamentTeams: Set<string>; groupKey: string }[] = [];

  const assign = (r: RawEntry, schoolId: string, d: string, display: string, note: string | null, fromMerge: boolean) => {
    const id = teamSeasonId(schoolId, r.division, r.season, d);
    if (!teamSeasons.has(id)) {
      teamSeasons.set(id, { id, schoolId, division: r.division, season: r.season, designation: d, displayDesignation: "", mappingNote: note });
    } else if (note && !teamSeasons.get(id)!.mappingNote) {
      teamSeasons.get(id)!.mappingNote = note;
    }
    let v = displayVotes.get(id);
    if (!v) displayVotes.set(id, (v = new Map()));
    const disp = (fromMerge ? "" : display)?.trim() || "";
    v.set(disp, (v.get(disp) ?? 0) + 1);
    entries.set(entryKey(r.tournamentId, r.number), {
      schoolId,
      teamSeasonId: id,
      designation: d,
      displayDesignation: display || null,
      resolution: "resolved",
      reason: note,
    });
    return id;
  };

  // Pass 1: labeled entries (and reviewed per-entry mappings).
  for (const [groupKey, group] of groups) {
    const schoolId = schoolIdFromKey(schoolOf.get(entryKey(group[0].tournamentId, group[0].number))!.key);
    const present = new Set<string>();
    const desig = group.map((r) => {
      const ov = entryOverride.get(entryKey(r.tournamentId, r.number));
      if (ov?.unresolved) return { r, d: null as string | null, display: r.suffix, note: ov.reason, forced: "unresolved" as const };
      if (ov?.designation !== undefined) {
        return { r, d: normDesignation(ov.designation), display: ov.designation, note: ov.reason, forced: "resolved" as const };
      }
      return { r, d: normDesignation(r.suffix), display: r.suffix ?? "", note: null, forced: null };
    });
    const counts = new Map<string, number>();
    for (const x of desig) if (x.d) counts.set(x.d, (counts.get(x.d) ?? 0) + 1);

    for (const x of desig) {
      const key = entryKey(x.r.tournamentId, x.r.number);
      const unresolved = (reason: string) =>
        entries.set(key, { schoolId, teamSeasonId: null, designation: null, displayDesignation: x.display || null, resolution: "unresolved", reason });
      if (x.forced === "unresolved" || x.d === null) {
        unresolved(`Mapped as unresolved: ${x.note}`);
        continue;
      }
      if (x.d === "" && x.forced !== "resolved") {
        pending.push({ r: x.r, schoolId, display: x.display ?? "", tournamentTeams: present, groupKey });
        continue;
      }
      if (x.forced !== "resolved" && (counts.get(x.d) ?? 0) > 1) {
        unresolved(`Designation "${x.display}" is used by more than one entry from this school at this tournament`);
        continue;
      }
      let d = x.d;
      let note = x.note;
      const merge = merges.get(`${schoolId}|${x.r.division}|${x.r.season}|${d}`);
      if (merge) {
        d = merge.into;
        note = `Merged by reviewed mapping: ${merge.reason}`;
      }
      present.add(assign(x.r, schoolId, d, x.display ?? "", note, Boolean(merge)));
    }
  }

  // Strength of each labeled team-season: mean finishing percentile (rank / field)
  // over its labeled entries. Uses official placements only, never ratings.
  const strength = new Map<string, { sum: number; n: number }>();
  for (const r of raw) {
    const e = entries.get(entryKey(r.tournamentId, r.number));
    if (!e?.teamSeasonId || !e.designation || !r.rank || !r.fieldSize) continue;
    const st = strength.get(e.teamSeasonId) ?? { sum: 0, n: 0 };
    st.sum += r.rank / r.fieldSize;
    st.n++;
    strength.set(e.teamSeasonId, st);
  }
  const labeledBySchoolSeason = new Map<string, string[]>();
  for (const ts of teamSeasons.values()) {
    if (!ts.designation) continue;
    const k = `${ts.schoolId}|${ts.division}|${ts.season}`;
    let arr = labeledBySchoolSeason.get(k);
    if (!arr) labeledBySchoolSeason.set(k, (arr = []));
    arr.push(ts.id);
  }
  const score = (id: string) => {
    const st = strength.get(id);
    return st ? st.sum / st.n : Number.POSITIVE_INFINITY;
  };
  for (const arr of labeledBySchoolSeason.values()) {
    arr.sort((x, y) => score(x) - score(y) || (strength.get(y)?.n ?? 0) - (strength.get(x)?.n ?? 0) || (x < y ? -1 : 1));
  }

  // Pass 2: each unlabeled entry joins the school's highest-ranking labeled team
  // that is not already at this tournament. Several unlabeled entries at one
  // tournament are assigned in official finishing order.
  pending.sort(
    (x, y) =>
      (x.groupKey < y.groupKey ? -1 : x.groupKey > y.groupKey ? 1 : 0) ||
      (x.r.rank ?? Number.POSITIVE_INFINITY) - (y.r.rank ?? Number.POSITIVE_INFINITY) ||
      x.r.number - y.r.number,
  );
  const pendingPerGroup = new Map<string, number>();
  for (const p of pending) pendingPerGroup.set(p.groupKey, (pendingPerGroup.get(p.groupKey) ?? 0) + 1);
  for (const p of pending) {
    const candidates = labeledBySchoolSeason.get(`${p.schoolId}|${p.r.division}|${p.r.season}`) ?? [];
    const target = candidates.find((id) => !p.tournamentTeams.has(id));
    if (target) {
      const ts = teamSeasons.get(target)!;
      p.tournamentTeams.add(assign(p.r, p.schoolId, ts.designation, "", "Unlabeled entry assigned to the school's top-ranked labeled team", true));
    } else if (candidates.length === 0 && pendingPerGroup.get(p.groupKey) === 1) {
      // No labeled team exists for this school-season: its own "unlabeled" team.
      p.tournamentTeams.add(assign(p.r, p.schoolId, "", p.display, null, false));
    } else {
      entries.set(entryKey(p.r.tournamentId, p.r.number), {
        schoolId: p.schoolId,
        teamSeasonId: null,
        designation: null,
        displayDesignation: p.display || null,
        resolution: "unresolved",
        reason:
          candidates.length === 0
            ? "No team designation, and this school fielded several unlabeled entries at this tournament"
            : "No team designation, and every labeled team of this school already competed at this tournament",
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
