// Migration SQL strings, bundled at build time so the static deployment
// contains everything needed to initialise the DB on first launch.

import migration0 from '../../../../migrations/0000_init.sql?raw';
import migration1 from '../../../../migrations/0001_add_accord.sql?raw';

export const migrations = [
  { version: 0, name: '0000_init', sql: migration0 },
  { version: 1, name: '0001_add_accord', sql: migration1 }
];
