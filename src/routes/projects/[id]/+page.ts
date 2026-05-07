import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import {
  buildComponentInputs,
  getProject,
  listCategories,
  listTrialComponents,
  listTrials
} from '$lib/db/queries';
import { evaluate } from '$lib/compliance/engine';

export const load: PageLoad = async ({ params }) => {
  const id = Number(params.id);
  const db = await getDb();
  const project = getProject(db, id);
  if (!project) throw error(404, 'Project not found');
  const trials = listTrials(db, id);
  const categories = listCategories(db);

  const trialSummaries = trials.map((t) => {
    const componentCount = listTrialComponents(db, t.id).length;
    const components = buildComponentInputs(db, t.id);
    const result = evaluate({
      components,
      targetCategoryNumber: t.targetCategoryNumber ?? project.targetCategoryNumber ?? 4,
      compoundDosagePct: t.compoundDosagePct,
      activeCategories: categories
    });
    const targetCat = t.targetCategoryNumber ?? project.targetCategoryNumber ?? 4;
    const targetVerdict = result.perCategory.get(targetCat);
    return {
      ...t,
      componentCount,
      complianceStatus: targetVerdict?.status ?? 'unknown',
      failuresAtTarget: targetVerdict?.failures.length ?? 0
    };
  });

  return { project, trials: trialSummaries, categories };
};
