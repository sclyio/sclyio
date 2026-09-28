ALTER TABLE `entries` RENAME COLUMN `team_season_id` TO `team_id`;--> statement-breakpoint
DROP TABLE `team_seasons`;--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`division` text NOT NULL,
	`designation` text NOT NULL,
	`display_designation` text NOT NULL,
	`first_season` integer NOT NULL,
	`last_season` integer NOT NULL,
	`mapping_note` text
);
--> statement-breakpoint
CREATE INDEX `teams_school` ON `teams` (`school_id`);--> statement-breakpoint
ALTER TABLE `overall_ratings` ADD `trend_z` real;--> statement-breakpoint
ALTER TABLE `overall_ratings` ADD `trend_usr` real;
