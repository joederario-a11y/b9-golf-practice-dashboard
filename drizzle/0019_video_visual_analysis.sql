CREATE TABLE IF NOT EXISTS `video_visual_analyses` (
  `id` TEXT PRIMARY KEY,
  `video_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `coach_id` TEXT,
  `requested_by_user_id` TEXT NOT NULL,
  `requested_by_role` TEXT NOT NULL CHECK (`requested_by_role` IN ('coach', 'member', 'admin')),
  `analysis_version` TEXT NOT NULL,
  `media_hash` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'queued'
    CHECK (`status` IN (
      'not_requested',
      'queued',
      'detecting_swings',
      'extracting_frames',
      'analyzing_frames',
      'ready_for_coach_review',
      'ready_for_member',
      'needs_attention',
      'cancelled'
    )),
  `selected_swing_id` TEXT,
  `camera_view` TEXT CHECK (`camera_view` IS NULL OR `camera_view` IN ('face_on', 'down_the_line', 'front_three_quarter', 'rear_three_quarter', 'unknown')),
  `handedness` TEXT CHECK (`handedness` IS NULL OR `handedness` IN ('right', 'left', 'unknown')),
  `club` TEXT,
  `overall_confidence` REAL CHECK (`overall_confidence` IS NULL OR (`overall_confidence` >= 0 AND `overall_confidence` <= 1)),
  `structured_result_json` TEXT NOT NULL DEFAULT '{}',
  `swing_count_detected` INTEGER NOT NULL DEFAULT 0,
  `frames_analyzed` INTEGER NOT NULL DEFAULT 0,
  `model` TEXT,
  `prompt_version` TEXT NOT NULL DEFAULT 'mai-visual-swing-v1',
  `published_to_member_at` TEXT,
  `safe_error_code` TEXT,
  `safe_error_message` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TEXT,
  `completed_at` TEXT,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `video_visual_analyses_media_unique`
  ON `video_visual_analyses` (`video_id`, `media_hash`, `analysis_version`);

CREATE INDEX IF NOT EXISTS `video_visual_analyses_video_idx`
  ON `video_visual_analyses` (`video_id`, `created_at`);

CREATE INDEX IF NOT EXISTS `video_visual_analyses_member_idx`
  ON `video_visual_analyses` (`member_id`, `created_at`);

CREATE INDEX IF NOT EXISTS `video_visual_analyses_status_idx`
  ON `video_visual_analyses` (`status`, `updated_at`);

CREATE TABLE IF NOT EXISTS `video_visual_analysis_frames` (
  `id` TEXT PRIMARY KEY,
  `analysis_id` TEXT NOT NULL,
  `video_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `swing_id` TEXT NOT NULL DEFAULT 'swing-1',
  `phase` TEXT NOT NULL DEFAULT 'representative',
  `timestamp_seconds` REAL,
  `storage_path` TEXT,
  `thumbnail_storage_path` TEXT,
  `source` TEXT NOT NULL DEFAULT 'extracted_frame',
  `width` INTEGER,
  `height` INTEGER,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`analysis_id`) REFERENCES `video_visual_analyses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `video_visual_analysis_frames_analysis_idx`
  ON `video_visual_analysis_frames` (`analysis_id`, `swing_id`);

CREATE TABLE IF NOT EXISTS `video_visual_observation_reviews` (
  `id` TEXT PRIMARY KEY,
  `analysis_id` TEXT NOT NULL,
  `observation_id` TEXT NOT NULL,
  `video_id` TEXT NOT NULL,
  `member_id` TEXT NOT NULL,
  `coach_id` TEXT,
  `review_status` TEXT NOT NULL DEFAULT 'coach_only'
    CHECK (`review_status` IN ('include_in_recap', 'coach_only', 'dismissed')),
  `reviewed_by` TEXT,
  `reviewed_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`analysis_id`) REFERENCES `video_visual_analyses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`video_id`) REFERENCES `lesson_videos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `video_visual_observation_reviews_unique`
  ON `video_visual_observation_reviews` (`analysis_id`, `observation_id`);

CREATE INDEX IF NOT EXISTS `video_visual_observation_reviews_video_idx`
  ON `video_visual_observation_reviews` (`video_id`, `review_status`);
