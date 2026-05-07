import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  getProject,
  listTrials,
  listTrialComponents,
  listCategories,
  buildComponentInputs
} from '$lib/db/queries';
import { evaluate } from '$lib/compliance/engine';

export const load: PageServerLoad = async ({ params, url }) => {
  const projectId = Number(params.id);
  const project = getProject(projectId);
  if (!project) throw error(404, 'Project not found');

  const allTrials = listTrials(projectId);
  const idsParam = url.searchParams.get('ids');
  const selectedIds = idsParam
    ? idsParam
        .split(',')
        .map((s) => Number(s))
        .filter((n) => !isNaN(n))
    : allTrials.map((t) => t.id);

  const categories = listCategories();

  const trials = selectedIds
    .map((id) => allTrials.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => {
      const components = listTrialComponents(t.id);
      const engineInputs = buildComponentInputs(t.id);
      const result = evaluate({
        components: engineInputs,
        targetCategoryNumber: t.targetCategoryNumber ?? project.targetCategoryNumber ?? 4,
        compoundDosagePct: t.compoundDosagePct,
        activeCategories: categories
      });
      let totalCostMinor = 0;
      let total = 0;
      for (const c of components) {
        total += c.partsPer1000;
        if (c.priceMinor != null) {
          totalCostMinor += (c.partsPer1000 / 1000) * 30 * c.priceMinor;
        }
      }
      const targetCat = t.targetCategoryNumber ?? project.targetCategoryNumber ?? 4;
      const targetVerdict = result.perCategory.get(targetCat);
      return {
        ...t,
        components,
        total,
        totalCostMinorPer30g: Math.round(totalCostMinor),
        complianceStatus: targetVerdict?.status ?? 'unknown',
        failuresAtTarget: targetVerdict?.failures.length ?? 0,
        perCategory: categories.map((cat) => ({
          number: cat.number,
          status: result.perCategory.get(cat.number)?.status ?? 'unknown'
        }))
      };
    });

  // Build a unified material set for the comparison rows.
  const allMaterialIds = new Set<number>();
  for (const t of trials) for (const c of t.components) allMaterialIds.add(c.materialId);
  const materialOrder: Array<{ id: number; name: string; cas: string | null; isNatural: boolean }> = [];
  const seen = new Set<number>();
  for (const t of trials) {
    for (const c of t.components) {
      if (!seen.has(c.materialId)) {
        seen.add(c.materialId);
        materialOrder.push({
          id: c.materialId,
          name: c.materialName,
          cas: c.cas,
          isNatural: !!c.isNatural
        });
      }
    }
  }

  return {
    project,
    allTrials,
    trials,
    selectedIds,
    materialOrder,
    categories
  };
};
