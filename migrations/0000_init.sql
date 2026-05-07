CREATE TABLE `evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trial_id` integer NOT NULL,
	`evaluated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`stage` text NOT NULL,
	`elapsed_minutes` integer,
	`rating` integer,
	`notes` text,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ifra_amendments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`published_on` text,
	`notes` text,
	`is_active` integer DEFAULT false NOT NULL,
	`is_starter` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ifra_amendments_version_unique` ON `ifra_amendments` (`version`);--> statement-breakpoint
CREATE TABLE `ifra_categories` (
	`number` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`sort_order` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ifra_categories_code_unique` ON `ifra_categories` (`code`);--> statement-breakpoint
CREATE TABLE `ifra_category_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`standard_id` integer NOT NULL,
	`category_number` integer NOT NULL,
	`limit_pct` real,
	`prohibited` integer DEFAULT false NOT NULL,
	`no_restriction` integer DEFAULT false NOT NULL,
	`spec_text` text,
	FOREIGN KEY (`standard_id`) REFERENCES `ifra_standards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_number`) REFERENCES `ifra_categories`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ifra_category_limits_uniq` ON `ifra_category_limits` (`standard_id`,`category_number`);--> statement-breakpoint
CREATE TABLE `ifra_standard_cas` (
	`standard_id` integer NOT NULL,
	`cas` text NOT NULL,
	PRIMARY KEY(`standard_id`, `cas`),
	FOREIGN KEY (`standard_id`) REFERENCES `ifra_standards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ifra_standard_cas_lookup` ON `ifra_standard_cas` (`cas`);--> statement-breakpoint
CREATE TABLE `ifra_standards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amendment_id` integer NOT NULL,
	`primary_cas` text,
	`material_name` text NOT NULL,
	`standard_type` text NOT NULL,
	`reason` text,
	`source_url` text,
	`raw_row` text,
	FOREIGN KEY (`amendment_id`) REFERENCES `ifra_amendments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ifra_standards_cas_idx` ON `ifra_standards` (`primary_cas`);--> statement-breakpoint
CREATE INDEX `ifra_standards_name_idx` ON `ifra_standards` (`material_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ifra_standards_uniq` ON `ifra_standards` (`amendment_id`,`primary_cas`,`material_name`);--> statement-breakpoint
CREATE TABLE `material_annex_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`material_id` integer NOT NULL,
	`constituent_name` text NOT NULL,
	`constituent_cas` text,
	`contribution_pct` real NOT NULL,
	`notes` text,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `material_ifra_links` (
	`material_id` integer NOT NULL,
	`standard_id` integer NOT NULL,
	`link_source` text NOT NULL,
	PRIMARY KEY(`material_id`, `standard_id`),
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`standard_id`) REFERENCES `ifra_standards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cas` text,
	`supplier` text,
	`price_minor` integer,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`dilution_pct` real DEFAULT 100 NOT NULL,
	`density_g_per_ml` real,
	`stock_g` real,
	`is_natural` integer DEFAULT false NOT NULL,
	`chemical_group` text,
	`family` text,
	`descriptor_1` text,
	`descriptor_2` text,
	`personal_description` text,
	`volatility` text,
	`dosage_band` text,
	`usage` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `materials_cas_idx` ON `materials` (`cas`);--> statement-breakpoint
CREATE INDEX `materials_name_idx` ON `materials` (`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brief` text,
	`target_category_number` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`target_category_number`) REFERENCES `ifra_categories`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`default_currency` text DEFAULT 'EUR' NOT NULL,
	`default_category_number` integer DEFAULT 4 NOT NULL,
	`default_unit_display` text DEFAULT 'pp1000' NOT NULL,
	`active_amendment_id` integer,
	`default_batch_g` real DEFAULT 30 NOT NULL,
	FOREIGN KEY (`active_amendment_id`) REFERENCES `ifra_amendments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trial_components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trial_id` integer NOT NULL,
	`material_id` integer NOT NULL,
	`parts_per_1000` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`version_label` text NOT NULL,
	`parent_trial_id` integer,
	`target_category_number` integer,
	`compound_dosage_pct` real DEFAULT 20 NOT NULL,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_category_number`) REFERENCES `ifra_categories`(`number`) ON UPDATE no action ON DELETE no action
);
