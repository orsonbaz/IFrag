import type { DbAdapter } from './client.js';
import type {
  CategoryRow,
  ComponentInput,
  StandardLimit,
  StandardRef
} from '$lib/compliance/types';
import type {
  Evaluation,
  Material,
  MaterialAnnexContribution,
  Project,
  Settings,
  Trial
} from './schema.js';

// All queries take an explicit DbAdapter — caller is responsible for awaiting `getDb()`
// once and passing it through. This keeps these functions sync, which simplifies pages.

export function listProjects(db: DbAdapter): Project[] {
  return db
    .prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE')
    .all()
    .map(toProject);
}

export function getProject(db: DbAdapter, id: number): Project | undefined {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return r ? toProject(r) : undefined;
}

export function listTrials(db: DbAdapter, projectId: number): Trial[] {
  return db
    .prepare('SELECT * FROM trials WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId)
    .map(toTrial);
}

export function getTrial(db: DbAdapter, id: number): Trial | undefined {
  const r = db.prepare('SELECT * FROM trials WHERE id = ?').get(id);
  return r ? toTrial(r) : undefined;
}

export interface TrialComponentRow {
  id: number;
  trialId: number;
  materialId: number;
  partsPer1000: number;
  sortOrder: number;
  note: string | null;
  materialName: string;
  cas: string | null;
  isNatural: number;
  isAccord: number;
  sourceTrialId: number | null;
  dilutionPct: number;
  priceMinor: number | null;
  currency: string;
}

export function listTrialComponents(db: DbAdapter, trialId: number): TrialComponentRow[] {
  return db
    .prepare(
      `SELECT tc.id, tc.trial_id as trialId, tc.material_id as materialId,
              tc.parts_per_1000 as partsPer1000, tc.sort_order as sortOrder, tc.note,
              m.name as materialName, m.cas, m.is_natural as isNatural,
              m.is_accord as isAccord, m.source_trial_id as sourceTrialId,
              COALESCE(tc.dilution_pct, 100) as dilutionPct,
              m.price_minor as priceMinor, m.currency
       FROM trial_components tc
       JOIN materials m ON m.id = tc.material_id
       WHERE tc.trial_id = ?
       ORDER BY tc.sort_order ASC, tc.id ASC`
    )
    .all(trialId) as unknown as TrialComponentRow[];
}

export function listEvaluations(db: DbAdapter, trialId: number): Evaluation[] {
  return db
    .prepare(
      `SELECT id, trial_id as trialId, evaluated_at as evaluatedAt, stage,
              elapsed_minutes as elapsedMinutes, rating, notes
       FROM evaluations WHERE trial_id = ? ORDER BY evaluated_at DESC`
    )
    .all(trialId) as unknown as Evaluation[];
}

export function listMaterials(db: DbAdapter): Material[] {
  return db.prepare('SELECT * FROM materials ORDER BY name COLLATE NOCASE').all().map(toMaterial);
}

export function getMaterial(db: DbAdapter, id: number): Material | undefined {
  const r = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  return r ? toMaterial(r) : undefined;
}

export function getMaterialAnnex(db: DbAdapter, materialId: number): MaterialAnnexContribution[] {
  return db
    .prepare(
      `SELECT id, material_id as materialId, constituent_name as constituentName,
              constituent_cas as constituentCas, contribution_pct as contributionPct, notes
       FROM material_annex_contributions WHERE material_id = ?`
    )
    .all(materialId) as unknown as MaterialAnnexContribution[];
}

export function getActiveAmendmentId(db: DbAdapter): number | null {
  const r = db.prepare('SELECT id FROM ifra_amendments WHERE is_active = 1 LIMIT 1').get();
  return r ? Number(r.id) : null;
}

export function listCategories(db: DbAdapter): CategoryRow[] {
  return db
    .prepare(
      'SELECT number, code, label, sort_order as sortOrder FROM ifra_categories WHERE active = 1 ORDER BY sort_order'
    )
    .all() as unknown as CategoryRow[];
}

export function getSettings(db: DbAdapter): Settings {
  let row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!row) {
    db.prepare(
      `INSERT INTO settings (id, default_currency, default_category_number, default_unit_display, default_batch_g) VALUES (1, 'EUR', 4, 'pp1000', 30)`
    ).run();
    row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  }
  return toSettings(row!);
}

