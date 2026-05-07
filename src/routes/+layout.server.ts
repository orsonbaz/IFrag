import type { LayoutServerLoad } from './$types';
import { getActiveAmendmentId, getSettings } from '$lib/db/queries';
import { getSqlite } from '$lib/db/client';

export const load: LayoutServerLoad = async () => {
  const sqlite = getSqlite();
  const amendmentId = getActiveAmendmentId();
  let amendment: { version: string; isStarter: number } | null = null;
  if (amendmentId) {
    amendment = sqlite
      .prepare(`SELECT version, is_starter as isStarter FROM ifra_amendments WHERE id = ?`)
      .get(amendmentId) as { version: string; isStarter: number };
  }
  const settings = getSettings();
  return {
    amendment,
    settings: { ...settings }
  };
};
