CREATE TABLE IF NOT EXISTS `golf_practice_profiles` (
	`user_email` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`profile_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