export interface StandardsByAmendment {
  byId: Map<number, StandardRef>;
  byCas: Map<string, StandardRef>;
  byName: Map<string, StandardRef>;
  list: StandardRef[];
}

export function loadStandardsByAmendment(
  db: DbAdapter,
  amendmentId: number
): StandardsByAmendment {
  const stdRows = db
    .prepare(
      `SELECT id, primary_cas as primaryCas, material_name as materialName,
              standard_type as type, reason
       FROM ifra_standards WHERE amendment_id = ?`
    )
    .all(amendmentId) as unknown as Array<{
    id: number;
    primaryCas: string | null;
    materialName: string;
    type: 'prohibition' | 'restriction' | 'specification';
    reason: string | null;
  }>;

  const limitRows = db
    .prepare(
      `SELECT cl.standard_id as standardId, cl.category_number as categoryNumber,
              cl.limit_pct as limitPct, cl.prohibited, cl.no_restriction as noRestriction,
              cl.spec_text as specText
       FROM ifra_category_limits cl
       JOIN ifra_standards s ON s.id = cl.standard_id
       WHERE s.amendment_id = ?`
    )
    .all(amendmentId) as unknown as Array<{
    standardId: number;
    categoryNumber: number;
    limitPct: number | null;
    prohibited: number;
    noRestriction: number;
    specText: string | null;
  }>;

  const casRows = db
    .prepare(
      `SELECT sc.standard_id as standardId, sc.cas FROM ifra_standard_cas sc
       JOIN ifra_standards s ON s.id = sc.standard_id WHERE s.amendment_id = ?`
    )
    .all(amendmentId) as unknown as Array<{ standardId: number; cas: string }>;

  const byId = new Map<number, StandardRef>();
  for (const s of stdRows) {
    byId.set(s.id, {
      id: s.id,
      name: s.materialName,
      type: s.type,
      reason: s.reason,
      primaryCas: s.primaryCas,
      limits: new Map<number, StandardLimit>()
    });
  }
  for (const l of limitRows) {
    const std = byId.get(l.standardId);
    if (!std) continue;
    std.limits.set(l.categoryNumber, {
      limitPct: l.limitPct,
      prohibited: !!l.prohibited,
      noRestriction: !!l.noRestriction,
      spec: l.specText
    });
  }

  const byCas = new Map<string, StandardRef>();
  for (const s of stdRows) {
    if (s.primaryCas) byCas.set(s.primaryCas, byId.get(s.id)!);
  }
  for (const r of casRows) byCas.set(r.cas, byId.get(r.standardId)!);

  const byName = new Map<string, StandardRef>();
  for (const s of stdRows) byName.set(s.materialName.toLowerCase(), byId.get(s.id)!);

  return { byId, byCas, byName, list: Array.from(byId.values()) };
}

export interface MaterialIfraInfo {
  directStandards: StandardRef[];
  annexContributions: Array<{ standard: StandardRef; contributionPct: number }>;
}

/**
 * Loads compliance info for every material so the trial UI can re-evaluate
 * reactively against in-memory edits without a DB round-trip.
 */
