import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import {
  getProject,
  getTrial,
  listTrialComponents,
  listMaterials,
  listCategories,
  listEvaluations,
  buildComponentInputs,
  loadStandardsByAmendment,
  getActiveAmendmentId
} from '$lib/db/queries';
import { getDb, getSqlite, schema } from '$lib/db/client';
import { evaluate } from '$lib/compliance/engine';
import { eq } from 'drizzle-orm';
import type { StandardLimit } from '$lib/compliance/types';

export const load: PageServerLoad = async ({ params }) => {
  const projectId = Number(params.id);
  const trialId = Number(params.trialId);
  const project = getProject(projectId);
  if (!project) throw error(404, 'Project not found');
  const trial = getTrial(trialId);
  if (!trial) throw error(404, 'Trial not found');

  const components = listTrialComponents(trialId);
  const materials = listMaterials();
  const categories = listCategories();
  const evaluations = listEvaluations(trialId);

  const engineInputs = buildComponentInputs(trialId);
  const result = evaluate({
    components: engineInputs,
    targetCategoryNumber: trial.targetCategoryNumber ?? project.targetCategoryNumber ?? 4,
    compoundDosagePct: trial.compoundDosagePct,
    activeCategories: categories
  });

  const amendmentId = getActiveAmendmentId();
  const standards = amendmentId ? loadStandardsByAmendment(amendmentId) : null;

  // Build a serialisable per-category verdict.
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

  // Per-component, per-direct-standard data so the row can show its own pills.
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
    standardsAvailable: standards ? standards.list.length : 0
  };
};

export const actions: Actions = {
  saveAll: async ({ params, request }) => {
    const trialId = Number(params.trialId);
    const data = await request.formData();
    const sqlite = getSqlite();

    const compoundDosagePct = Number(data.get('compoundDosagePct') ?? 20);
    const targetCategoryNumber = Number(data.get('targetCategoryNumber') ?? 4);
    const versionLabel = String(data.get('versionLabel') ?? 'v1').trim() || 'v1';
    const notes = String(data.get('notes') ?? '').trim() || null;

    const componentsRaw = String(data.get('componentsJson') ?? '[]');
    let parsed: Array<{ id?: number; materialId: number; partsPer1000: number; sortOrder: number; note?: string | null }>;
    try {
      parsed = JSON.parse(componentsRaw);
    } catch {
      return fail(400, { error: 'Invalid components payload' });
    }

    sqlite.transaction(() => {
      sqlite
        .prepare(
          `UPDATE trials SET version_label=?, compound_dosage_pct=?, target_category_number=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        )
        .run(versionLabel, compoundDosagePct, targetCategoryNumber, notes, trialId);
      sqlite.prepare(`DELETE FROM trial_components WHERE trial_id = ?`).run(trialId);
      const ins = sqlite.prepare(
        `INSERT INTO trial_components (trial_id, material_id, parts_per_1000, sort_order, note) VALUES (?, ?, ?, ?, ?)`
      );
      for (const c of parsed) {
        if (!c.materialId || c.partsPer1000 == null) continue;
        ins.run(trialId, c.materialId, c.partsPer1000, c.sortOrder ?? 0, c.note ?? null);
      }
    })();

    return { ok: true };
  },

  addEvaluation: async ({ params, request }) => {
    const trialId = Number(params.trialId);
    const data = await request.formData();
    const stage = String(data.get('stage') ?? 'overall') as
      | 'top'
      | 'heart'
      | 'base'
      | 'drydown'
      | 'overall';
    const elapsed = data.get('elapsedMinutes');
    const elapsedMinutes = elapsed ? Number(elapsed) : null;
    const rating = data.get('rating') ? Number(data.get('rating')) : null;
    const notes = String(data.get('notes') ?? '').trim() || null;
    const db = getDb();
    db.insert(schema.evaluations)
      .values({ trialId, stage, elapsedMinutes, rating, notes })
      .run();
    return { ok: true };
  },

  deleteEvaluation: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const db = getDb();
    db.delete(schema.evaluations).where(eq(schema.evaluations.id, id)).run();
    return { ok: true };
  }
};
