import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Provenance and import tracking                                     */
/* ------------------------------------------------------------------ */

export const importRuns = sqliteTable("import_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  mode: text("mode").notNull(), // full | incremental
  adapter: text("adapter").notNull(), // duosmium-http | local
  sourceRevision: text("source_revision"),
  status: text("status").notNull(), // running | success | partial | failed
  filesSeen: integer("files_seen").default(0).notNull(),
  filesAdded: integer("files_added").default(0).notNull(),
  filesChanged: integer("files_changed").default(0).notNull(),
  filesUnchanged: integer("files_unchanged").default(0).notNull(),
  filesRemoved: integer("files_removed").default(0).notNull(),
  filesQuarantined: integer("files_quarantined").default(0).notNull(),
  filesSkipped: integer("files_skipped").default(0).notNull(),
  earliestAffectedDate: text("earliest_affected_date"),
  summary: text("summary"), // JSON
});

export const importChanges = sqliteTable(
  "import_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull(),
    fileId: text("file_id").notNull(),
    change: text("change").notNull(), // added | changed | removed | quarantined | skipped | superseded
    oldHash: text("old_hash"),
    newHash: text("new_hash"),
    detail: text("detail"),
  },
  (t) => [index("import_changes_run").on(t.runId), index("import_changes_file").on(t.fileId)],
);

export const sourceFiles = sqliteTable("source_files", {
  id: text("id").primaryKey(), // file stem, e.g. 2026-01-10_hudson_invitational_c
  path: text("path").notNull(), // repository path
  blobSha: text("blob_sha"),
  contentHash: text("content_hash").notNull(), // sha256 of bytes
  sourceRevision: text("source_revision"),
  fetchedAt: text("fetched_at").notNull(),
  parserVersion: text("parser_version").notNull(),
  status: text("status").notNull(), // imported | quarantined | skipped | superseded | excluded
  reason: text("reason"),
  warnings: integer("warnings").default(0).notNull(),
  resultUrl: text("result_url").notNull(),
  lastRunId: integer("last_run_id"),
});

export const eventMetadata = sqliteTable(
  "event_metadata",
  {
    division: text("division").notNull(),
    season: integer("season").notNull(),
    events: text("events").notNull(), // JSON array of official event names
    sourcePath: text("source_path").notNull(),
    sourceRevision: text("source_revision"),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.division, t.season] })],
);

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ------------------------------------------------------------------ */
/* Identity                                                           */
/* ------------------------------------------------------------------ */

export const schools = sqliteTable(
  "schools",
  {
    id: text("id").primaryKey(), // slug of name+city+state
    name: text("name").notNull(),
    city: text("city"),
    state: text("state").notNull(),
    matchKey: text("match_key").notNull(),
    searchText: text("search_text").notNull(),
  },
  (t) => [uniqueIndex("schools_match").on(t.matchKey), index("schools_state").on(t.state)],
);

/** A school's N-th team in one division, across all seasons (Team 1 = best finisher at each tournament). */
export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id").notNull(),
    division: text("division").notNull(),
    designation: text("designation").notNull(), // normalized, e.g. "team 1"
    displayDesignation: text("display_designation").notNull(),
    firstSeason: integer("first_season").notNull(),
    lastSeason: integer("last_season").notNull(),
    mappingNote: text("mapping_note"),
  },
  (t) => [index("teams_school").on(t.schoolId)],
);

