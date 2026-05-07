import type { PageLoad } from './$types';
import { getDb } from '$lib/db/client';
import { getSettings, listCategories } from '$lib/db/queries';

export const load: PageLoad = async () => {
  const db = await getDb();
  const settings = getSettings(db);
  const categories = listCategories(db);
  const counts = db
    .prepare(
      `SELECT
        (SELECT count(*) FROM materials) as materials,
        (SELECT count(*) FROM projects) as projects,
        (SELECT count(*) FROM trials) as trials,
        (SELECT count(*) FROM evaluations) as evaluations,
        (SELECT count(*) FROM ifra_standards) as standards`
    )
    .get() as unknown as {
    materials: number;
    projects: number;
    trials: number;
    evaluations: number;
    standards: number;
  };
  return { settings, categories, counts };
};
