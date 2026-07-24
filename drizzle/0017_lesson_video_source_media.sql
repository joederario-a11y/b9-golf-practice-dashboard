ALTER TABLE `lesson_videos` ADD COLUMN `source_storage_path` TEXT;
--> statement-breakpoint
ALTER TABLE `lesson_videos` ADD COLUMN `source_file_name` TEXT;
--> statement-breakpoint
ALTER TABLE `lesson_videos` ADD COLUMN `source_file_size` INTEGER;
--> statement-breakpoint
ALTER TABLE `lesson_videos` ADD COLUMN `source_mime_type` TEXT;
--> statement-breakpoint
ALTER TABLE `lesson_videos` ADD COLUMN `source_media_probe_json` TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `lesson_videos` ADD COLUMN `playback_media_probe_json` TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `lesson_videos`
SET
  `source_storage_path` = COALESCE(`source_storage_path`, `storage_path`),
  `source_file_name` = COALESCE(`source_file_name`, `file_name`),
  `source_file_size` = COALESCE(`source_file_size`, `file_size`),
  `source_mime_type` = COALESCE(`source_mime_type`, `mime_type`)
WHERE `source_storage_path` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lesson_videos_source_storage_idx`
  ON `lesson_videos` (`source_storage_path`);
