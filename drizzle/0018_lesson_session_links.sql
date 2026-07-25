CREATE TABLE IF NOT EXISTS `lesson_session_links` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`session_id` text NOT NULL,
	`member_id` text NOT NULL,
	`coach_id` text,
	`attached_by_user_id` text NOT NULL,
	`attached_by_role` text DEFAULT 'member' NOT NULL,
	`source_type` text DEFAULT 'existing_session' NOT NULL,
	`review_status` text DEFAULT 'Ready' NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`recap_update_status` text DEFAULT 'not_needed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`attached_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`attached_by_role` IN ('admin', 'coach', 'member')),
	CHECK (`is_primary` IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lesson_session_links_video_session_unique` ON `lesson_session_links` (`video_id`,`session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_session_links_video_idx` ON `lesson_session_links` (`video_id`,`is_primary`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_session_links_member_idx` ON `lesson_session_links` (`member_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_session_links_session_idx` ON `lesson_session_links` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lesson_session_links_one_primary_unique` ON `lesson_session_links` (`video_id`) WHERE `is_primary` = 1;
--> statement-breakpoint
INSERT OR IGNORE INTO `lesson_session_links` (
  `id`, `video_id`, `session_id`, `member_id`, `coach_id`, `attached_by_user_id`,
  `attached_by_role`, `source_type`, `review_status`, `is_primary`, `recap_update_status`,
  `created_at`, `updated_at`
)
SELECT
  'legacy-' || `id` || '-' || `session_data_id`,
  `id`,
  `session_data_id`,
  `member_id`,
  `coach_id`,
  COALESCE(`coach_id`, `member_id`),
  CASE
    WHEN `coach_id` IS NOT NULL THEN 'coach'
    WHEN `uploaded_by_role` IN ('admin', 'coach', 'member') THEN `uploaded_by_role`
    ELSE 'member'
  END,
  'legacy_session_link',
  'Ready',
  1,
  'not_needed',
  `created_at`,
  `updated_at`
FROM `lesson_videos`
WHERE `session_data_id` IS NOT NULL AND TRIM(`session_data_id`) <> '';