/* ------------------------------------------------------------------ */
/* Tournaments and results                                            */
/* ------------------------------------------------------------------ */

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(), // = source file id
    name: text("name").notNull(),
    shortName: text("short_name"),
    location: text("location"),
    state: text("state"),
    level: text("level").notNull(),
    division: text("division").notNull(),
    season: integer("season").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    awardsDate: text("awards_date"),
    format: text("format").notNull(), // in-person | online | unknown
    formatBasis: text("format_basis"),
    medals: integer("medals"),
    trophies: integer("trophies"),
    worstPlacingsDropped: integer("worst_placings_dropped").default(0).notNull(),
    nOffset: integer("n_offset").default(0).notNull(),
    reverseScoring: integer("reverse_scoring", { mode: "boolean" }).default(false).notNull(),
    hasTracks: integer("has_tracks", { mode: "boolean" }).default(false).notNull(),
    teamCount: integer("team_count").notNull(),
    eventCount: integer("event_count").notNull(),
    preliminary: integer("preliminary", { mode: "boolean" }).default(false).notNull(),
    ratingEligible: integer("rating_eligible", { mode: "boolean" }).default(true).notNull(),
    exclusionReason: text("exclusion_reason"),
    supersededBy: text("superseded_by"),
    resultUrl: text("result_url").notNull(),
    contentHash: text("content_hash").notNull(),
    importedAt: text("imported_at").notNull(),
    firstImportedAt: text("first_imported_at").notNull(),
    /** Hash of derived model observations; a change marks ratings stale. */
    obsHash: text("obs_hash"),
    searchText: text("search_text").notNull(),
  },
  (t) => [
    index("tournaments_div_season").on(t.division, t.season),
    index("tournaments_end").on(t.endDate),
  ],
);

export const tracks = sqliteTable(
  "tracks",
  {
    tournamentId: text("tournament_id").notNull(),
    name: text("name").notNull(),
    medals: integer("medals"),
    trophies: integer("trophies"),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.name] })],
);

export const eventDefinitions = sqliteTable(
  "event_definitions",
  {
    id: text("id").primaryKey(), // C-2026-anatomy-and-physiology
    division: text("division").notNull(),
    season: integer("season").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    official: integer("official", { mode: "boolean" }).notNull(),
    /** Cross-season equivalence group id; null unless explicitly mapped. */
    equivalenceGroup: text("equivalence_group"),
    equivalenceBasis: text("equivalence_basis"),
  },
  (t) => [index("event_defs_div_season").on(t.division, t.season)],
);

export const tournamentEvents = sqliteTable(
  "tournament_events",
  {
    id: text("id").primaryKey(), // tournamentId:slug
    tournamentId: text("tournament_id").notNull(),
    eventDefId: text("event_def_id").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    trial: integer("trial", { mode: "boolean" }).notNull(),
    trialed: integer("trialed", { mode: "boolean" }).notNull(),
    medals: integer("medals"),
    maximumPlace: integer("maximum_place"),
    /** Whether any model observation can come from this event. */
    canceled: integer("canceled", { mode: "boolean" }).default(false).notNull(),
    modelEligible: integer("model_eligible", { mode: "boolean" }).notNull(),
    modelNote: text("model_note"),
  },
  (t) => [index("tevents_tournament").on(t.tournamentId), index("tevents_def").on(t.eventDefId)],
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(), // tournamentId#number
    tournamentId: text("tournament_id").notNull(),
    number: integer("number").notNull(),
    schoolId: text("school_id").notNull(),
    teamId: text("team_id"),
    resolution: text("resolution").notNull(), // resolved | unresolved
    resolutionReason: text("resolution_reason"),
    rawSchool: text("raw_school").notNull(),
    rawSuffix: text("raw_suffix"),
    rawCity: text("raw_city"),
    rawState: text("raw_state"),
    schoolAbbreviation: text("school_abbreviation"),
    track: text("track"),
    exhibition: integer("exhibition", { mode: "boolean" }).notNull(),
    disqualified: integer("disqualified", { mode: "boolean" }).notNull(),
    withdrawn: integer("withdrawn", { mode: "boolean" }).default(false).notNull(),
    rank: integer("rank"),
    points: real("points"),
    trackRank: integer("track_rank"),
    trackPoints: real("track_points"),
    penaltyPoints: real("penalty_points").default(0).notNull(),
    earnedBid: integer("earned_bid", { mode: "boolean" }),
    medalCounts: text("medal_counts"), // JSON
  },
  (t) => [
    index("entries_tournament").on(t.tournamentId),
    index("entries_team").on(t.teamId),
    index("entries_school").on(t.schoolId),
  ],
);

