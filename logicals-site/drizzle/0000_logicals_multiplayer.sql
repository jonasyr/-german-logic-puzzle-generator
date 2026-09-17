CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_normalized_name_unique` ON `players` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`room_id` integer,
	`attempt_key` text NOT NULL,
	`puzzle_fingerprint` text NOT NULL,
	`puzzle_title` text NOT NULL,
	`theme_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`seed` integer NOT NULL,
	`configuration_json` text NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `results_attempt_key_unique` ON `results` (`attempt_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_results_room_player` ON `results` (`room_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_results_player_completed` ON `results` (`player_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `room_members` (
	`room_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`role` text NOT NULL,
	`member_token_hash` text NOT NULL,
	`loaded_at` text,
	`ready_at` text,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `player_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_members_role_check" CHECK("room_members"."role" in ('host', 'guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_member_role` ON `room_members` (`room_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_member_token_hash` ON `room_members` (`member_token_hash`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`host_player_id` integer NOT NULL,
	`configuration_json` text NOT NULL,
	`booklet_seed` integer NOT NULL,
	`puzzle_index` integer NOT NULL,
	`puzzle_fingerprint` text NOT NULL,
	`puzzle_title` text NOT NULL,
	`puzzle_theme_id` text NOT NULL,
	`effective_puzzle_seed` integer NOT NULL,
	`state` text NOT NULL,
	`starts_at` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`host_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rooms_state_check" CHECK("rooms"."state" in ('waiting', 'countdown', 'active', 'complete', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE INDEX `idx_rooms_expires_at` ON `rooms` (`expires_at`);