import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;
let _path: string | null = null;

function resolveDataDir(): string {
  return process.env.IFRAG_HOME || join(homedir(), '.ifrag');
}

function resolveMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Try several common positions: dev (./src/lib/db -> ../../../migrations) and build (./build/...)
  const candidates = [
    join(here, '..', '..', '..', 'migrations'),
    join(here, '..', '..', 'migrations'),
    join(here, '..', 'migrations'),
    join(process.cwd(), 'migrations')
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return join(process.cwd(), 'migrations');
}

export function getDbPath(): string {
  if (_path) return _path;
  const dir = resolveDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _path = join(dir, 'ifrag.db');
  return _path;
}

export function getDb() {
  if (_db) return _db;
  const path = getDbPath();
  _sqlite = new Database(path);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getSqlite() {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function runMigrations() {
  const db = getDb();
  const folder = resolveMigrationsFolder();
  migrate(db, { migrationsFolder: folder });
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

export { schema };