export const eventResults = sqliteTable(
  "event_results",
  {
    entryId: text("entry_id").notNull(),
    tournamentEventId: text("tournament_event_id").notNull(),
    tournamentId: text("tournament_id").notNull(),
    /** placed | participation_only | no_show | disqualified | unknown */
    status: text("status").notNull(),
    place: integer("place"),
    tie: integer("tie", { mode: "boolean" }).notNull(),
    exempt: integer("exempt", { mode: "boolean" }).notNull(),
    dropped: integer("dropped", { mode: "boolean" }).notNull(),
    points: real("points"), // official points counted toward the team total
    isolatedPoints: real("isolated_points"), // official placement points before drops
    trackPlace: integer("track_place"),
    medal: integer("medal"),
    raw: text("raw"), // JSON raw score, never compared across tournaments
    affectedByExhibition: integer("affected_by_exhibition", { mode: "boolean" }).notNull(),
  },
  (t) => [
    // Every lookup knows the tournament: prefix scans cover tournament,
    // entry, and tournament-event queries without secondary indexes.
    primaryKey({ columns: [t.tournamentId, t.entryId, t.tournamentEventId] }),
  ],
);

export const penalties = sqliteTable("penalties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: text("entry_id").notNull(),
  tournamentId: text("tournament_id").notNull(),
  points: real("points").notNull(),
});

/**
 * Model observations derived from official results. Independent of the
 * as-of date: ranks are computed within one tournament event. Rebuilt for
 * a tournament whenever its source or identity mappings change.
 */
export const observations = sqliteTable(
  "observations",
  {
    view: text("view").notNull(), // team | school
    tournamentEventId: text("tournament_event_id").notNull(),
    entityId: text("entity_id").notNull(), // team id or school id
    tournamentId: text("tournament_id").notNull(),
    eventDefId: text("event_def_id").notNull(),
    division: text("division").notNull(),
    season: integer("season").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    sourceEntryId: text("source_entry_id").notNull(), // superscore provenance
    sourcePlace: integer("source_place").notNull(),
    modelRank: real("model_rank").notNull(),
    n: integer("n").notNull(), // eligible participants (entries or unique schools)
    nSchools: integer("n_schools").notNull(), // unique eligible schools
    x: real("x").notNull(),
    format: text("format").notNull(), // in-person | online | unknown
  },
  (t) => [
    // Profiles look up by (view, entity); the rebuild scans by view.
    primaryKey({ columns: [t.view, t.entityId, t.tournamentEventId] }),
  ],
);

/* ------------------------------------------------------------------ */
/* Ratings (materialized, versioned by build)                         */
/* ------------------------------------------------------------------ */

export const ratingBuilds = sqliteTable("rating_builds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(), // running | complete | failed | published | retired
  modelVersion: text("model_version").notNull(),
  params: text("params").notNull(),
  sourceRevision: text("source_revision"),
  recomputedFrom: text("recomputed_from"),
  summary: text("summary"),
});

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    buildId: integer("build_id").notNull(),
    division: text("division").notNull(),
    view: text("view").notNull(),
    season: integer("season").notNull(),
    asOf: text("as_of").notNull(),
    officialEvents: integer("official_events").notNull(), // M
    entityCount: integer("entity_count").notNull(),
    establishedCount: integer("established_count").notNull(),
    excludedCounts: text("excluded_counts").notNull(), // JSON
    hasEventDetail: integer("has_event_detail", { mode: "boolean" }).notNull(),
    diagnostics: text("diagnostics").notNull(), // JSON per event
    computedAt: text("computed_at").notNull(),
  },
  (t) => [
    uniqueIndex("snapshots_key").on(t.buildId, t.division, t.view, t.season, t.asOf),
  ],
);

