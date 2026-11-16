ALTER TABLE `analytics_pageviews` ADD `source` text;--> statement-breakpoint
ALTER TABLE `analytics_clicks` ADD `source` text;--> statement-breakpoint
CREATE TABLE `analytics_social_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer,
	`platform` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`source` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
