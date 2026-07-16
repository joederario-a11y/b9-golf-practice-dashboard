CREATE TABLE IF NOT EXISTS `mai_caddy_session_analyses` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `session_id` text NOT NULL,
  `status` text DEFAULT 'processing' NOT NULL,
  `analysis_json` text DEFAULT '{}' NOT NULL,
  `calculated_metrics_json` text DEFAULT '{}' NOT NULL,
  `model` text,
  `prompt_version` text DEFAULT 'mai-caddy-v1' NOT NULL,
  `error_code` text,
  `error_message` text,
  `is_current` integer DEFAULT 1 NOT NULL,
  `started_at` text,
  `completed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`status` IN ('processing', 'completed', 'failed', 'insufficient_data')),
  CHECK (`is_current` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mai_caddy_session_analyses_user_idx`
ON `mai_caddy_session_analyses` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mai_caddy_session_analyses_session_idx`
ON `mai_caddy_session_analyses` (`session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mai_caddy_session_analyses_user_session_idx`
ON `mai_caddy_session_analyses` (`user_id`, `session_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mai_caddy_session_analyses_current_idx`
ON `mai_caddy_session_analyses` (`user_id`, `session_id`, `is_current`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mai_caddy_session_analyses_one_current_unique`
ON `mai_caddy_session_analyses` (`user_id`, `session_id`)
WHERE `is_current` = 1;
