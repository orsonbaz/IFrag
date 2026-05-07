import type { Actions, PageServerLoad } from './$types';
import { getSettings, listCategories } from '$lib/db/queries';
import { getDb, getDbPath, getSqlite, schema } from '$lib/db/client';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const settings = getSettings();
  const categories = listCategories();
  const sqlite = getSqlite();
  const counts = sqlite
    .prepare(
      `SELECT
        (SELECT count(*) FROM materials) as materials,
        (SELECT count(*) FROM projects) as projects,
        (SELECT count(*) FROM trials) as trials,
        (SELECT count(*) FROM evaluations) as evaluations,
        (SELECT count(*) FROM ifra_standards) as standards`
    )
    .get() as { materials: number; projects: number; trials: number; evaluations: number; standards: number };
  return { settings, categories, dbPath: getDbPath(), counts };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const data = await request.formData();
    const db = getDb();
    db.update(schema.settings)
      .set({
        defaultCurrency: String(data.get('defaultCurrency') ?? 'EUR'),
        defaultCategoryNumber: Number(data.get('defaultCategoryNumber') ?? 4),
        defaultUnitDisplay: (String(data.get('defaultUnitDisplay') ?? 'pp1000') as 'pp1000' | 'pct' | 'grams'),
        defaultBatchG: Number(data.get('defaultBatchG') ?? 30)
      })
      .where(eq(schema.settings.id, 1))
      .run();
    return { ok: true };
  }
};
