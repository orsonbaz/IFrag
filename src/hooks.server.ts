import type { Handle } from '@sveltejs/kit';
import { runMigrations, getDbPath, getDb } from '$lib/db/client';
import { runSeed } from '$lib/db/seed';

let bootstrapped = false;

function bootstrap() {
  if (bootstrapped) return;
  runMigrations();
  runSeed();
  console.log(`[ifrag] DB ready at ${getDbPath()}`);
  bootstrapped = true;
}

export const handle: Handle = async ({ event, resolve }) => {
  bootstrap();
  event.locals.db = getDb();
  return resolve(event);
};
