import { createHash } from "node:crypto";
import type { DB } from "../db/client";
import type { Mappings } from "../identity/mappings";
import { normText, slugify } from "../identity/normalize";
import { resolveIdentities, type RawEntry } from "../identity/resolve";
import { deriveObservations, type ObsEntry, type ObsEvent, type ObsResult } from "../rating/observations";

/**
 * Deterministic re-derivation after every import: source overrides,
 * identity resolution, event definitions, and model observations. Each
 * tournament's observation set is hashed; any tournament whose hash changes
 * (source correction, identity mapping, override) marks ratings stale from
 * its start date.
 */
export function postImport(db: DB, mappings: Mappings, preliminary: Set<string>, log: (m: string) => void) {
  const s = db.$client;
  let earliest: string | null = null;
  const t0 = Date.now();
  const lap = (m: string) => log(`post-import: ${m} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  s.transaction(() => {
    // 1. Source overrides and preliminary flags.
    s.prepare(
      `UPDATE tournaments SET format='unknown', format_basis=NULL, rating_eligible=1, exclusion_reason=NULL, superseded_by=NULL, preliminary=0`,
    ).run();
    const setPre = s.prepare(`UPDATE tournaments SET preliminary=1, rating_eligible=0, exclusion_reason=? WHERE id=?`);
    for (const id of preliminary) setPre.run("Marked preliminary by Duosmium (results not final)", id);
    const o = mappings.sourceOverrides;
    for (const x of o.supersede) {
      s.prepare(`UPDATE tournaments SET rating_eligible=0, superseded_by=?, exclusion_reason=? WHERE id=?`).run(
        x.supersededBy,
        `Superseded by ${x.supersededBy}: ${x.reason}`,
        x.file,
      );
      s.prepare(`UPDATE source_files SET status='superseded', reason=? WHERE id=?`).run(`Superseded by ${x.supersededBy}: ${x.reason}`, x.file);
    }
    for (const x of o.exclude) {
      s.prepare(`UPDATE tournaments SET rating_eligible=0, exclusion_reason=? WHERE id=?`).run(`Excluded: ${x.reason}`, x.file);
    }
    for (const x of o.format) {
      s.prepare(`UPDATE tournaments SET format=?, format_basis=? WHERE id=?`).run(x.format, x.basis, x.file);
    }
    s.prepare(`UPDATE entries SET withdrawn=0`).run();
    for (const x of o.withdrawnEntries) {
      s.prepare(`UPDATE entries SET withdrawn=1 WHERE tournament_id=? AND number=?`).run(x.file, x.number);
    }
    s.prepare(`UPDATE tournament_events SET canceled=0`).run();
    for (const x of o.canceledEvents) {
      s.prepare(`UPDATE tournament_events SET canceled=1 WHERE tournament_id=? AND name=?`).run(x.file, x.event);
    }

    // 2. Identity resolution.
    const raw = s
      .prepare(
        `SELECT e.tournament_id AS tournamentId, e.number, e.raw_school AS school, e.raw_city AS city, e.raw_state AS state,
                e.raw_suffix AS suffix, t.division, t.season, e.rank, e.exhibition,
                (SELECT COUNT(*) FROM entries x WHERE x.tournament_id = e.tournament_id AND x.exhibition = 0) AS fieldSize
         FROM entries e JOIN tournaments t ON t.id = e.tournament_id`,
      )
      .all() as RawEntry[];
    const res = resolveIdentities(raw, mappings);
    s.prepare(`DELETE FROM schools`).run();
    const insSchool = s.prepare(`INSERT INTO schools (id, name, city, state, match_key, search_text) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const sc of res.schools.values()) {
      insSchool.run(sc.id, sc.name, sc.city, sc.state, sc.matchKey, normText(`${sc.name} ${sc.city ?? ""} ${sc.state}`));
    }
    s.prepare(`DELETE FROM teams`).run();
    const insTeam = s.prepare(
      `INSERT INTO teams (id, school_id, division, designation, display_designation, first_season, last_season, mapping_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of res.teams.values()) {
      insTeam.run(t.id, t.schoolId, t.division, t.designation, t.displayDesignation, t.firstSeason, t.lastSeason, t.mappingNote);
    }
    const updEntry = s.prepare(`UPDATE entries SET school_id=?, team_id=?, resolution=?, resolution_reason=? WHERE id=?`);
    for (const [key, e] of res.entries) updEntry.run(e.schoolId, e.teamId, e.resolution, e.reason, key);

    // 3. Event definitions (division + season scoped).
    const meta = s.prepare(`SELECT division, season, events FROM event_metadata`).all() as {
      division: string;
      season: number;
      events: string;
    }[];
    const official = new Map<string, Map<string, string>>(); // div|season -> norm name -> official name
    for (const m of meta) {
      official.set(
        `${m.division}|${m.season}`,
        new Map((JSON.parse(m.events) as string[]).map((n) => [normText(n), n])),
      );
    }
    const equivalence = new Map<string, { id: string; basis: string }>();
    for (const g of mappings.eventEquivalence.groups) {
      for (const mem of g.members) equivalence.set(`${g.division}|${mem.season}|${normText(mem.event)}`, { id: g.id, basis: g.basis });
    }
    s.prepare(`DELETE FROM event_definitions`).run();
    const defs = new Map<string, { official: boolean }>();
    const insDef = s.prepare(
      `INSERT INTO event_definitions (id, division, season, name, slug, official, equivalence_group, equivalence_basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ensureDef = (division: string, season: number, name: string, isOfficial: boolean) => {
      const sl = slugify(name);
      const id = `${division}-${season}-${sl}`;
      if (!defs.has(id)) {
        const eq = isOfficial ? equivalence.get(`${division}|${season}|${normText(name)}`) : undefined;
        insDef.run(id, division, season, name, sl, isOfficial ? 1 : 0, eq?.id ?? null, eq?.basis ?? null);
        defs.set(id, { official: isOfficial });
      }
      return id;
    };
    for (const [k, names] of official) {
      const [division, season] = k.split("|");
      for (const n of names.values()) ensureDef(division, Number(season), n, true);
    }
    const tevents = s
      .prepare(
        `SELECT te.id, te.name, te.trial, te.trialed, te.canceled, t.division, t.season, t.rating_eligible AS ratingEligible,
                t.exclusion_reason AS exclusionReason,
                (SELECT COUNT(*) FROM event_results r WHERE r.tournament_id = te.tournament_id AND r.tournament_event_id = te.id AND r.status='placed') AS placed
         FROM tournament_events te JOIN tournaments t ON t.id = te.tournament_id`,
      )
      .all() as {
      id: string;
      name: string;
      trial: number;
      trialed: number;
      canceled: number;
      division: string;
      season: number;
      ratingEligible: number;
      exclusionReason: string | null;
      placed: number;
    }[];
    const updTe = s.prepare(`UPDATE tournament_events SET event_def_id=?, model_eligible=?, model_note=? WHERE id=?`);
    for (const te of tevents) {
      const off = official.get(`${te.division}|${te.season}`)?.get(normText(te.name));
      const defId = ensureDef(te.division, te.season, off ?? te.name, Boolean(off));
      let eligible = true;
      let note: string | null = null;
      if (!te.ratingEligible) {
        eligible = false;
        note = te.exclusionReason ?? "Tournament excluded from ratings";
      } else if (!off) {
        eligible = false;
        note = te.trial ? "Trial event that is not an official national event this season" : "Not an official national event this season";
      } else if (te.canceled) {
        eligible = false;
        note = "Event canceled";
      } else if (te.placed < 2) {
        eligible = false;
        note = "Fewer than two valid placements";
      } else if (te.trial || te.trialed) {
        note = te.trial
          ? "Held as a trial event; counted because it is an official national event this season with valid placements"
          : "Official event marked as trialed; counted with valid placements (flagged)";
      }
      updTe.run(defId, eligible ? 1 : 0, note, te.id);
    }
  })();

  lap("overrides, identities, event definitions done");
  // 4. Observations, per tournament, with change detection.
  const tournaments = s
    .prepare(
      `SELECT id, division, season, start_date AS startDate, end_date AS endDate, format, rating_eligible AS ratingEligible, obs_hash AS obsHash FROM tournaments`,
    )
    .all() as {
    id: string;
    division: string;
    season: number;
    startDate: string;
    endDate: string;
    format: string;
    ratingEligible: number;
    obsHash: string | null;
  }[];
  const qEvents = s.prepare(
    `SELECT id, event_def_id AS eventDefId, model_eligible AS modelEligible, (trial OR trialed) AS trial FROM tournament_events WHERE tournament_id=?`,
  );
  const qEntries = s.prepare(
    `SELECT id, school_id AS schoolId, team_id AS teamId, exhibition, disqualified, withdrawn, number FROM entries WHERE tournament_id=?`,
  );
  const qResults = s.prepare(
    `SELECT entry_id AS entryId, tournament_event_id AS tournamentEventId, status, place, exempt FROM event_results WHERE tournament_id=?`,
  );
  const insObs = s.prepare(
    `INSERT INTO observations (view, tournament_event_id, entity_id, tournament_id, event_def_id, division, season, start_date, end_date,
      source_entry_id, source_place, model_rank, n, n_schools, x, format)
     VALUES (@view, @tournamentEventId, @entityId, @tournamentId, @eventDefId, @division, @season, @startDate, @endDate,
      @sourceEntryId, @sourcePlace, @modelRank, @n, @nSchools, @x, @format)`,
  );
  const setHash = s.prepare(`UPDATE tournaments SET obs_hash=? WHERE id=?`);
  const changed: { id: string; hash: string; rows: ReturnType<typeof deriveObservations> }[] = [];
  for (const t of tournaments) {
    const events = (qEvents.all(t.id) as { id: string; eventDefId: string; modelEligible: number; trial: number }[]).map(
      (e): ObsEvent => ({ id: e.id, eventDefId: e.eventDefId, modelEligible: Boolean(e.modelEligible), trial: Boolean(e.trial) }),
    );
    const entries = (qEntries.all(t.id) as Record<string, unknown>[]).map(
      (e): ObsEntry => ({
        id: e.id as string,
        schoolId: e.schoolId as string,
        teamId: (e.teamId as string | null) ?? null,
        exhibition: Boolean(e.exhibition),
        disqualified: Boolean(e.disqualified),
        withdrawn: Boolean(e.withdrawn),
        number: e.number as number,
      }),
    );
    const results = (qResults.all(t.id) as Record<string, unknown>[]).map(
      (r): ObsResult => ({
        entryId: r.entryId as string,
        tournamentEventId: r.tournamentEventId as string,
        status: r.status as string,
        place: (r.place as number | null) ?? null,
        exempt: Boolean(r.exempt),
      }),
    );
    const rows = deriveObservations({ ...t, ratingEligible: Boolean(t.ratingEligible) }, events, entries, results);
    const h = createHash("sha256");
    for (const r of rows) {
      h.update(`${r.view}|${r.tournamentEventId}|${r.entityId}|${r.modelRank}|${r.n}|${r.nSchools}|${r.format}|${r.endDate}|${r.eventDefId}
`);
    }
    const hash = h.digest("hex");
    if (hash === t.obsHash) continue;
    changed.push({ id: t.id, hash, rows });
    if (!earliest || t.startDate < earliest) earliest = t.startDate;
  }
  // Observations of tournaments that no longer exist are removed too.
  s.transaction(() => {
    s.prepare(`CREATE TEMP TABLE IF NOT EXISTS changed_t (id TEXT PRIMARY KEY)`).run();
    s.prepare(`DELETE FROM changed_t`).run();
    const insChanged = s.prepare(`INSERT INTO changed_t (id) VALUES (?)`);
    for (const c of changed) insChanged.run(c.id);
    s.prepare(
      `DELETE FROM observations WHERE tournament_id IN (SELECT id FROM changed_t) OR tournament_id NOT IN (SELECT id FROM tournaments)`,
    ).run();
    for (const c of changed) {
      for (const r of c.rows) insObs.run(r);
      setHash.run(c.hash, c.id);
    }
  })();
  const changedTournaments = changed.length;
  // Deleted tournaments leave no observations behind (removeTournament).

  const identity = {
    unresolvedEntries: (s.prepare(`SELECT COUNT(*) c FROM entries WHERE resolution='unresolved'`).get() as { c: number }).c,
    schools: (s.prepare(`SELECT COUNT(*) c FROM schools`).get() as { c: number }).c,
    teams: (s.prepare(`SELECT COUNT(*) c FROM teams`).get() as { c: number }).c,
  };
  s.prepare(`INSERT INTO kv (key, value) VALUES ('mappings_fingerprint', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    mappings.fingerprint,
  );
  log(`post-import: ${changedTournaments} tournaments with changed model observations; identity ${JSON.stringify(identity)}`);
  return { earliestAffectedDate: earliest as string | null, identity, changedTournaments };
}
