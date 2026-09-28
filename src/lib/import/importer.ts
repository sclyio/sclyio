import yaml from "js-yaml";
import type { DB } from "../db/client";
import { PARSER_VERSION } from "../rating/config";
import type { Mappings } from "../identity/mappings";
import { mapLimit } from "../source/http";
import {
  fileDate,
  fileDivision,
  gitBlobSha,
  parseEventsCsv,
  seasonForDate,
  sha256,
} from "../source/duosmium";
import { parseSciolyff, validateSciolyff, type ParsedTournament } from "../source/duosmium-parse";
import type { SourceAdapter, SourceFileRef } from "../source/types";
import { postImport } from "./post-import";

export interface ImportOptions {
  db: DB;
  adapter: SourceAdapter;
  mappings: Mappings;
  mode: "full" | "incremental";
  /** Explicit seasons, "all" (every season in the source), or "auto" = two most recent completed + current if present. */
  seasons: number[] | "auto" | "all";
  divisions: string[];
  concurrency: number;
  /** Today's date (ISO) — injectable for tests. */
  today: string;
  log: (msg: string) => void;
}

export interface ImportSummary {
  runId: number;
  status: "success" | "partial" | "failed";
  sourceRevision: string | null;
  seasons: number[];
  seen: number;
  selected: number;
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
  quarantined: number;
  skipped: number;
  earliestAffectedDate: string | null;
  identity: { unresolvedEntries: number; schools: number; teams: number };
}

export function chooseSeasons(ids: string[], today: string, requested: number[] | "auto" | "all"): number[] {
  if (requested === "all") return [...new Set(ids.map((id) => seasonForDate(fileDate(id))))].sort();
  if (requested !== "auto") return [...requested].sort();
  const current = seasonForDate(today);
  const present = new Set(ids.map((id) => seasonForDate(fileDate(id))));
  const completed = [...present].filter((s) => s < current).sort((a, b) => b - a).slice(0, 2);
  if (present.has(current)) completed.push(current);
  return completed.sort();
}

function nowIso() {
  return new Date().toISOString();
}

