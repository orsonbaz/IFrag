// Pure client-side SPA. No SSR, no prerender — every route loads in the browser
// against an in-browser SQLite (sql.js) persisted to OPFS / IndexedDB.
export const ssr = false;
export const prerender = false;
export const csr = true;
export const trailingSlash = 'never';

import type { LayoutLoad } from './$types';
import { getDb } from '$lib/db/client';
import { getActiveAmendmentId, getSettings } from '$lib/db/queries';

export const load: LayoutLoad = async () => {
  const db = await getDb();
  const amendmentId = getActiveAmendmentId(db);
  let amendment: { version: string; isStarter: number } | null = null;
  if (amendmentId) {
    const r = db
      .prepare('SELECT version, is_starter as isStarter FROM ifra_amendments WHERE id = ?')
      .get(amendmentId);
    if (r) amendment = { version: String(r.version), isStarter: Number(r.isStarter) };
  }
  return {
    amendment,
    settings: getSettings(db)
  };
};
