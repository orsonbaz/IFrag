import type { PageLoad } from './$types';
import { getDb } from '$lib/db/client';
import { listProjects } from '$lib/db/queries';

export const load: PageLoad = async () => {
  const db = await getDb();
  const projects = listProjects(db);
  const counts = db
    .prepare('SELECT project_id as projectId, count(*) as c FROM trials GROUP BY project_id')
    .all() as unknown as Array<{ projectId: number; c: number }>;
  const trialCountByProject = new Map<number, number>();
  for (const r of counts) trialCountByProject.set(r.projectId, r.c);
  return {
    projects: projects.map((p) => ({ ...p, trialCount: trialCountByProject.get(p.id) ?? 0 }))
  };
};
