-- Hand-edited after generation: large composite-key tables use WITHOUT ROWID.
CREATE TABLE `backtest_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_at` text NOT NULL,
	`division` text NOT NULL,
	`view` text NOT NULL,
	`split` text NOT NULL,
	`model` text NOT NULL,
	`metric` text NOT NULL,
	`value` real,
	`n` integer NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`number` integer NOT NULL,
	`school_id` text NOT NULL,
	`team_season_id` text,
	`resolution` text NOT NULL,
	`resolution_reason` text,
	`raw_school` text NOT NULL,
	`raw_suffix` text,
	`raw_city` text,
	`raw_state` text,
	`school_abbreviation` text,
	`track` text,
	`exhibition` integer NOT NULL,
	`disqualified` integer NOT NULL,
	`withdrawn` integer DEFAULT false NOT NULL,
	`rank` integer,
	`points` real,
	`track_rank` integer,
	`track_points` real,
	`penalty_points` real DEFAULT 0 NOT NULL,
	`earned_bid` integer,
	`medal_counts` text
);
--> statement-breakpoint
CREATE INDEX `entries_tournament` ON `entries` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `entries_team` ON `entries` (`team_season_id`);--> statement-breakpoint
CREATE INDEX `entries_school` ON `entries` (`school_id`);--> statement-breakpoint
CREATE TABLE `event_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`division` text NOT NULL,
	`season` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`official` integer NOT NULL,
	`equivalence_group` text,
	`equivalence_basis` text
);
--> statement-breakpoint
CREATE INDEX `event_defs_div_season` ON `event_definitions` (`division`,`season`);--> statement-breakpoint
CREATE TABLE `event_metadata` (
	`division` text NOT NULL,
	`season` integer NOT NULL,
	`events` text NOT NULL,
	`source_path` text NOT NULL,
	`source_revision` text,
	`content_hash` text NOT NULL,
	PRIMARY KEY(`division`, `season`)
);
--> statement-breakpoint
CREATE TABLE `event_ratings` (
	`snapshot_id` integer NOT NULL,
	`entity_id` text NOT NULL,
	`event_def_id` text NOT NULL,
	`value` real NOT NULL,
	`skill` real NOT NULL,
	`usr` real NOT NULL,
	`appearances` integer NOT NULL,
	`unique_opponents` integer NOT NULL,
	`n_eff` real NOT NULL,
	`last_date` text NOT NULL,
	`shrinkage` real NOT NULL,
	`component` integer NOT NULL,
	`weak` integer NOT NULL,
	`event_rank` integer,
	`evidence` text NOT NULL,
	PRIMARY KEY(`snapshot_id`, `entity_id`, `event_def_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `event_results` (
	`entry_id` text NOT NULL,
	`tournament_event_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`status` text NOT NULL,
	`place` integer,
	`tie` integer NOT NULL,
	`exempt` integer NOT NULL,
	`dropped` integer NOT NULL,
	`points` real,
	`isolated_points` real,
	`track_place` integer,
	`medal` integer,
	`raw` text,
	`affected_by_exhibition` integer NOT NULL,
	PRIMARY KEY(`tournament_id`, `entry_id`, `tournament_event_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `field_fits` (
	`snapshot_id` integer NOT NULL,
	`tournament_event_id` text NOT NULL,
	`k` real NOT NULL,
	`weight` real NOT NULL,
	`n` integer NOT NULL,
	PRIMARY KEY(`snapshot_id`, `tournament_event_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `field_strength` (
	`build_id` integer NOT NULL,
	`tournament_id` text NOT NULL,
	`view` text NOT NULL,
	`pre_snapshot_as_of` text,
	`entries` integer NOT NULL,
	`rated` integer NOT NULL,
	`established` integer NOT NULL,
	`mean_usr` real,
	`top5_mean_usr` real,
	PRIMARY KEY(`build_id`, `tournament_id`, `view`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `import_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`file_id` text NOT NULL,
	`change` text NOT NULL,
	`old_hash` text,
	`new_hash` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `import_changes_run` ON `import_changes` (`run_id`);--> statement-breakpoint
CREATE INDEX `import_changes_file` ON `import_changes` (`file_id`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`mode` text NOT NULL,
	`adapter` text NOT NULL,
	`source_revision` text,
	`status` text NOT NULL,
	`files_seen` integer DEFAULT 0 NOT NULL,
	`files_added` integer DEFAULT 0 NOT NULL,
	`files_changed` integer DEFAULT 0 NOT NULL,
	`files_unchanged` integer DEFAULT 0 NOT NULL,
	`files_removed` integer DEFAULT 0 NOT NULL,
	`files_quarantined` integer DEFAULT 0 NOT NULL,
	`files_skipped` integer DEFAULT 0 NOT NULL,
	`earliest_affected_date` text,
	`summary` text
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`view` text NOT NULL,
	`tournament_event_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`event_def_id` text NOT NULL,
	`division` text NOT NULL,
	`season` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`source_entry_id` text NOT NULL,
	`source_place` integer NOT NULL,
	`model_rank` real NOT NULL,
	`n` integer NOT NULL,
	`n_schools` integer NOT NULL,
	`x` real NOT NULL,
	`format` text NOT NULL,
	PRIMARY KEY(`view`, `entity_id`, `tournament_event_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `overall_ratings` (
	`snapshot_id` integer NOT NULL,
	`entity_id` text NOT NULL,
	`z` real NOT NULL,
	`usr` real NOT NULL,
	`status` text NOT NULL,
	`national_rank` integer,
	`state_rank` integer,
	`state` text,
	`comparable_events` integer NOT NULL,
	`observed_events` integer NOT NULL,
	`tournaments` integer NOT NULL,
	`observations` integer NOT NULL,
	`last_competition` text,
	`prev_z` real,
	`d_added` real,
	`d_recency` real,
	`d_field` real,
	`d_other` real,
	`explain` text,
	`event_vector` text,
	PRIMARY KEY(`snapshot_id`, `entity_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `overall_rank` ON `overall_ratings` (`snapshot_id`,`national_rank`);--> statement-breakpoint
CREATE TABLE `penalties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`points` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`build_id` integer NOT NULL,
	`published_at` text NOT NULL,
	`source_revision` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `rating_builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`model_version` text NOT NULL,
	`params` text NOT NULL,
	`source_revision` text,
	`recomputed_from` text,
	`summary` text
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`state` text NOT NULL,
	`match_key` text NOT NULL,
	`search_text` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_match` ON `schools` (`match_key`);--> statement-breakpoint
CREATE INDEX `schools_state` ON `schools` (`state`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`build_id` integer NOT NULL,
	`division` text NOT NULL,
	`view` text NOT NULL,
	`season` integer NOT NULL,
	`as_of` text NOT NULL,
	`official_events` integer NOT NULL,
	`entity_count` integer NOT NULL,
	`established_count` integer NOT NULL,
	`excluded_counts` text NOT NULL,
	`has_event_detail` integer NOT NULL,
	`diagnostics` text NOT NULL,
	`computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_key` ON `snapshots` (`build_id`,`division`,`view`,`season`,`as_of`);--> statement-breakpoint
CREATE TABLE `source_files` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`blob_sha` text,
	`content_hash` text NOT NULL,
	`source_revision` text,
	`fetched_at` text NOT NULL,
	`parser_version` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`warnings` integer DEFAULT 0 NOT NULL,
	`result_url` text NOT NULL,
	`last_run_id` integer
);
--> statement-breakpoint
CREATE TABLE `team_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`division` text NOT NULL,
	`season` integer NOT NULL,
	`designation` text NOT NULL,
	`display_designation` text NOT NULL,
	`mapping_note` text
);
--> statement-breakpoint
CREATE INDEX `team_seasons_school` ON `team_seasons` (`school_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_seasons_key` ON `team_seasons` (`school_id`,`division`,`season`,`designation`);--> statement-breakpoint
CREATE TABLE `tournament_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`event_def_id` text NOT NULL,
	`name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`trial` integer NOT NULL,
	`trialed` integer NOT NULL,
	`medals` integer,
	`maximum_place` integer,
	`canceled` integer DEFAULT false NOT NULL,
	`model_eligible` integer NOT NULL,
	`model_note` text
);
--> statement-breakpoint
CREATE INDEX `tevents_tournament` ON `tournament_events` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tevents_def` ON `tournament_events` (`event_def_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`location` text,
	`state` text,
	`level` text NOT NULL,
	`division` text NOT NULL,
	`season` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`awards_date` text,
	`format` text NOT NULL,
	`format_basis` text,
	`medals` integer,
	`trophies` integer,
	`worst_placings_dropped` integer DEFAULT 0 NOT NULL,
	`n_offset` integer DEFAULT 0 NOT NULL,
	`reverse_scoring` integer DEFAULT false NOT NULL,
	`has_tracks` integer DEFAULT false NOT NULL,
	`team_count` integer NOT NULL,
	`event_count` integer NOT NULL,
	`preliminary` integer DEFAULT false NOT NULL,
	`rating_eligible` integer DEFAULT true NOT NULL,
	`exclusion_reason` text,
	`superseded_by` text,
	`result_url` text NOT NULL,
	`content_hash` text NOT NULL,
	`imported_at` text NOT NULL,
	`first_imported_at` text NOT NULL,
	`obs_hash` text,
	`search_text` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_div_season` ON `tournaments` (`division`,`season`);--> statement-breakpoint
CREATE INDEX `tournaments_end` ON `tournaments` (`end_date`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`medals` integer,
	`trophies` integer,
	PRIMARY KEY(`tournament_id`, `name`)
);
