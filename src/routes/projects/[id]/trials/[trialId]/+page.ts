import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import {
  buildComponentInputs,
  getActiveAmendmentId,
  getProject,
  getTrial,
  listCategories,
  listEvaluations,
  listMaterials,
  listTrialComponents,
  loadStandardsByAmendment
} from '$lib/db/queries';
import { evaluate } from '$lib/compliance/engine';

export const load: PageLoad = async ({ params }) => {
  const projectId = Number(params.id);
  const trialId = Number(params.trialId);
  const db = await getDb();
  const project = getProject(db, projectId);
  if (!project) throw error(404, 'Project not found');
  const trial = getTrial(db, trialId);
  if (!trial) throw error(404, 'Trial not found');

  const components = listTrialComponents(db, trialId);
  const materials = listMaterials(db);
  const categories = listCategories(db);
  const evaluations = listEvaluations(db, trialId);

  const engineInputs = buildComponentInputs(db, trialId);
  const result = evaluate({
    components: engineInputs,
    targetCategoryNumber: trial.targetCategoryNumber ?? project.targetCategoryNumber ?? 4,
    compoundDosagePct: trial.compoundDosagePct,
    activeCategories: categories
  });

  const amendmentId = getActiveAmendmentId(db);
  const standards = amendmentId ? loadStandardsByAmendment(db, amendmentId) : null;

  const accordRow = db
    .prepare('SELECT id, name FROM materials WHERE source_trial_id = ?')
    .get(trialId) as { id: number; name: string } | undefined;

  const perCategory = categories.map((cat) => {
    const v = result.perCategory.get(cat.number);
    return {
      category: cat,
      status: v?.status ?? 'unknown',
      failures: (v?.failures ?? []).map((f) => ({
        standardId: f.standardId,
        standardName: f.standardName,
        severity: f.severity,
        contributors: f.contributors,
        limitPct: f.limitPct,
        actualInProductPct: f.actualInProductPct,
        reason: f.reason
      }))
    };
  });

  const componentMeta = engineInputs.map((c) => ({
    componentId: c.componentId,
    directStandards: c.directStandards.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    annexCount: c.annexContributions.length
  }));

  return {
    project,
    trial,
    components,
    materials,
    categories,
    evaluations,
    perCategory,
    warnings: result.warnings,
    componentsTotal: result.componentsTotalPp1000,
    componentMeta,
    standardsAvailable: standards ? standards.list.length : 0,
    accord: accordRow ?? null
  };
};
