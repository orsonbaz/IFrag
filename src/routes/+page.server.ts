import type { Actions, PageServerLoad } from './$types';
import { listProjects } from '$lib/db/queries';
import { getDb, getSqlite } from '$lib/db/client';
import { schema } from '$lib/db/client';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const projects = listProjects();
  const sqlite = getSqlite();
  const counts = sqlite
    .prepare(`SELECT project_id as projectId, count(*) as c FROM trials GROUP BY project_id`)
    .all() as Array<{ projectId: number; c: number }>;
  const trialCountByProject = new Map<number, number>();
  for (const r of counts) trialCountByProject.set(r.projectId, r.c);
  return {
    projects: projects.map((p) => ({ ...p, trialCount: trialCountByProject.get(p.id) ?? 0 }))
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return { ok: false, error: 'Name required' };
    const brief = String(data.get('brief') ?? '').trim() || null;
    const targetCategoryNumber = Number(data.get('targetCategoryNumber') ?? 4) || 4;
    const db = getDb();
    const inserted = db
      .insert(schema.projects)
      .values({ name, brief, targetCategoryNumber })
      .returning({ id: schema.projects.id })
      .get();
    throw redirect(303, `/projects/${inserted!.id}`);
  }
};