export function listMaterialIfraInfo(
  db: DbAdapter,
  amendmentId: number
): Map<number, MaterialIfraInfo> {
  const { byCas, byName } = loadStandardsByAmendment(db, amendmentId);
  const out = new Map<number, MaterialIfraInfo>();
  const materials = db
    .prepare('SELECT id, cas FROM materials')
    .all() as unknown as Array<{ id: number; cas: string | null }>;
  const allLinks = db
    .prepare('SELECT material_id as materialId, standard_id as standardId FROM material_ifra_links')
    .all() as unknown as Array<{ materialId: number; standardId: number }>;
  const linksByMaterial = new Map<number, number[]>();
  for (const l of allLinks) {
    const arr = linksByMaterial.get(l.materialId) ?? [];
    arr.push(l.standardId);
    linksByMaterial.set(l.materialId, arr);
  }
  const allAnnex = db
    .prepare(
      `SELECT material_id as materialId, constituent_name as constituentName,
              constituent_cas as constituentCas, contribution_pct as contributionPct
         FROM material_annex_contributions`
    )
    .all() as unknown as Array<{
    materialId: number;
    constituentName: string;
    constituentCas: string | null;
    contributionPct: number;
  }>;
  const annexByMaterial = new Map<number, typeof allAnnex>();
  for (const a of allAnnex) {
    const arr = annexByMaterial.get(a.materialId) ?? [];
    arr.push(a.materialId === undefined ? a : a);
    annexByMaterial.set(a.materialId, arr as typeof allAnnex);
  }
  const stdById = new Map<number, StandardRef>();
  for (const s of Array.from(byName.values())) stdById.set(s.id, s);
  for (const m of materials) {
    const directStandards: StandardRef[] = [];
    const linkIds = linksByMaterial.get(m.id) ?? [];
    for (const sid of linkIds) {
      const std = stdById.get(sid);
      if (std) directStandards.push(std);
    }
    if (directStandards.length === 0 && m.cas) {
      const std = byCas.get(m.cas);
      if (std) directStandards.push(std);
    }
    const annexContributions: MaterialIfraInfo['annexContributions'] = [];
    for (const a of annexByMaterial.get(m.id) ?? []) {
      const std =
        (a.constituentCas && byCas.get(a.constituentCas)) ||
        byName.get(a.constituentName.toLowerCase());
      if (std) annexContributions.push({ standard: std, contributionPct: a.contributionPct });
    }
    out.set(m.id, { directStandards, annexContributions });
  }
  return out;
}

/**
 * Builds engine-ready ComponentInputs for a trial. Accord materials are
 * recursively expanded into their constituent components.
 */
export function buildComponentInputs(db: DbAdapter, trialId: number): ComponentInput[] {
  const amendmentId = getActiveAmendmentId(db);
  if (!amendmentId) return [];
  const { byCas, byName } = loadStandardsByAmendment(db, amendmentId);

  function loadDirectStandards(materialId: number, cas: string | null): StandardRef[] {
    const links = db
      .prepare('SELECT standard_id as standardId FROM material_ifra_links WHERE material_id = ?')
      .all(materialId) as unknown as Array<{ standardId: number }>;
    const out: StandardRef[] = [];
    for (const l of links) {
      const std = Array.from(byName.values()).find((s) => s.id === l.standardId);
      if (std) out.push(std);
    }
    if (out.length === 0 && cas) {
      const std = byCas.get(cas);
      if (std) out.push(std);
    }
    return out;
  }

  function loadAnnex(materialId: number) {
    const rows = db
      .prepare(
        `SELECT constituent_name as constituentName, constituent_cas as constituentCas,
                contribution_pct as contributionPct
         FROM material_annex_contributions WHERE material_id = ?`
      )
      .all(materialId) as unknown as Array<{
      constituentName: string;
      constituentCas: string | null;
      contributionPct: number;
    }>;
    return rows
      .map((a) => {
        const std =
          (a.constituentCas && byCas.get(a.constituentCas)) ||
          byName.get(a.constituentName.toLowerCase());
        if (!std) return null;
        return { standard: std, contributionPct: a.contributionPct };
      })
      .filter((x): x is { standard: StandardRef; contributionPct: number } => !!x);
  }

  const out: ComponentInput[] = [];

  function expand(
    parentComponentId: number | string,
    materialId: number,
    materialName: string,
    cas: string | null,
    isNatural: boolean,
    isAccord: boolean,
    sourceTrialId: number | null,
    partsPer1000: number,
    dilutionPct: number,
    depth: number
  ) {
    if (depth > 6) return;
    if (isAccord && sourceTrialId) {
      const sub = db
        .prepare(
          `SELECT tc.id, tc.material_id as materialId, tc.parts_per_1000 as partsPer1000,
                  m.name as materialName, m.cas, m.is_natural as isNatural,
                  m.is_accord as isAccord, m.source_trial_id as sourceTrialId,
                  COALESCE(tc.dilution_pct, 100) as dilutionPct
           FROM trial_components tc
           JOIN materials m ON m.id = tc.material_id
           WHERE tc.trial_id = ?`
        )
        .all(sourceTrialId) as unknown as Array<{
        id: number;
        materialId: number;
        partsPer1000: number;
        materialName: string;
        cas: string | null;
        isNatural: number;
        isAccord: number;
        sourceTrialId: number | null;
        dilutionPct: number;
      }>;
      const subTotal = sub.reduce((s, x) => s + x.partsPer1000, 0) || 1;
      for (const sc of sub) {
        const share = (partsPer1000 * sc.partsPer1000) / subTotal;
        expand(
          `${parentComponentId}>${sc.id}`,
          sc.materialId,
          sc.materialName,
          sc.cas,
          !!sc.isNatural,
          !!sc.isAccord,
          sc.sourceTrialId,
          share,
          sc.dilutionPct,
          depth + 1
        );
      }
      return;
    }
    out.push({
      componentId: parentComponentId,
      materialId,
      materialName,
      cas,
      isNatural,
      partsPer1000,
      dilutionPct,
      directStandards: loadDirectStandards(materialId, cas),
      annexContributions: loadAnnex(materialId)
    });
  }

  for (const c of listTrialComponents(db, trialId)) {
    expand(
      c.id,
      c.materialId,
      c.materialName,
      c.cas,
      !!c.isNatural,
      !!c.isAccord,
      c.sourceTrialId,
      c.partsPer1000,
      c.dilutionPct,
      0
    );
  }
  return out;
}

