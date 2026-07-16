CREATE TABLE IF NOT EXISTS `coach_members` (
	`id` text PRIMARY KEY NOT NULL,
	`coach_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `coach_members_assignment_unique` ON `coach_members` (`coach_id`,`member_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `coach_members_member_idx` ON `coach_members` (`member_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `member_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`coach_id` text,
	`email_to` text NOT NULL,
	`invite_token` text NOT NULL,
	`invite_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`failure_reason` text,
	`expires_at` text,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `member_invitations_token_unique` ON `member_invitations` (`invite_token`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_invitations_member_idx` ON `member_invitations` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lesson_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`coach_id` text,
	`uploaded_by_role` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`coach_notes` text DEFAULT '' NOT NULL,
	`coach_private_notes` text DEFAULT '' NOT NULL,
	`user_notes` text DEFAULT '' NOT NULL,
	`video_type` text DEFAULT 'Lesson Recap' NOT NULL,
	`focus_area` text,
	`swing_type` text,
	`club` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`session_data_id` text,
	`storage_path` text NOT NULL,
	`thumbnail_storage_path` text,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`lesson_date` text,
	`publication_status` text DEFAULT 'Draft' NOT NULL,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`review_status` text DEFAULT 'New' NOT NULL,
	`email_status` text DEFAULT 'Not sent' NOT NULL,
	`email_sent_at` text,
	`email_failure_reason` text,
	`is_viewed_by_member` integer DEFAULT false NOT NULL,
	`viewed_at` text,
	`lesson_summary` text DEFAULT '' NOT NULL,
	`worked_on` text DEFAULT '' NOT NULL,
	`key_issue` text DEFAULT '' NOT NULL,
	`improvement` text DEFAULT '' NOT NULL,
	`practice_assignment` text DEFAULT '' NOT NULL,
	`recommended_drill` text DEFAULT '' NOT NULL,
	`member_facing_notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_videos_member_idx` ON `lesson_videos` (`member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_videos_coach_idx` ON `lesson_videos` (`coach_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_videos_status_idx` ON `lesson_videos` (`publication_status`,`upload_status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`skill_level` text,
	`notes` text,
	`invite_status` text DEFAULT 'pending' NOT NULL,
	`invited_at` text,
	`last_login_at` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_email_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`member_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`email_to` text NOT NULL,
	`email_subject` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`failure_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_email_notifications_video_idx` ON `video_email_notifications` (`video_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_email_notifications_member_idx` ON `video_email_notifications` (`member_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_views` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`member_id` text NOT NULL,
	`viewed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_views_video_idx` ON `video_views` (`video_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_views_member_idx` ON `video_views` (`member_id`);
