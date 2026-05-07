-- price_minor was previously stored as integer cents-per-gram, which round-trips
-- cheap materials catastrophically (€8/kg → 0.8 cents/g → rounds to 1 → €10/kg).
-- Switch to integer cents-per-kg: €8/kg = 800. We multiply existing values by
-- 1000 so user-entered prices survive the unit change at whatever resolution
-- they currently have. Seed-imported prices will be slightly off until the user
-- resets data or edits the affected materials.
UPDATE `materials` SET `price_minor` = `price_minor` * 1000 WHERE `price_minor` IS NOT NULL;
