CREATE TABLE IF NOT EXISTS `auth_login_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`redirect_path` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_login_tokens_hash_unique` ON `auth_login_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_login_tokens_email_idx` ON `auth_login_tokens` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_sessions_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_sessions_user_idx` ON `auth_sessions` (`user_id`,`expires_at`);
