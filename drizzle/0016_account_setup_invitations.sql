ALTER TABLE `member_invitations` ADD COLUMN `user_id` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `token_hash` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `created_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `email_type` text DEFAULT 'welcome' NOT NULL;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `email_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `provider_message_id` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `last_sent_at` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `send_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `opened_at` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `used_at` text;
--> statement-breakpoint
ALTER TABLE `member_invitations` ADD COLUMN `cancelled_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_invitations_token_hash_idx` ON `member_invitations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_invitations_user_status_idx` ON `member_invitations` (`member_id`,`status`,`created_at`);
