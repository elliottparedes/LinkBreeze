ALTER TABLE `themes` ADD `owner_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `pages_theme_id_idx` ON `pages` (`theme_id`);
--> statement-breakpoint
CREATE INDEX `themes_owner_name_idx` ON `themes` (`owner_id`, `name`);
--> statement-breakpoint
CREATE INDEX `themes_preset_idx` ON `themes` (`is_preset`);
--> statement-breakpoint
-- Shared, unassigned and ambiguous legacy themes stay instance-managed.
UPDATE themes
SET owner_id = (
  SELECT min(user_id)
  FROM pages
  WHERE pages.theme_id = themes.id
  HAVING count(*) = count(user_id) AND count(DISTINCT user_id) = 1
)
WHERE is_preset = 0 AND is_active = 0;
