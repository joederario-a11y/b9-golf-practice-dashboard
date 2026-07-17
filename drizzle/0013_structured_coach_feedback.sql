CREATE TABLE IF NOT EXISTS `coach_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `golfer_id` text NOT NULL,
  `coach_id` text NOT NULL,
  `lesson_id` text,
  `session_id` text,
  `status` text NOT NULL DEFAULT 'active'
    CHECK (`status` IN ('active', 'resolved', 'archived')),
  `priority` text NOT NULL DEFAULT '',
  `observations_json` text NOT NULL DEFAULT '[]',
  `prescribed_drills_json` text NOT NULL DEFAULT '[]',
  `swing_feels_json` text NOT NULL DEFAULT '[]',
  `success_targets_json` text NOT NULL DEFAULT '[]',
  `raw_notes` text,
  `source_type` text NOT NULL DEFAULT 'lesson_video',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` text,
  `archived_at` text,
  FOREIGN KEY (`golfer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lesson_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `coach_feedback_golfer_status_idx`
  ON `coach_feedback` (`golfer_id`, `status`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `coach_feedback_coach_idx`
  ON `coach_feedback` (`coach_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `coach_feedback_lesson_unique`
  ON `coach_feedback` (`lesson_id`)
  WHERE `lesson_id` IS NOT NULL;
