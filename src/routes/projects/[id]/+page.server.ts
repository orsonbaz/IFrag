import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  getProject,
  listTrials,
  listTrialComponents,
  listCategories,
  buildComponentInputs
} from '$lib/db/queries';
import { getDb, getSqlite, schema } from '$lib/db/client';
import { evaluate } from '$lib/compliance/engine';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);
  const project = getProject(id);
  if (!project) throw error(404, 'Project not found');

  const trials = listTrials(id);
  const categories = listCategories();

  const trialSummaries = trials.map((t) => {
    const componentCount = listTrialComponents(t.id).length;
    const components = buildComponentInputs(t.id);
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

export const actions: Actions = {
  newTrial: async ({ params, request }) => {
    const projectId = Number(params.id);
    const data = await request.formData();
    const versionLabel = String(data.get('versionLabel') ?? `v${Date.now()}`).trim() || 'v1';
    const compoundDosagePct = Number(data.get('compoundDosagePct') ?? 20);
    const project = getProject(projectId);
    if (!project) throw error(404, 'Project not found');
    const db = getDb();
    const inserted = db
      .insert(schema.trials)
      .values({
        projectId,
        versionLabel,
        compoundDosagePct,
        targetCategoryNumber: project.targetCategoryNumber
      })
      .returning({ id: schema.trials.id })
      .get();
    throw redirect(303, `/projects/${projectId}/trials/${inserted!.id}`);
  },

  forkTrial: async ({ params, request }) => {
    const projectId = Number(params.id);
    const data = await request.formData();
    const sourceTrialId = Number(data.get('sourceTrialId'));
    const sqlite = getSqlite();
    const source = sqlite
      .prepare(`SELECT * FROM trials WHERE id = ?`)
      .get(sourceTrialId) as
      | {
          id: number;
          version_label: string;
          target_category_number: number | null;
          compound_dosage_pct: number;
          notes: string | null;
        }
      | undefined;
    if (!source) throw error(404, 'Source trial not found');
    const newLabel = `${source.version_label}+`;
    const result = sqlite
      .prepare(
        `INSERT INTO trials (project_id, version_label, parent_trial_id,
                             target_category_number, compound_dosage_pct, notes)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .get(
        projectId,
        newLabel,
        source.id,
        source.target_category_number,
        source.compound_dosage_pct,
        source.notes
      ) as { id: number };
    sqlite
      .prepare(
        `INSERT INTO trial_components (trial_id, material_id, parts_per_1000, sort_order, note)
         SELECT ?, material_id, parts_per_1000, sort_order, note FROM trial_components WHERE trial_id = ?`
      )
      .run(result.id, source.id);
    throw redirect(303, `/projects/${projectId}/trials/${result.id}`);
  },

  updateProject: async ({ params, request }) => {
    const projectId = Number(params.id);
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const brief = String(data.get('brief') ?? '').trim() || null;
    const targetCategoryNumber = Number(data.get('targetCategoryNumber') ?? 4) || 4;
    const db = getDb();
    db.update(schema.projects)
      .set({ name, brief, targetCategoryNumber })
      .where(eq(schema.projects.id, projectId))
      .run();
    return { ok: true };
  },

  deleteTrial: async ({ params, request }) => {
    const projectId = Number(params.id);
    const data = await request.formData();
    const trialId = Number(data.get('trialId'));
    const db = getDb();
    db.delete(schema.trials).where(eq(schema.trials.id, trialId)).run();
    return { ok: true, projectId };
  }
};