export const overallRatings = sqliteTable(
  "overall_ratings",
  {
    snapshotId: integer("snapshot_id").notNull(),
    entityId: text("entity_id").notNull(),
    z: real("z").notNull(),
    usr: real("usr").notNull(),
    status: text("status").notNull(), // established | provisional | inactive
    nationalRank: integer("national_rank"),
    stateRank: integer("state_rank"),
    state: text("state"),
    comparableEvents: integer("comparable_events").notNull(),
    observedEvents: integer("observed_events").notNull(),
    tournaments: integer("tournaments").notNull(),
    observations: integer("observations").notNull(),
    lastCompetition: text("last_competition"),
    /** Change attribution relative to the previous snapshot (latent z units). */
    prevZ: real("prev_z"),
    dAdded: real("d_added"),
    dRecency: real("d_recency"),
    dField: real("d_field"),
    dOther: real("d_other"),
    explain: text("explain"), // JSON: top events changed, new tournaments
    eventVector: text("event_vector"), // JSON compact [eventDefId, value][] for history
    /** Season Trend: the same model fit to the current season's results only. */
    trendZ: real("trend_z"),
    trendUsr: real("trend_usr"),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.entityId] }),
    index("overall_rank").on(t.snapshotId, t.nationalRank),
  ],
);

export const eventRatings = sqliteTable(
  "event_ratings",
  {
    snapshotId: integer("snapshot_id").notNull(),
    entityId: text("entity_id").notNull(),
    eventDefId: text("event_def_id").notNull(),
    value: real("value").notNull(), // s (team) or q (school)
    skill: real("skill").notNull(), // fitted s (both views)
    usr: real("usr").notNull(),
    appearances: integer("appearances").notNull(),
    uniqueOpponents: integer("unique_opponents").notNull(),
    nEff: real("n_eff").notNull(),
    lastDate: text("last_date").notNull(),
    shrinkage: real("shrinkage").notNull(),
    component: integer("component").notNull(), // 0 = reference component
    weak: integer("weak", { mode: "boolean" }).notNull(),
    eventRank: integer("event_rank"),
    evidence: text("evidence").notNull(), // strong | moderate | limited | local-only
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.entityId, t.eventDefId] }),
  ],
);

/** Retrospective field offsets k per tournament event (from a given snapshot fit). */
export const fieldFits = sqliteTable(
  "field_fits",
  {
    snapshotId: integer("snapshot_id").notNull(),
    tournamentEventId: text("tournament_event_id").notNull(),
    k: real("k").notNull(),
    weight: real("weight").notNull(),
    n: integer("n").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.tournamentEventId] })],
);

/** Pre-tournament field strength, from ratings frozen before the start date. */
export const fieldStrength = sqliteTable(
  "field_strength",
  {
    buildId: integer("build_id").notNull(),
    tournamentId: text("tournament_id").notNull(),
    view: text("view").notNull(),
    preSnapshotAsOf: text("pre_snapshot_as_of"),
    entries: integer("entries").notNull(),
    rated: integer("rated").notNull(),
    established: integer("established").notNull(),
    meanUsr: real("mean_usr"),
    top5MeanUsr: real("top5_mean_usr"),
  },
  (t) => [primaryKey({ columns: [t.buildId, t.tournamentId, t.view] })],
);

export const backtestResults = sqliteTable("backtest_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runAt: text("run_at").notNull(),
  division: text("division").notNull(),
  view: text("view").notNull(),
  split: text("split").notNull(), // validation | test
  model: text("model").notNull(),
  metric: text("metric").notNull(),
  value: real("value"),
  n: integer("n").notNull(),
  notes: text("notes"),
});

export const publishLog = sqliteTable("publish_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildId: integer("build_id").notNull(),
  publishedAt: text("published_at").notNull(),
  sourceRevision: text("source_revision"),
  note: text("note"),
});

export const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
