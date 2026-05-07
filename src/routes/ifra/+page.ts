import type { PageLoad } from './$types';
import { getDb } from '$lib/db/client';

export const load: PageLoad = async () => {
  const db = await getDb();
  const amendments = db
    .prepare(
      `SELECT id, version, published_on as publishedOn, notes, is_active as isActive, is_starter as isStarter
       FROM ifra_amendments ORDER BY id DESC`
    )
    .all() as unknown as Array<{
    id: number;
    version: string;
    publishedOn: string | null;
    notes: string | null;
    isActive: number;
    isStarter: number;
  }>;
  const activeAmendmentId = amendments.find((a) => a.isActive)?.id ?? null;
  const standards = activeAmendmentId
    ? (db
        .prepare(
          `SELECT s.id, s.material_name as name, s.primary_cas as cas, s.standard_type as type, s.reason
           FROM ifra_standards s WHERE amendment_id = ? ORDER BY material_name`
        )
        .all(activeAmendmentId) as unknown as Array<{
        id: number;
        name: string;
        cas: string | null;
        type: string;
        reason: string | null;
      }>)
    : [];
  const counts = db
    .prepare('SELECT amendment_id as amendmentId, count(*) as c FROM ifra_standards GROUP BY amendment_id')
    .all() as unknown as Array<{ amendmentId: number; c: number }>;
  const countMap = new Map(counts.map((r) => [r.amendmentId, r.c]));
  return {
    amendments: amendments.map((a) => ({ ...a, count: countMap.get(a.id) ?? 0 })),
    activeAmendmentId,
    standards
  };
};
