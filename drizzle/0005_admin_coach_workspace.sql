ALTER TABLE `users` ADD COLUMN `account_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `member_content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_by` text NOT NULL,
	`content_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`session_data_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_content_member_idx` ON `member_content_items` (`member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_content_created_by_idx` ON `member_content_items` (`created_by`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `member_activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_role` text NOT NULL,
	`member_id` text,
	`target_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_activity_member_idx` ON `member_activity_log` (`member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_activity_actor_idx` ON `member_activity_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_activity_target_idx` ON `member_activity_log` (`target_user_id`,`created_at`);