export async function runImport(opts: ImportOptions): Promise<ImportSummary> {
  const { db, adapter, log } = opts;
  const sqlite = db.$client;
  const startedAt = nowIso();
  const runId = Number(
    sqlite
      .prepare(
        `INSERT INTO import_runs (started_at, mode, adapter, status) VALUES (?, ?, ?, 'running')`,
      )
      .run(startedAt, opts.mode, adapter.name).lastInsertRowid,
  );
  const change = sqlite.prepare(
    `INSERT INTO import_changes (run_id, file_id, change, old_hash, new_hash, detail) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const counts = { added: 0, changed: 0, unchanged: 0, removed: 0, quarantined: 0, skipped: 0 };
  let earliest: string | null = null;
  const touch = (d: string | null | undefined) => {
    if (d && (!earliest || d < earliest)) earliest = d;
  };

  try {
    const revision = await adapter.revision();
    log(`source ${adapter.name} revision ${revision ?? "(unknown)"}`);
    const all = await adapter.listResultFiles();
    const seasons = chooseSeasons(all.map((f) => f.id), opts.today, opts.seasons);
    log(`listing: ${all.length} result files; importing seasons ${seasons.join(", ")} divisions ${opts.divisions.join(", ")}`);

    // Pre-filter by file name (division suffix + date window) to avoid
    // downloading out-of-scope files; the parsed `year` is checked later.
    const inScope = (id: string) => {
      const div = fileDivision(id);
      if (!div || !opts.divisions.includes(div)) return false;
      return seasons.includes(seasonForDate(fileDate(id)));
    };
    const selected = all.filter((f) => inScope(f.id));
    log(`${selected.length} files selected`);

    // Event metadata (versioned official event lists).
    for (const div of opts.divisions) {
      const name = `events-${div.toLowerCase()}.csv`;
      const text = await adapter.readDataFile(name);
      if (!text) {
        log(`warning: ${name} missing from source`);
        continue;
      }
      const hash = sha256(text);
      for (const [season, events] of parseEventsCsv(text)) {
        sqlite
          .prepare(
            `INSERT INTO event_metadata (division, season, events, source_path, source_revision, content_hash)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(division, season) DO UPDATE SET events=excluded.events, source_path=excluded.source_path,
               source_revision=excluded.source_revision, content_hash=excluded.content_hash`,
          )
          .run(div, season, JSON.stringify(events), `data/${name}`, revision, hash);
      }
    }
    const prelimText = await adapter.readDataFile("preliminary.yaml");
    const preliminary = new Set<string>(
      prelimText ? ((yaml.load(prelimText) as string[] | null) ?? []).map((s) => String(s).replace(/\/$/, "")) : [],
    );
    sqlite
      .prepare(`INSERT INTO kv (key, value) VALUES ('preliminary_files', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run(JSON.stringify([...preliminary]));

    const existing = new Map(
      (
        sqlite.prepare(`SELECT id, blob_sha, content_hash, status, parser_version FROM source_files`).all() as {
          id: string;
          blob_sha: string | null;
          content_hash: string;
          status: string;
          parser_version: string;
        }[]
      ).map((r) => [r.id, r]),
    );

    // Incremental: skip files whose git blob SHA is unchanged.
    const toFetch: SourceFileRef[] = [];
    for (const f of selected) {
      const prev = existing.get(f.id);
      // A parser upgrade re-derives every file even when its bytes are unchanged.
      if (
        opts.mode === "incremental" &&
        prev &&
        f.blobSha &&
        prev.blob_sha === f.blobSha &&
        prev.status !== "removed" &&
        prev.parser_version === PARSER_VERSION
      ) {
        counts.unchanged++;
      } else {
        toFetch.push(f);
      }
    }
    log(`${toFetch.length} files to fetch/verify (${counts.unchanged} unchanged by blob SHA)`);

    const upsertSource = sqlite.prepare(
      `INSERT INTO source_files (id, path, blob_sha, content_hash, source_revision, fetched_at, parser_version, status, reason, warnings, result_url, last_run_id)
       VALUES (@id, @path, @blobSha, @contentHash, @rev, @fetchedAt, @parser, @status, @reason, @warnings, @url, @runId)
       ON CONFLICT(id) DO UPDATE SET path=excluded.path, blob_sha=excluded.blob_sha, content_hash=excluded.content_hash,
         source_revision=excluded.source_revision, fetched_at=excluded.fetched_at, parser_version=excluded.parser_version,
         status=excluded.status, reason=excluded.reason, warnings=excluded.warnings, result_url=excluded.result_url,
         last_run_id=excluded.last_run_id`,
    );

    const BATCH = 24;
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const chunk = toFetch.slice(i, i + BATCH);
      const fetched = await mapLimit(chunk, opts.concurrency, async (ref) => {
        try {
          return { ref, buf: await adapter.readResultFile(ref), error: null as string | null };
        } catch (e) {
          return { ref, buf: null, error: e instanceof Error ? e.message : String(e) };
        }
      });
      for (const { ref, buf, error } of fetched) {
        const fetchedAt = nowIso();
        const prev = existing.get(ref.id);
        const base = {
          id: ref.id,
          path: ref.path,
          rev: revision,
          fetchedAt,
          parser: PARSER_VERSION,
          url: adapter.resultUrl(ref.id),
          runId,
        };
        if (!buf) {
          // Fetch failure: keep any previously imported version untouched.
          counts.quarantined++;
          change.run(runId, ref.id, "quarantined", prev?.content_hash ?? null, null, `fetch failed: ${error}`);
          if (!prev) {
            upsertSource.run({ ...base, blobSha: ref.blobSha ?? null, contentHash: "", status: "quarantined", reason: `Fetch failed: ${error}`, warnings: 0 });
          }
          log(`quarantine ${ref.id}: fetch failed: ${error}`);
          continue;
        }
        const contentHash = sha256(buf);
        const blobSha = ref.blobSha ?? gitBlobSha(buf);
        if (prev && prev.content_hash === contentHash && prev.status === "imported" && prev.parser_version === PARSER_VERSION) {
          counts.unchanged++;
          sqlite.prepare(`UPDATE source_files SET blob_sha=?, source_revision=?, last_run_id=? WHERE id=?`).run(blobSha, revision, runId, ref.id);
          continue;
        }
        const text = buf.toString("utf8");
        const v = await validateSciolyff(text);
        if (!v.accepted) {
          counts.quarantined++;
          const keep = prev?.status === "imported" ? " (previous valid version kept)" : "";
          change.run(runId, ref.id, "quarantined", prev?.content_hash ?? null, contentHash, v.message + keep);
          if (prev?.status === "imported") {
            sqlite.prepare(`UPDATE source_files SET reason=?, last_run_id=? WHERE id=?`).run(`Newer revision failed validation: ${v.message}`, runId, ref.id);
          } else {
            upsertSource.run({ ...base, blobSha, contentHash, status: "quarantined", reason: `SciolyFF validation failed: ${v.message}`, warnings: v.warnings });
          }
          log(`quarantine ${ref.id}: ${v.message}`);
          continue;
        }
        let parsed: ParsedTournament;
        try {
          parsed = parseSciolyff(text);
        } catch (e) {
          counts.quarantined++;
          const msg = e instanceof Error ? e.message : String(e);
          change.run(runId, ref.id, "quarantined", prev?.content_hash ?? null, contentHash, `interpretation failed: ${msg}`);
          if (prev?.status !== "imported") {
            upsertSource.run({ ...base, blobSha, contentHash, status: "quarantined", reason: `Interpretation failed: ${msg}`, warnings: v.warnings });
          }
          log(`quarantine ${ref.id}: ${msg}`);
          continue;
        }
        if (!opts.divisions.includes(parsed.division) || !seasons.includes(parsed.season)) {
          counts.skipped++;
          const reason = `Out of configured scope (division ${parsed.division}, season ${parsed.season})`;
          upsertSource.run({ ...base, blobSha, contentHash, status: "skipped", reason, warnings: v.warnings });
          change.run(runId, ref.id, "skipped", prev?.content_hash ?? null, contentHash, reason);
          if (prev?.status === "imported") removeTournament(db, ref.id);
          continue;
        }
        const oldStart = sqlite.prepare(`SELECT start_date FROM tournaments WHERE id=?`).get(ref.id) as { start_date: string } | undefined;
        writeTournament(db, ref.id, parsed, {
          contentHash,
          resultUrl: base.url,
          importedAt: fetchedAt,
          preliminary: preliminary.has(ref.id),
        });
        upsertSource.run({
          ...base,
          blobSha,
          contentHash,
          status: "imported",
          reason: v.metadataIssues.length
            ? `Imported with award-metadata validation issues (placings unaffected): ${v.metadataIssues.join("; ")}`
            : null,
          warnings: v.warnings,
        });
        const kind = prev && prev.status === "imported" ? "changed" : "added";
        const reparsed = kind === "changed" && prev!.content_hash === contentHash;
        if (reparsed) counts.unchanged++;
        else counts[kind]++;
        change.run(
          runId,
          ref.id,
          reparsed ? "reparsed" : kind,
          prev?.content_hash ?? null,
          contentHash,
          reparsed ? `re-parsed with ${PARSER_VERSION}` : kind === "changed" ? "source content changed (correction or update)" : null,
        );
        // A re-parse only matters to ratings if the derived observations
        // change; post-import detects that via each tournament's obs hash.
        if (!reparsed) {
          touch(parsed.startDate);
          touch(oldStart?.start_date);
        }
      }
      log(`processed ${Math.min(i + BATCH, toFetch.length)}/${toFetch.length}`);
    }

    // Files that disappeared from the source listing.
    const listed = new Set(selected.map((f) => f.id));
    for (const [id, prev] of existing) {
      if (prev.status !== "imported" || listed.has(id)) continue;
      if (!inScope(id)) continue;
      const t = sqlite.prepare(`SELECT start_date FROM tournaments WHERE id=?`).get(id) as { start_date: string } | undefined;
      removeTournament(db, id);
      sqlite.prepare(`UPDATE source_files SET status='removed', reason='No longer present in source', last_run_id=? WHERE id=?`).run(runId, id);
      change.run(runId, id, "removed", prev.content_hash, null, "file removed from source");
      counts.removed++;
      touch(t?.start_date);
    }

    // Identity, event definitions, observations (re-derived deterministically).
    const post = postImport(db, opts.mappings, preliminary, log);
    touch(post.earliestAffectedDate);

    const status = counts.quarantined > 0 ? "partial" : "success";
    const summary: ImportSummary = {
      runId,
      status,
      sourceRevision: revision,
      seasons,
      seen: all.length,
      selected: selected.length,
      ...counts,
      earliestAffectedDate: earliest,
      identity: post.identity,
    };
    sqlite
      .prepare(
        `UPDATE import_runs SET finished_at=?, source_revision=?, status=?, files_seen=?, files_added=?, files_changed=?,
         files_unchanged=?, files_removed=?, files_quarantined=?, files_skipped=?, earliest_affected_date=?, summary=? WHERE id=?`,
      )
      .run(
        nowIso(),
        revision,
        status,
        all.length,
        counts.added,
        counts.changed,
        counts.unchanged,
        counts.removed,
        counts.quarantined,
        counts.skipped,
        earliest,
        JSON.stringify(summary),
        runId,
      );
    const setKv = sqlite.prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    setKv.run("last_successful_sync", nowIso());
    setKv.run("source_revision", revision ?? "unknown");
    setKv.run("source_adapter", adapter.name);
    setKv.run("imported_seasons", JSON.stringify(seasons));
    // `earliest` is assigned inside the touch() closure; widen it explicitly.
    const affected = earliest as string | null;
    if (affected) {
      const pending = sqlite.prepare(`SELECT value FROM kv WHERE key='pending_rebuild_from'`).get() as { value: string } | undefined;
      const from: string = pending && pending.value < affected ? pending.value : affected;
      setKv.run("pending_rebuild_from", from);
    }
    return summary;
  } catch (e) {
    sqlite
      .prepare(`UPDATE import_runs SET finished_at=?, status='failed', summary=? WHERE id=?`)
      .run(nowIso(), JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), runId);
    throw e;
  }
}