// row → typed converters
function toProject(r: Record<string, unknown>): Project {
  return {
    id: Number(r.id),
    name: String(r.name),
    brief: r.brief as string | null,
    targetCategoryNumber: r.target_category_number as number | null,
    createdAt: String(r.created_at)
  };
}

function toTrial(r: Record<string, unknown>): Trial {
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    versionLabel: String(r.version_label),
    parentTrialId: r.parent_trial_id as number | null,
    targetCategoryNumber: r.target_category_number as number | null,
    compoundDosagePct: Number(r.compound_dosage_pct),
    notes: r.notes as string | null,
    archived: Number(r.archived),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  };
}

function toMaterial(r: Record<string, unknown>): Material {
  return {
    id: Number(r.id),
    name: String(r.name),
    cas: r.cas as string | null,
    supplier: r.supplier as string | null,
    priceMinor: r.price_minor as number | null,
    currency: String(r.currency),
    dilutionPct: Number(r.dilution_pct),
    densityGPerMl: r.density_g_per_ml as number | null,
    stockG: r.stock_g as number | null,
    isNatural: Number(r.is_natural),
    isAccord: Number(r.is_accord),
    sourceTrialId: r.source_trial_id as number | null,
    chemicalGroup: r.chemical_group as string | null,
    family: r.family as string | null,
    descriptor1: r.descriptor_1 as string | null,
    descriptor2: r.descriptor_2 as string | null,
    personalDescription: r.personal_description as string | null,
    volatility: r.volatility as string | null,
    dosageBand: r.dosage_band as string | null,
    usage: r.usage as string | null,
    notes: r.notes as string | null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? '')
  };
}

function toSettings(r: Record<string, unknown>): Settings {
  const raw = (r.visible_category_numbers as string | null) ?? '';
  const visible = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    id: Number(r.id),
    defaultCurrency: String(r.default_currency),
    defaultCategoryNumber: Number(r.default_category_number),
    defaultUnitDisplay: r.default_unit_display as 'pp1000' | 'pct' | 'grams',
    activeAmendmentId: r.active_amendment_id as number | null,
    defaultBatchG: Number(r.default_batch_g),
    visibleCategoryNumbers: visible.length > 0 ? visible : [Number(r.default_category_number)]
  };
}
