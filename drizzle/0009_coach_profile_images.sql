CREATE TABLE IF NOT EXISTS `coach_profile_images` (
  `id` text PRIMARY KEY NOT NULL,
  `coach_user_id` text NOT NULL,
  `storage_path` text NOT NULL,
  `original_file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size` integer NOT NULL,
  `is_current` integer DEFAULT 1 NOT NULL,
  `created_by` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`coach_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`is_current` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `coach_profile_images_coach_idx`
ON `coach_profile_images` (`coach_user_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `coach_profile_images_current_unique`
ON `coach_profile_images` (`coach_user_id`)
WHERE `is_current` = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `coach_profile_images_storage_unique`
ON `coach_profile_images` (`storage_path`);
