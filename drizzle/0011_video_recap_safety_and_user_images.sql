ALTER TABLE `video_ai_processing_jobs` ADD COLUMN `audio_deleted_at` TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS `video_ai_processing_jobs_one_active_unique`
  ON `video_ai_processing_jobs` (`video_id`, `processing_type`)
  WHERE `status` IN ('queued', 'extracting_audio', 'transcribing', 'generating_recap');

CREATE TABLE IF NOT EXISTS `user_profile_images` (
  `id` TEXT PRIMARY KEY,
  `user_id` TEXT NOT NULL,
  `storage_path` TEXT NOT NULL UNIQUE,
  `original_file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `file_size` INTEGER NOT NULL,
  `is_current` INTEGER NOT NULL DEFAULT 1,
  `created_by` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CHECK (`is_current` IN (0, 1))
);

INSERT OR IGNORE INTO `user_profile_images` (
  `id`,
  `user_id`,
  `storage_path`,
  `original_file_name`,
  `mime_type`,
  `file_size`,
  `is_current`,
  `created_by`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `coach_user_id`,
  `storage_path`,
  `original_file_name`,
  `mime_type`,
  `file_size`,
  `is_current`,
  `created_by`,
  `created_at`,
  `updated_at`
FROM `coach_profile_images`;

CREATE INDEX IF NOT EXISTS `user_profile_images_user_idx`
  ON `user_profile_images` (`user_id`, `created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `user_profile_images_current_unique`
  ON `user_profile_images` (`user_id`)
  WHERE `is_current` = 1;

CREATE UNIQUE INDEX IF NOT EXISTS `user_profile_images_storage_unique`
  ON `user_profile_images` (`storage_path`);
