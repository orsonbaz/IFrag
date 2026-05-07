import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getMaterial, getMaterialAnnex } from '$lib/db/queries';
import { getDb, getSqlite, schema } from '$lib/db/client';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);
  const material = getMaterial(id);
  if (!material) throw error(404, 'Material not found');
  const annex = getMaterialAnnex(id);
  const sqlite = getSqlite();
  const links = sqlite
    .prepare(
      `SELECT s.id, s.material_name as name, s.standard_type as type, s.primary_cas as cas
       FROM material_ifra_links l JOIN ifra_standards s ON s.id = l.standard_id
       WHERE l.material_id = ?`
    )
    .all(id) as Array<{ id: number; name: string; type: string; cas: string | null }>;
  return { material, annex, links };
};

export const actions: Actions = {
  update: async ({ params, request }) => {
    const id = Number(params.id);
    const data = await request.formData();
    const priceEurPerKg = data.get('priceEurPerKg');
    const db = getDb();
    db.update(schema.materials)
      .set({
        name: String(data.get('name') ?? '').trim(),
        cas: String(data.get('cas') ?? '').trim() || null,
        supplier: String(data.get('supplier') ?? '').trim() || null,
        dilutionPct: Number(data.get('dilutionPct') ?? 100),
        priceMinor: priceEurPerKg ? Math.round((Number(priceEurPerKg) / 1000) * 100) : null,
        stockG: data.get('stockG') ? Number(data.get('stockG')) : null,
        notes: String(data.get('notes') ?? '').trim() || null,
        isNatural: data.get('isNatural') === 'on',
        updatedAt: new Date().toISOString()
      })
      .where(eq(schema.materials.id, id))
      .run();
    return { ok: true };
  },

  addAnnex: async ({ params, request }) => {
    const materialId = Number(params.id);
    const data = await request.formData();
    const constituentName = String(data.get('constituentName') ?? '').trim();
    if (!constituentName) return { ok: false };
    const constituentCas = String(data.get('constituentCas') ?? '').trim() || null;
    const contributionPct = Number(data.get('contributionPct') ?? 0);
    const db = getDb();
    db.insert(schema.materialAnnexContributions)
      .values({ materialId, constituentName, constituentCas, contributionPct })
      .run();
    return { ok: true };
  },

  removeAnnex: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const db = getDb();
    db.delete(schema.materialAnnexContributions)
      .where(eq(schema.materialAnnexContributions.id, id))
      .run();
    return { ok: true };
  }
};
