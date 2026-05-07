import { getDb } from '$lib/db/client';
import {
  buildComponentInputs,
  getActiveAmendmentId,
  getProject,
  getTrial,
  listCategories,
  listTrialComponents
} from '$lib/db/queries';
import { evaluate } from '$lib/compliance/engine';
import { generateCertificate } from './certificate';

export async function downloadCertificate(trialId: number): Promise<void> {
  const db = await getDb();
  const trial = getTrial(db, trialId);
  if (!trial) throw new Error('Trial not found');
  const project = getProject(db, trial.projectId);
  if (!project) throw new Error('Project not found');

  const components = listTrialComponents(db, trialId);
  const engineComponents = buildComponentInputs(db, trialId);
  const categories = listCategories(db);
  const targetCatNumber = trial.targetCategoryNumber ?? project.targetCategoryNumber ?? 4;
  const targetCategory = categories.find((c) => c.number === targetCatNumber) ?? categories[0];
  const result = evaluate({
    components: engineComponents,
    targetCategoryNumber: targetCatNumber,
    compoundDosagePct: trial.compoundDosagePct,
    activeCategories: categories
  });

  const amendmentId = getActiveAmendmentId(db);
  const amendment = amendmentId
    ? (db
        .prepare('SELECT version, is_starter as isStarter FROM ifra_amendments WHERE id = ?')
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

  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = `${project.name}-${trial.versionLabel}`.replace(/[^a-z0-9-_]+/gi, '_');
  a.download = `ifrag-cert-${slug}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
