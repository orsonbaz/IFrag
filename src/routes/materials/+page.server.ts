import type { Actions, PageServerLoad } from './$types';
import { listMaterials, getActiveAmendmentId } from '$lib/db/queries';
import { getDb, getSqlite, schema } from '$lib/db/client';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const materials = listMaterials();
  const sqlite = getSqlite();
  const linkRows = sqlite
    .prepare(
      `SELECT material_id as materialId, count(*) as c FROM material_ifra_links GROUP BY material_id`
    )
    .all() as Array<{ materialId: number; c: number }>;
  const annexRows = sqlite
    .prepare(
      `SELECT material_id as materialId, count(*) as c FROM material_annex_contributions GROUP BY material_id`
    )
    .all() as Array<{ materialId: number; c: number }>;
  const linkMap = new Map(linkRows.map((r) => [r.materialId, r.c]));
  const annexMap = new Map(annexRows.map((r) => [r.materialId, r.c]));
  return {
    materials: materials.map((m) => ({
      ...m,
      linkedStandards: linkMap.get(m.id) ?? 0,
      annexCount: annexMap.get(m.id) ?? 0
    })),
    amendmentId: getActiveAmendmentId()
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return { ok: false, error: 'Name required' };
    const cas = String(data.get('cas') ?? '').trim() || null;
    const supplier = String(data.get('supplier') ?? '').trim() || null;
    const dilutionPct = Number(data.get('dilutionPct') ?? 100);
    const isNatural = data.get('isNatural') === 'on';
    const priceEurPerKg = data.get('priceEurPerKg');
    const priceMinor = priceEurPerKg ? Math.round((Number(priceEurPerKg) / 1000) * 100) : null;
    const db = getDb();
    db.insert(schema.materials)
      .values({
        name,
        cas,
        supplier,
        dilutionPct,
        isNatural,
        priceMinor,
        currency: 'EUR'
      })
      .run();
    return { ok: true };
  },

  delete: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const db = getDb();
    db.delete(schema.materials).where(eq(schema.materials.id, id)).run();
    return { ok: true };
  }
};
