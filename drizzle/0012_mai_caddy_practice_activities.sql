CREATE TABLE IF NOT EXISTS `practice_activities` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `generated_by` text NOT NULL,
  `activity_type` text NOT NULL,
  `focus_area` text NOT NULL,
  `title` text NOT NULL,
  `reason_selected` text DEFAULT '' NOT NULL,
  `instructions_json` text DEFAULT '{}' NOT NULL,
  `club` text,
  `duration_minutes` integer,
  `attempt_count` integer,
  `target_json` text DEFAULT '{}' NOT NULL,
  `scoring_json` text DEFAULT '{}' NOT NULL,
  `source_context_json` text DEFAULT '{}' NOT NULL,
  `coach_id` text,
  `coach_assignment_id` text,
  `coach_feedback_source_id` text,
  `related_session_id` text,
  `status` text DEFAULT 'generated' NOT NULL,
  `model` text,
  `prompt_version` text DEFAULT 'mai-practice-generator-v1' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `started_at` text,
  `completed_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`activity_type` IN ('drill', 'challenge')),
  CHECK (`status` IN ('generated', 'in_progress', 'completed', 'results_submitted', 'cancelled', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `practice_activity_results` (
  `id` text PRIMARY KEY NOT NULL,
  `practice_activity_id` text NOT NULL,
  `user_id` text NOT NULL,
  `related_session_id` text,
  `submission_type` text NOT NULL,
  `score` real,
  `attempts` integer,
  `successful_attempts` integer,
  `metrics_json` text DEFAULT '{}' NOT NULL,
  `result_notes` text DEFAULT '' NOT NULL,
  `user_reflection` text DEFAULT '' NOT NULL,
  `media_reference_json` text DEFAULT '{}' NOT NULL,
  `progress_status` text DEFAULT 'insufficient_data' NOT NULL,
  `progress_evidence_json` text DEFAULT '[]' NOT NULL,
  `next_recommendation_json` text DEFAULT '{}' NOT NULL,
  `shared_with_coach` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`practice_activity_id`) REFERENCES `practice_activities`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`submission_type` IN ('session_upload', 'csv', 'photo', 'manual', 'score', 'reflection')),
  CHECK (`progress_status` IN ('improved', 'maintained', 'needs_more_work', 'insufficient_data')),
  CHECK (`shared_with_coach` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activities_user_idx` ON `practice_activities` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activities_generated_by_idx` ON `practice_activities` (`generated_by`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activities_coach_idx` ON `practice_activities` (`coach_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activities_session_idx` ON `practice_activities` (`related_session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activity_results_activity_idx` ON `practice_activity_results` (`practice_activity_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `practice_activity_results_user_idx` ON `practice_activity_results` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `practice_activities_one_active_focus_unique`
  ON `practice_activities` (`user_id`, `activity_type`, `focus_area`)
  WHERE `status` IN ('generated', 'in_progress');