function removeTournament(db: DB, id: string) {
  const s = db.$client;
  s.transaction(() => {
    for (const table of ["event_results", "penalties", "entries", "tournament_events", "tracks", "observations"]) {
      s.prepare(`DELETE FROM ${table} WHERE tournament_id=?`).run(id);
    }
    s.prepare(`DELETE FROM tournaments WHERE id=?`).run(id);
  })();
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Replace one tournament's rows atomically. Stable ids (file stem, team
 * number within the tournament, event slug) make repeated imports
 * idempotent: no duplicate tournaments, entries, or results.
 */
export function writeTournament(
  db: DB,
  id: string,
  p: ParsedTournament,
  meta: { contentHash: string; resultUrl: string; importedAt: string; preliminary: boolean },
) {
  const s = db.$client;
  s.transaction(() => {
    const prev = s.prepare(`SELECT first_imported_at FROM tournaments WHERE id=?`).get(id) as { first_imported_at: string } | undefined;
    for (const table of ["event_results", "penalties", "entries", "tournament_events", "tracks"]) {
      s.prepare(`DELETE FROM ${table} WHERE tournament_id=?`).run(id);
    }
    const searchText = [p.name, p.shortName, p.location, p.state, p.level, id].filter(Boolean).join(" ").toLowerCase();
    s.prepare(
      `INSERT INTO tournaments (id, name, short_name, location, state, level, division, season, start_date, end_date, awards_date,
        format, format_basis, medals, trophies, worst_placings_dropped, n_offset, reverse_scoring, has_tracks, team_count, event_count,
        preliminary, rating_eligible, exclusion_reason, superseded_by, result_url, content_hash, imported_at, first_imported_at, search_text)
       VALUES (@id, @name, @shortName, @location, @state, @level, @division, @season, @startDate, @endDate, @awardsDate,
        'unknown', NULL, @medals, @trophies, @wpd, @nOffset, @reverse, @hasTracks, @teamCount, @eventCount,
        @preliminary, 1, NULL, NULL, @resultUrl, @contentHash, @importedAt, @firstImportedAt, @searchText)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name, location=excluded.location,
        state=excluded.state, level=excluded.level, division=excluded.division, season=excluded.season,
        start_date=excluded.start_date, end_date=excluded.end_date, awards_date=excluded.awards_date, medals=excluded.medals,
        trophies=excluded.trophies, worst_placings_dropped=excluded.worst_placings_dropped, n_offset=excluded.n_offset,
        reverse_scoring=excluded.reverse_scoring, has_tracks=excluded.has_tracks, team_count=excluded.team_count,
        event_count=excluded.event_count, preliminary=excluded.preliminary, result_url=excluded.result_url,
        content_hash=excluded.content_hash, imported_at=excluded.imported_at, search_text=excluded.search_text`,
    ).run({
      id,
      name: p.name,
      shortName: p.shortName,
      location: p.location,
      state: p.state,
      level: p.level,
      division: p.division,
      season: p.season,
      startDate: p.startDate,
      endDate: p.endDate,
      awardsDate: p.awardsDate,
      medals: p.medals,
      trophies: p.trophies,
      wpd: p.worstPlacingsDropped,
      nOffset: p.nOffset,
      reverse: p.reverseScoring ? 1 : 0,
      hasTracks: p.tracks.length > 0 ? 1 : 0,
      teamCount: p.teams.length,
      eventCount: p.events.length,
      preliminary: meta.preliminary ? 1 : 0,
      resultUrl: meta.resultUrl,
      contentHash: meta.contentHash,
      importedAt: meta.importedAt,
      firstImportedAt: prev?.first_imported_at ?? meta.importedAt,
      searchText,
    });
    const insTrack = s.prepare(`INSERT INTO tracks (tournament_id, name, medals, trophies) VALUES (?, ?, ?, ?)`);
    for (const t of p.tracks) insTrack.run(id, t.name, t.medals, t.trophies);

    const insEvent = s.prepare(
      `INSERT INTO tournament_events (id, tournament_id, event_def_id, name, ordinal, trial, trialed, medals, maximum_place, canceled, model_eligible, model_note)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 0, 0, NULL)`,
    );
    const eventId = new Map<string, string>();
    const usedSlugs = new Set<string>();
    for (const e of p.events) {
      let sl = slug(e.name) || `event-${e.ordinal}`;
      while (usedSlugs.has(sl)) sl = `${sl}-x`;
      usedSlugs.add(sl);
      const eid = `${id}:${sl}`;
      eventId.set(e.name, eid);
      insEvent.run(eid, id, e.name, e.ordinal, e.trial ? 1 : 0, e.trialed ? 1 : 0, e.medals, e.maximumPlace);
    }

    const insEntry = s.prepare(
      `INSERT INTO entries (id, tournament_id, number, school_id, team_id, resolution, resolution_reason, raw_school, raw_suffix,
        raw_city, raw_state, school_abbreviation, track, exhibition, disqualified, withdrawn, rank, points, track_rank, track_points,
        penalty_points, earned_bid, medal_counts)
       VALUES (?, ?, ?, '', NULL, 'unresolved', 'pending identity resolution', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of p.teams) {
      insEntry.run(
        `${id}#${t.number}`,
        id,
        t.number,
        t.school,
        t.suffix,
        t.city,
        t.state,
        t.schoolAbbreviation,
        t.track,
        t.exhibition ? 1 : 0,
        t.disqualified ? 1 : 0,
        t.rank,
        t.points,
        t.trackRank,
        t.trackPoints,
        t.penaltyPoints,
        t.earnedBid === null ? null : t.earnedBid ? 1 : 0,
        t.medalCounts ? JSON.stringify(t.medalCounts) : null,
      );
    }
    const insResult = s.prepare(
      `INSERT INTO event_results (entry_id, tournament_event_id, tournament_id, status, place, tie, exempt, dropped, points,
        isolated_points, track_place, medal, raw, affected_by_exhibition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of p.placings) {
      insResult.run(
        `${id}#${r.team}`,
        eventId.get(r.event),
        id,
        r.status,
        r.place,
        r.tie ? 1 : 0,
        r.exempt ? 1 : 0,
        r.dropped ? 1 : 0,
        r.points,
        r.isolatedPoints,
        r.trackPlace,
        r.medal,
        r.raw === null ? null : JSON.stringify(r.raw),
        r.affectedByExhibition ? 1 : 0,
      );
    }
    const insPen = s.prepare(`INSERT INTO penalties (entry_id, tournament_id, points) VALUES (?, ?, ?)`);
    for (const pen of p.penalties) insPen.run(`${id}#${pen.team}`, id, pen.points);
  })();
}
