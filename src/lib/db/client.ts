/**
 * Client-side SQLite-in-WASM database, persisted to OPFS (or IndexedDB fallback).
 *
 * We expose a tiny adapter shaped like better-sqlite3 (`prepare(sql).run/get/all/`)
 * so the rest of the codebase reads as plain SQL.
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { browser } from '$app/environment';
import { base } from '$app/paths';
import { migrations } from './sql/bundled.js';
// Vite bundles the WASM and gives us a fingerprinted URL we can pass straight
// to initSqlJs. Avoids any locateFile-vs-base-path mismatch.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const DB_FILENAME = 'ifrag.db';
const SCHEMA_VERSION_KEY = 'schema_version';

let SQL: SqlJsStatic | null = null;
let _db: Database | null = null;
let _adapter: DbAdapter | null = null;
let initPromise: Promise<DbAdapter> | null = null;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;

export interface PreparedStatement {
  run(...args: unknown[]): { lastInsertRowid: number; changes: number };
  get(...args: unknown[]): Record<string, unknown> | undefined;
  all(...args: unknown[]): Record<string, unknown>[];
}

export interface DbAdapter {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  raw(): Database;
  export(): Uint8Array;
  import(bytes: Uint8Array): Promise<void>;
  flush(): Promise<void>;
}

function makePrepared(db: Database, sql: string): PreparedStatement {
  return {
    run(...args: unknown[]) {
      const stmt = db.prepare(sql);
      try {
        if (args.length) stmt.bind(args as never);
        // For RETURNING-style queries, step until done; otherwise just step once.
        let lastObj: Record<string, unknown> | undefined;
        while (stmt.step()) {
          lastObj = stmt.getAsObject() as Record<string, unknown>;
        }
        const lastInsertRowid = Number(
          (db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number | bigint) ?? 0
        );
        // If RETURNING produced an id, prefer that.
        const returnedId =
          lastObj && typeof lastObj.id === 'number' ? (lastObj.id as number) : null;
        const changes = Number(
          (db.exec('SELECT changes() as c')[0]?.values[0]?.[0] as number | bigint) ?? 0
        );
        return { lastInsertRowid: returnedId ?? lastInsertRowid, changes };
      } finally {
        stmt.free();
        scheduleSave();
      }
    },
    get(...args: unknown[]) {
      const stmt = db.prepare(sql);
      try {
        if (args.length) stmt.bind(args as never);
        if (!stmt.step()) return undefined;
        return stmt.getAsObject() as Record<string, unknown>;
      } finally {
        stmt.free();
      }
    },
    all(...args: unknown[]) {
      const stmt = db.prepare(sql);
      try {
        if (args.length) stmt.bind(args as never);
        const out: Record<string, unknown>[] = [];
        while (stmt.step()) out.push(stmt.getAsObject() as Record<string, unknown>);
        return out;
      } finally {
        stmt.free();
      }
    }
  };
}

function makeAdapter(db: Database): DbAdapter {
  return {
    prepare: (sql) => makePrepared(db, sql),
    exec(sql) {
      db.exec(sql);
      scheduleSave();
    },
    transaction<T>(fn: () => T) {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        scheduleSave();
        return r;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    },
    raw: () => db,
    export: () => db.export(),
    async import(bytes: Uint8Array) {
      const SQLready = await ensureSql();
      try {
        db.close();
      } catch {}
      _db = new SQLready.Database(bytes);
      _adapter = makeAdapter(_db);
      await persistNow();
    },
    flush: () => persistNow()
  };
}

async function ensureSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // sqlWasmUrl is an absolute URL Vite emitted for the bundled WASM.
  // Some sql.js builds also probe `<file>` relative paths, so for the rare
  // fallback fetches we point at the static copy in /static.
  SQL = await initSqlJs({
    locateFile: (file) => {
      if (file.endsWith('.wasm')) return sqlWasmUrl;
      return `${base}/${file}`;
    }
  });
  return SQL;
}

function scheduleSave() {
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistNow();
  }, 250);
}

async function persistNow() {
  if (!_db || !pendingSave) return;
  pendingSave = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const bytes = _db.export();
  await writeOPFS(bytes);
  await writeIndexedDB(bytes);
}

async function getOPFSRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) return null;
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

async function readOPFS(): Promise<Uint8Array | null> {
  const root = await getOPFSRoot();
  if (!root) return null;
  try {
    const handle = await root.getFileHandle(DB_FILENAME, { create: false });
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeOPFS(bytes: Uint8Array): Promise<void> {
  const root = await getOPFSRoot();
  if (!root) return;
  try {
    const handle = await root.getFileHandle(DB_FILENAME, { create: true });
    const writable = await (handle as FileSystemFileHandle & {
      createWritable: () => Promise<{ write: (data: BufferSource) => Promise<void>; close: () => Promise<void> }>;
    }).createWritable();
    await writable.write(bytes);
    await writable.close();
  } catch (err) {
    console.warn('OPFS write failed:', err);
  }
}

async function readIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('ifrag', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('blobs', 'readonly');
        const get = tx.objectStore('blobs').get(DB_FILENAME);
        get.onsuccess = () => {
          const v = get.result as Uint8Array | undefined;
          resolve(v ?? null);
          req.result.close();
        };
        get.onerror = () => {
          resolve(null);
          req.result.close();
        };
      } catch {
        resolve(null);
      }
    };
  });
}

async function writeIndexedDB(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open('ifrag', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onerror = () => resolve();
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(bytes, DB_FILENAME);
        tx.oncomplete = () => {
          resolve();
          req.result.close();
        };
        tx.onerror = () => {
          resolve();
          req.result.close();
        };
      } catch {
        resolve();
      }
    };
  });
}

async function loadPersisted(): Promise<Uint8Array | null> {
  return (await readOPFS()) ?? (await readIndexedDB());
}

async function bootstrap(): Promise<DbAdapter> {
  const SQLready = await ensureSql();
  const persisted = await loadPersisted();
  _db = persisted ? new SQLready.Database(persisted) : new SQLready.Database();
  _adapter = makeAdapter(_db);

  if (!persisted) {
    runMigrations(_db);
    // Lazy seed import (relatively heavy JSON), only on a fresh DB.
    const { runSeed } = await import('./seed.js');
    runSeed(_adapter);
    await persistNow();
  } else {
    runMigrations(_db);
    await persistNow();
  }
  await runSeedPriceRepair(_adapter);
  // Persist on unload as a safety net.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try {
        if (_db && pendingSave) writeIndexedDB(_db.export());
      } catch {}
    });
  }
  return _adapter;
}

async function runSeedPriceRepair(adapter: DbAdapter) {
  // One-time repair: reset seed-material prices that were corrupted by the
  // pre-v4 cents-per-gram rounding (€8/kg → 1 → migrated to 1000 = €10/kg).
  // Gated by a marker column on settings so we only run it once.
  let alreadyRepaired = false;
  try {
    const r = adapter
      .prepare('SELECT seed_prices_repaired_at FROM settings WHERE id = 1')
      .get() as { seed_prices_repaired_at: string | null } | undefined;
    alreadyRepaired = !!r?.seed_prices_repaired_at;
  } catch {
    return; // Column missing → migration 5 hasn't run; nothing to do.
  }
  if (alreadyRepaired) return;
  const { repairSeedPrices } = await import('./seed.js');
  repairSeedPrices(adapter);
  adapter
    .prepare(`UPDATE settings SET seed_prices_repaired_at = datetime('now') WHERE id = 1`)
    .run();
  await persistNow();
}

function runMigrations(db: Database) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _ifrag_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT DEFAULT (CURRENT_TIMESTAMP))`
  );
  const applied = new Set<number>();
  const rows = db.exec('SELECT version FROM _ifrag_migrations');
  if (rows[0]) for (const v of rows[0].values) applied.add(Number(v[0]));
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      // sql.js' exec splits on `;` correctly, but drizzle migrations use
      // `--> statement-breakpoint` markers. Strip them first.
      const cleaned = m.sql.replace(/-->\s*statement-breakpoint/g, '');
      db.exec(cleaned);
      const stmt = db.prepare('INSERT INTO _ifrag_migrations (version, name) VALUES (?, ?)');
      stmt.bind([m.version, m.name]);
      stmt.step();
      stmt.free();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export async function getDb(): Promise<DbAdapter> {
  if (_adapter) return _adapter;
  if (!browser) {
    // Building / SSR — don't actually init. Routes are client-only.
    throw new Error('DB is browser-only');
  }
  if (initPromise) return initPromise;
  initPromise = bootstrap();
  return initPromise;
}

export async function exportDb(): Promise<Uint8Array> {
  const db = await getDb();
  await db.flush();
  return db.export();
}

export async function importDb(bytes: Uint8Array): Promise<void> {
  const db = await getDb();
  await db.import(bytes);
}

export async function resetDb(): Promise<void> {
  // Wipe persisted copies, drop in-memory, re-bootstrap.
  const root = await getOPFSRoot();
  if (root) {
    try {
      await root.removeEntry(DB_FILENAME);
    } catch {}
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('ifrag');
    req.onblocked = req.onerror = req.onsuccess = () => resolve();
  });
  if (_db) {
    try {
      _db.close();
    } catch {}
  }
  _db = null;
  _adapter = null;
  initPromise = null;
}
