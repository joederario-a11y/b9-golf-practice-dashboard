CREATE TABLE `golf_session_snapshots` (
	`user_email` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`sessions_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
