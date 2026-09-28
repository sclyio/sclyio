import type { Mappings } from "./mappings";
import { schoolIdFromKey, schoolMatchKey, teamIdOf } from "./normalize";

export interface RawEntry {
  tournamentId: string;
  number: number;
  school: string;
  city: string | null;
  state: string;
  suffix: string | null;
  division: string;
  season: number;
  /** Official overall rank at the tournament (orders a school's entries). */
  rank?: number | null;
  fieldSize?: number | null;
  exhibition?: boolean;
}

export interface ResolvedEntry {
  schoolId: string;
  teamId: string | null;
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

export interface ResolvedTeam {
  id: string;
  schoolId: string;
  division: string;
  designation: string;
  displayDesignation: string;
  firstSeason: number;
  lastSeason: number;
  mappingNote: string | null;
}

export interface Resolution {
  schools: Map<string, ResolvedSchool>;
  teams: Map<string, ResolvedTeam>;
  entries: Map<string, ResolvedEntry>; // key: tournamentId#number
}

export const entryKey = (tournamentId: string, number: number) => `${tournamentId}#${number}`;

/**
 * Deterministic identity resolution.
 *
 *  - School = normalized name + city + state, after reviewed aliases.
 *    Same-named schools in different places are never merged automatically.
 *  - Teams are numbered by finish: at each tournament, a school's entries are
 *    ordered by official overall rank. The best finisher is that school's
 *    "Team 1" for the season, the next "Team 2", and so on. Team labels in the
 *    source (e.g. "Gold", "A") and tournament team numbers are not used.
 *    Exhibition entries are ordered after competitive entries.
 *  - Team = school + division + team number, across seasons: Team 1 in 2000
 *    and Team 1 in 2025 are the same team.
 *  - A reviewed mapping can mark an entry unresolved (excluded from team ratings).
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
  const unresolvedOverride = new Map<string, string>();
  for (const e of mappings.teamIdentity.entries) {
    if (e.unresolved) unresolvedOverride.set(entryKey(e.tournament, e.number), e.unresolved);
  }

  // 1. Schools
  const nameVotes = new Map<string, Map<string, number>>();
  const schoolOf = new Map<string, { key: string }>();
  for (const r of raw) {
    const origKey = schoolMatchKey({ name: r.school, city: r.city, state: r.state });
    const alias = aliasMap.get(origKey);
    const place = alias ?? { name: r.school, city: r.city, state: r.state };
    const key = alias ? schoolMatchKey(alias) : origKey;
    schoolOf.set(entryKey(r.tournamentId, r.number), { key });
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

  // 2. Teams by finish order within each tournament.
  const groups = new Map<string, RawEntry[]>();
  for (const r of raw) {
    const g = `${r.tournamentId}|${schoolOf.get(entryKey(r.tournamentId, r.number))!.key}`;
    let arr = groups.get(g);
    if (!arr) groups.set(g, (arr = []));
    arr.push(r);
  }

  const entries = new Map<string, ResolvedEntry>();
  const teams = new Map<string, ResolvedTeam>();
  const INF = Number.POSITIVE_INFINITY;
  for (const group of groups.values()) {
    const schoolId = schoolIdFromKey(schoolOf.get(entryKey(group[0].tournamentId, group[0].number))!.key);
    const ordered = [...group].sort(
      (a, b) => Number(Boolean(a.exhibition)) - Number(Boolean(b.exhibition)) || (a.rank ?? INF) - (b.rank ?? INF) || a.number - b.number,
    );
    let n = 0;
    for (const r of ordered) {
      const key = entryKey(r.tournamentId, r.number);
      const forced = unresolvedOverride.get(key);
      if (forced) {
        entries.set(key, {
          schoolId,
          teamId: null,
          designation: null,
          displayDesignation: r.suffix,
          resolution: "unresolved",
          reason: `Mapped as unresolved: ${forced}`,
        });
        continue;
      }
      n++;
      const designation = `team ${n}`;
      const display = `Team ${n}`;
      const id = teamIdOf(schoolId, r.division, designation);
      const team = teams.get(id);
      if (!team) {
        teams.set(id, {
          id,
          schoolId,
          division: r.division,
          designation,
          displayDesignation: display,
          firstSeason: r.season,
          lastSeason: r.season,
          mappingNote: null,
        });
      } else {
        team.firstSeason = Math.min(team.firstSeason, r.season);
        team.lastSeason = Math.max(team.lastSeason, r.season);
      }
      entries.set(key, { schoolId, teamId: id, designation, displayDesignation: display, resolution: "resolved", reason: null });
    }
  }
  return { schools, teams, entries };
}
