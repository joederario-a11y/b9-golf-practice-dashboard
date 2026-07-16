ALTER TABLE `golf_session_snapshots` ADD COLUMN `user_id` text;--> statement-breakpoint
ALTER TABLE `golf_practice_profiles` ADD COLUMN `user_id` text;--> statement-breakpoint
UPDATE `golf_session_snapshots`
SET `user_id` = (
  SELECT `users`.`id`
  FROM `users`
  WHERE lower(`users`.`email`) = lower(`golf_session_snapshots`.`user_email`)
)
WHERE `user_id` IS NULL;--> statement-breakpoint
UPDATE `golf_practice_profiles`
SET `user_id` = (
  SELECT `users`.`id`
  FROM `users`
  WHERE lower(`users`.`email`) = lower(`golf_practice_profiles`.`user_email`)
)
WHERE `user_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `golf_session_snapshots_user_id_unique`
ON `golf_session_snapshots` (`user_id`)
WHERE `user_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `golf_practice_profiles_user_id_unique`
ON `golf_practice_profiles` (`user_id`)
WHERE `user_id` IS NOT NULL;
