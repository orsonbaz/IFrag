// Migration SQL strings, bundled at build time so the static deployment
// contains everything needed to initialise the DB on first launch.

import migration0 from '../../../../migrations/0000_init.sql?raw';
import migration1 from '../../../../migrations/0001_add_accord.sql?raw';
import migration2 from '../../../../migrations/0002_trial_component_dilution.sql?raw';
import migration3 from '../../../../migrations/0003_settings_visible_categories.sql?raw';
import migration4 from '../../../../migrations/0004_price_minor_per_kg.sql?raw';
import migration5 from '../../../../migrations/0005_settings_seed_price_repair_flag.sql?raw';

export const migrations = [
  { version: 0, name: '0000_init', sql: migration0 },
  { version: 1, name: '0001_add_accord', sql: migration1 },
  { version: 2, name: '0002_trial_component_dilution', sql: migration2 },
  { version: 3, name: '0003_settings_visible_categories', sql: migration3 },
  { version: 4, name: '0004_price_minor_per_kg', sql: migration4 },
  { version: 5, name: '0005_settings_seed_price_repair_flag', sql: migration5 }
];
