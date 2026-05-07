import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import { getMaterial, getMaterialAnnex } from '$lib/db/queries';

export const load: PageLoad = async ({ params }) => {
  const id = Number(params.id);
  const db = await getDb();
  const material = getMaterial(db, id);
  if (!material) throw error(404, 'Material not found');
  const annex = getMaterialAnnex(db, id);
  const links = db
    .prepare(
      `SELECT s.id, s.material_name as name, s.standard_type as type, s.primary_cas as cas
       FROM material_ifra_links l JOIN ifra_standards s ON s.id = l.standard_id
       WHERE l.material_id = ?`
    )
    .all(id) as unknown as Array<{ id: number; name: string; type: string; cas: string | null }>;
  return { material, annex, links };
};
