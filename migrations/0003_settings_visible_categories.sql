ALTER TABLE `settings` ADD `visible_category_numbers` text;--> statement-breakpoint
UPDATE `settings` SET `visible_category_numbers` = CAST(`default_category_number` AS text) WHERE `visible_category_numbers` IS NULL;
