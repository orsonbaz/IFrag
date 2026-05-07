import type { Actions, PageServerLoad } from './$types';
import { getSqlite, getDb, schema } from '$lib/db/client';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const sqlite = getSqlite();
  const amendments = sqlite
    .prepare(
      `SELECT id, version, published_on as publishedOn, notes, is_active as isActive, is_starter as isStarter
       FROM ifra_amendments ORDER BY id DESC`
    )
    .all() as Array<{ id: number; version: string; publishedOn: string | null; notes: string | null; isActive: number; isStarter: number }>;

  const activeAmendmentId = amendments.find((a) => a.isActive)?.id ?? null;
  const standards = activeAmendmentId
    ? (sqlite
        .prepare(
          `SELECT s.id, s.material_name as name, s.primary_cas as cas, s.standard_type as type, s.reason
           FROM ifra_standards s WHERE amendment_id = ? ORDER BY material_name`
        )
        .all(activeAmendmentId) as Array<{ id: number; name: string; cas: string | null; type: string; reason: string | null }>)
    : [];

  const counts = sqlite
    .prepare(
      `SELECT amendment_id as amendmentId, count(*) as c FROM ifra_standards GROUP BY amendment_id`
    )
    .all() as Array<{ amendmentId: number; c: number }>;
  const countMap = new Map(counts.map((r) => [r.amendmentId, r.c]));

  return {
    amendments: amendments.map((a) => ({ ...a, count: countMap.get(a.id) ?? 0 })),
    activeAmendmentId,
    standards
  };
};

export const actions: Actions = {
  setActive: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const sqlite = getSqlite();
    sqlite.transaction(() => {
      sqlite.prepare(`UPDATE ifra_amendments SET is_active = 0`).run();
      sqlite.prepare(`UPDATE ifra_amendments SET is_active = 1 WHERE id = ?`).run(id);
      sqlite.prepare(`UPDATE settings SET active_amendment_id = ? WHERE id = 1`).run(id);
    })();
    return { ok: true };
  },

  delete: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const db = getDb();
    db.delete(schema.ifraAmendments).where(eq(schema.ifraAmendments.id, id)).run();
    return { ok: true };
  }
};
