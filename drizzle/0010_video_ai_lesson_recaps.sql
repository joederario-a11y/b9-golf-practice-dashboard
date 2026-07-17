ALTER TABLE `lesson_videos` ADD COLUMN `next_session_goal` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_ai_processing_jobs` (
  `id` TEXT PRIMARY KEY,
  `video_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `coach_id` TEXT NOT NULL,
  `processing_type` TEXT NOT NULL DEFAULT 'lesson_recap_voiceover',
  `processing_version` INTEGER NOT NULL DEFAULT 1,
  `requested_language` TEXT NOT NULL DEFAULT 'en',
  `status` TEXT NOT NULL DEFAULT 'queued',
  `current_step` TEXT NOT NULL DEFAULT 'queued_for_transcription',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `workflow_instance_id` TEXT,
  `audio_storage_path` TEXT,
  `error_code` TEXT,
  `error_message` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TEXT,
  `completed_at` TEXT,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CHECK (`status` IN (
    'queued',
    'extracting_audio',
    'transcribing',
    'generating_recap',
    'ready_for_review',
    'approved',
    'published',
    'failed',
    'no_usable_audio',
    'cancelled'
  ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `video_ai_processing_jobs_version_unique`
  ON `video_ai_processing_jobs` (`video_id`, `processing_type`, `processing_version`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_ai_processing_jobs_video_idx`
  ON `video_ai_processing_jobs` (`video_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_ai_processing_jobs_member_idx`
  ON `video_ai_processing_jobs` (`member_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_ai_processing_jobs_status_idx`
  ON `video_ai_processing_jobs` (`status`, `updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_transcripts` (
  `id` TEXT PRIMARY KEY,
  `video_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `coach_id` TEXT NOT NULL,
  `transcript_text` TEXT NOT NULL DEFAULT '',
  `segments_json` TEXT NOT NULL DEFAULT '[]',
  `language` TEXT NOT NULL DEFAULT 'en',
  `model` TEXT NOT NULL,
  `duration_seconds` REAL,
  `processing_job_id` TEXT NOT NULL,
  `processing_version` INTEGER NOT NULL DEFAULT 1,
  `quality_json` TEXT NOT NULL DEFAULT '{}',
  `is_current` INTEGER NOT NULL DEFAULT 1,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`processing_job_id`) REFERENCES `video_ai_processing_jobs`(`id`) ON DELETE CASCADE,
  CHECK (`is_current` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_transcripts_video_idx`
  ON `video_transcripts` (`video_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_transcripts_job_idx`
  ON `video_transcripts` (`processing_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `video_transcripts_current_unique`
  ON `video_transcripts` (`video_id`, `processing_version`)
  WHERE `is_current` = 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_lesson_recap_drafts` (
  `id` TEXT PRIMARY KEY,
  `video_id` TEXT NOT NULL,
  `transcript_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `coach_id` TEXT NOT NULL,
  `processing_job_id` TEXT NOT NULL,
  `processing_version` INTEGER NOT NULL DEFAULT 1,
  `lesson_summary` TEXT NOT NULL DEFAULT '',
  `worked_on` TEXT NOT NULL DEFAULT '',
  `key_issue` TEXT NOT NULL DEFAULT '',
  `improvement` TEXT NOT NULL DEFAULT '',
  `practice_assignment` TEXT NOT NULL DEFAULT '',
  `recommended_drill` TEXT NOT NULL DEFAULT '',
  `member_facing_notes` TEXT NOT NULL DEFAULT '',
  `next_session_goal` TEXT NOT NULL DEFAULT '',
  `progress_observed_json` TEXT NOT NULL DEFAULT '[]',
  `metrics_mentioned_json` TEXT NOT NULL DEFAULT '[]',
  `transcript_evidence_json` TEXT NOT NULL DEFAULT '[]',
  `confidence` REAL NOT NULL DEFAULT 0,
  `model` TEXT,
  `prompt_version` TEXT NOT NULL DEFAULT 'mai-video-recap-v1',
  `status` TEXT NOT NULL DEFAULT 'generating',
  `is_current` INTEGER NOT NULL DEFAULT 1,
  `reviewed_by` TEXT,
  `reviewed_at` TEXT,
  `published_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`transcript_id`) REFERENCES `video_transcripts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`processing_job_id`) REFERENCES `video_ai_processing_jobs`(`id`) ON DELETE CASCADE,
  CHECK (`status` IN (
    'generating',
    'ready_for_review',
    'needs_coach_input',
    'approved',
    'published',
    'failed',
    'superseded'
  )),
  CHECK (`is_current` IN (0, 1)),
  CHECK (`confidence` >= 0 AND `confidence` <= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_lesson_recap_drafts_video_idx`
  ON `video_lesson_recap_drafts` (`video_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_lesson_recap_drafts_status_idx`
  ON `video_lesson_recap_drafts` (`status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_lesson_recap_drafts_job_idx`
  ON `video_lesson_recap_drafts` (`processing_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `video_lesson_recap_drafts_current_unique`
  ON `video_lesson_recap_drafts` (`video_id`, `processing_version`)
  WHERE `is_current` = 1;
