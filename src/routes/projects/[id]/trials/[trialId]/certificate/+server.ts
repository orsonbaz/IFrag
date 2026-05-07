import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
  getProject,
  getTrial,
  listTrialComponents,
  listCategories,
  buildComponentInputs,
  getActiveAmendmentId
} from '$lib/db/queries';
import { evaluate } from '$lib/compliance/engine';
import { getSqlite } from '$lib/db/client';
import { generateCertificate } from '$lib/pdf/certificate';

export const GET: RequestHandler = async ({ params }) => {
  const projectId = Number(params.id);
  const trialId = Number(params.trialId);
  const project = getProject(projectId);
  if (!project) throw error(404, 'Project not found');
  const trial = getTrial(trialId);
  if (!trial) throw error(404, 'Trial not found');

  const components = listTrialComponents(trialId);
  const engineComponents = buildComponentInputs(trialId);
  const categories = listCategories();
  const targetCatNumber = trial.targetCategoryNumber ?? project.targetCategoryNumber ?? 4;
  const targetCategory = categories.find((c) => c.number === targetCatNumber) ?? categories[0];

  const result = evaluate({
    components: engineComponents,
    targetCategoryNumber: targetCatNumber,
    compoundDosagePct: trial.compoundDosagePct,
    activeCategories: categories
  });

  const sqlite = getSqlite();
  const amendmentId = getActiveAmendmentId();
  const amendment = amendmentId
    ? (sqlite
        .prepare(`SELECT version, is_starter as isStarter FROM ifra_amendments WHERE id = ?`)
        .get(amendmentId) as { version: string; isStarter: number })
    : { version: 'unknown', isStarter: 0 };

  const pdfBytes = await generateCertificate({
    projectName: project.name,
    trialVersionLabel: trial.versionLabel,
    targetCategory,
    compoundDosagePct: trial.compoundDosagePct,
    amendmentVersion: amendment.version,
    amendmentIsStarter: !!amendment.isStarter,
    components: components.map((c) => ({
      name: c.materialName,
      cas: c.cas,
      partsPer1000: c.partsPer1000,
      dilutionPct: c.dilutionPct
    })),
    engineComponents,
    complianceResult: result,
    categories,
    generatedAt: new Date()
  });

  const slug = `${project.name}-${trial.versionLabel}`.replace(/[^a-z0-9-_]+/gi, '_');
  return new Response(pdfBytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="ifrag-cert-${slug}.pdf"`
    }
  });
};
