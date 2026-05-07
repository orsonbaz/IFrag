import type { RequestHandler } from './$types';
import { readFileSync } from 'node:fs';
import { getDbPath, getSqlite } from '$lib/db/client';

export const GET: RequestHandler = async () => {
  // Force a checkpoint so WAL is flushed.
  try {
    getSqlite().pragma('wal_checkpoint(TRUNCATE)');
  } catch {}
  const path = getDbPath();
  const data = readFileSync(path);
  const filename = `ifrag-${new Date().toISOString().slice(0, 10)}.db`;
  return new Response(data, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`
    }
  });
};
