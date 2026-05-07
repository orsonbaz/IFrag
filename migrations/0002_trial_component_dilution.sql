ALTER TABLE `trial_components` ADD `dilution_pct` real;--> statement-breakpoint
UPDATE `trial_components` SET `dilution_pct` = (SELECT `dilution_pct` FROM `materials` WHERE `materials`.`id` = `trial_components`.`material_id`) WHERE `dilution_pct` IS NULL;
