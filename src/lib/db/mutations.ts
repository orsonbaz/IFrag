import type { DbAdapter } from './client.js';

export function createProject(
  db: DbAdapter,
  args: { name: string; brief?: string | null; targetCategoryNumber?: number | null }
): number {
  const r = db
    .prepare(
      `INSERT INTO projects (name, brief, target_category_number) VALUES (?, ?, ?) RETURNING id`
    )
    .run(args.name, args.brief ?? null, args.targetCategoryNumber ?? 4);
  return r.lastInsertRowid;
}

export function updateProject(
  db: DbAdapter,
  id: number,
  args: { name: string; brief: string | null; targetCategoryNumber: number }
) {
  db.prepare(
    `UPDATE projects SET name = ?, brief = ?, target_category_number = ? WHERE id = ?`
  ).run(args.name, args.brief, args.targetCategoryNumber, id);
}

export function deleteProject(db: DbAdapter, id: number) {
  db.transaction(() => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
}

export function createTrial(
  db: DbAdapter,
  projectId: number,
  args: { versionLabel: string; targetCategoryNumber: number | null; compoundDosagePct: number }
): number {
  const r = db
    .prepare(
      `INSERT INTO trials (project_id, version_label, target_category_number, compound_dosage_pct)
       VALUES (?, ?, ?, ?) RETURNING id`
    )
    .run(projectId, args.versionLabel, args.targetCategoryNumber, args.compoundDosagePct);
  return r.lastInsertRowid;
}

export function forkTrial(db: DbAdapter, sourceTrialId: number): number {
  const source = db.prepare('SELECT * FROM trials WHERE id = ?').get(sourceTrialId) as
    | Record<string, unknown>
    | undefined;
  if (!source) throw new Error('Source trial not found');
  const newLabel = `${source.version_label}+`;
  let newId = 0;
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO trials (project_id, version_label, parent_trial_id, target_category_number, compound_dosage_pct, notes)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .run(
        source.project_id,
        newLabel,
        source.id,
        source.target_category_number,
        source.compound_dosage_pct,
        source.notes
      );
    newId = r.lastInsertRowid;
    db.prepare(
      `INSERT INTO trial_components (trial_id, material_id, parts_per_1000, sort_order, note, dilution_pct)
       SELECT ?, material_id, parts_per_1000, sort_order, note, dilution_pct FROM trial_components WHERE trial_id = ?`
    ).run(newId, sourceTrialId);
  });
  return newId;
}

export function deleteTrial(db: DbAdapter, id: number) {
  db.prepare('DELETE FROM trials WHERE id = ?').run(id);
}

export interface TrialUpsertPayload {
  versionLabel: string;
  compoundDosagePct: number;
  targetCategoryNumber: number;
  notes: string | null;
  components: Array<{
    id?: number;
    materialId: number;
    partsPer1000: number;
    sortOrder: number;
    note?: string | null;
    dilutionPct?: number | null;
  }>;
}

