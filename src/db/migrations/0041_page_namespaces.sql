ALTER TABLE `users` ADD COLUMN `page_namespace` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_page_namespace_unique` ON `users` (`page_namespace`);
--> statement-breakpoint
CREATE INDEX `pages_slug_nocase_idx` ON `pages` (`slug` COLLATE NOCASE);
--> statement-breakpoint
CREATE INDEX `pages_user_id_idx` ON `pages` (`user_id`);
