import type { PageLoad } from './$types';
import { getDb } from '$lib/db/client';
import { getActiveAmendmentId, listMaterials } from '$lib/db/queries';

export const load: PageLoad = async () => {
  const db = await getDb();
  const materials = listMaterials(db);
  const linkRows = db
    .prepare('SELECT material_id as materialId, count(*) as c FROM material_ifra_links GROUP BY material_id')
    .all() as unknown as Array<{ materialId: number; c: number }>;
  const annexRows = db
    .prepare(
      'SELECT material_id as materialId, count(*) as c FROM material_annex_contributions GROUP BY material_id'
    )
    .all() as unknown as Array<{ materialId: number; c: number }>;
  const linkMap = new Map(linkRows.map((r) => [r.materialId, r.c]));
  const annexMap = new Map(annexRows.map((r) => [r.materialId, r.c]));
  return {
    materials: materials.map((m) => ({
      ...m,
      linkedStandards: linkMap.get(m.id) ?? 0,
      annexCount: annexMap.get(m.id) ?? 0
    })),
    amendmentId: getActiveAmendmentId(db)
  };
};