export function saveTrial(db: DbAdapter, trialId: number, payload: TrialUpsertPayload) {
  db.transaction(() => {
    db.prepare(
      `UPDATE trials SET version_label = ?, compound_dosage_pct = ?, target_category_number = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(
      payload.versionLabel,
      payload.compoundDosagePct,
      payload.targetCategoryNumber,
      payload.notes,
      trialId
    );
    db.prepare('DELETE FROM trial_components WHERE trial_id = ?').run(trialId);
    const ins = db.prepare(
      'INSERT INTO trial_components (trial_id, material_id, parts_per_1000, sort_order, note, dilution_pct) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const c of payload.components) {
      if (!c.materialId) continue;
      ins.run(
        trialId,
        c.materialId,
        c.partsPer1000,
        c.sortOrder ?? 0,
        c.note ?? null,
        c.dilutionPct ?? 100
      );
    }
  });
}

export function addEvaluation(
  db: DbAdapter,
  trialId: number,
  args: {
    stage: 'top' | 'heart' | 'base' | 'drydown' | 'overall';
    elapsedMinutes: number | null;
    rating: number | null;
    notes: string | null;
  }
) {
  db.prepare(
    'INSERT INTO evaluations (trial_id, stage, elapsed_minutes, rating, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(trialId, args.stage, args.elapsedMinutes, args.rating, args.notes);
}

export function deleteEvaluation(db: DbAdapter, id: number) {
  db.prepare('DELETE FROM evaluations WHERE id = ?').run(id);
}

export function promoteToAccord(
  db: DbAdapter,
  trialId: number,
  accordName: string
): { accordMaterialId: number; updated: boolean } {
  const existing = db
    .prepare('SELECT id FROM materials WHERE source_trial_id = ?')
    .get(trialId) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      'UPDATE materials SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(accordName, existing.id);
    return { accordMaterialId: existing.id, updated: true };
  }
  const r = db
    .prepare(
      `INSERT INTO materials (
        name, currency, dilution_pct, is_natural, is_accord, source_trial_id, notes
      ) VALUES (?, 'EUR', 100, 0, 1, ?, ?) RETURNING id`
    )
    .run(accordName, trialId, `Accord — derived from trial #${trialId}`);
  return { accordMaterialId: r.lastInsertRowid, updated: false };
}

export interface MaterialUpsert {
  name: string;
  cas: string | null;
  supplier: string | null;
  priceEurPerKg: number | null;
  dilutionPct: number;
  isNatural: boolean;
  stockG?: number | null;
  notes?: string | null;
}

export function createMaterial(db: DbAdapter, args: MaterialUpsert): number {
  const priceMinor =
    args.priceEurPerKg != null ? Math.round(args.priceEurPerKg * 100) : null;
  const r = db
    .prepare(
      `INSERT INTO materials (
        name, cas, supplier, price_minor, currency, dilution_pct, is_natural, notes, stock_g
      ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?) RETURNING id`
    )
    .run(
      args.name,
      args.cas,
      args.supplier,
      priceMinor,
      args.dilutionPct,
      args.isNatural ? 1 : 0,
      args.notes ?? null,
      args.stockG ?? null
    );
  return r.lastInsertRowid;
}

export function updateMaterial(db: DbAdapter, id: number, args: MaterialUpsert) {
  const priceMinor =
    args.priceEurPerKg != null ? Math.round(args.priceEurPerKg * 100) : null;
  db.prepare(
    `UPDATE materials SET name = ?, cas = ?, supplier = ?, price_minor = ?, dilution_pct = ?,
     is_natural = ?, stock_g = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(
    args.name,
    args.cas,
    args.supplier,
    priceMinor,
    args.dilutionPct,
    args.isNatural ? 1 : 0,
    args.stockG ?? null,
    args.notes ?? null,
    id
  );
}

export function deleteMaterial(db: DbAdapter, id: number) {
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
}

export function addAnnex(
  db: DbAdapter,
  materialId: number,
  args: { constituentName: string; constituentCas: string | null; contributionPct: number }
) {
  db.prepare(
    `INSERT INTO material_annex_contributions (material_id, constituent_name, constituent_cas, contribution_pct) VALUES (?, ?, ?, ?)`
  ).run(materialId, args.constituentName, args.constituentCas, args.contributionPct);
}

export function deleteAnnex(db: DbAdapter, id: number) {
  db.prepare('DELETE FROM material_annex_contributions WHERE id = ?').run(id);
}

export function setActiveAmendment(db: DbAdapter, amendmentId: number) {
  db.transaction(() => {
    db.prepare('UPDATE ifra_amendments SET is_active = 0').run();
    db.prepare('UPDATE ifra_amendments SET is_active = 1 WHERE id = ?').run(amendmentId);
    db.prepare('UPDATE settings SET active_amendment_id = ? WHERE id = 1').run(amendmentId);
  });
}

export function deleteAmendment(db: DbAdapter, id: number) {
  db.prepare('DELETE FROM ifra_amendments WHERE id = ?').run(id);
}

export function saveSettings(
  db: DbAdapter,
  args: {
    defaultCurrency: string;
    defaultCategoryNumber: number;
    defaultUnitDisplay: 'pp1000' | 'pct' | 'grams';
    defaultBatchG: number;
    visibleCategoryNumbers: number[];
  }
) {
  const visible = args.visibleCategoryNumbers.length
    ? args.visibleCategoryNumbers.join(',')
    : String(args.defaultCategoryNumber);
  db.prepare(
    `UPDATE settings SET default_currency = ?, default_category_number = ?, default_unit_display = ?, default_batch_g = ?, visible_category_numbers = ? WHERE id = 1`
  ).run(
    args.defaultCurrency,
    args.defaultCategoryNumber,
    args.defaultUnitDisplay,
    args.defaultBatchG,
    visible
  );
}
