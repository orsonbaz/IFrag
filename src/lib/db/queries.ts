import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, getSqlite } from './client.js';
import * as schema from './schema.js';
import type { CategoryRow, StandardRef, StandardLimit, ComponentInput } from '$lib/compliance/types';

export function listProjects() {
  const db = getDb();
  return db.select().from(schema.projects).orderBy(asc(schema.projects.name)).all();
}

export function getProject(id: number) {
  const db = getDb();
  return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
}

export function listTrials(projectId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.trials)
    .where(eq(schema.trials.projectId, projectId))
    .orderBy(asc(schema.trials.createdAt))
    .all();
}

export function getTrial(id: number) {
  const db = getDb();
  return db.select().from(schema.trials).where(eq(schema.trials.id, id)).get();
}

export function listTrialComponents(trialId: number) {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT tc.id, tc.trial_id as trialId, tc.material_id as materialId,
              tc.parts_per_1000 as partsPer1000, tc.sort_order as sortOrder, tc.note,
              m.name as materialName, m.cas, m.is_natural as isNatural,
              m.dilution_pct as dilutionPct, m.price_minor as priceMinor, m.currency
       FROM trial_components tc
       JOIN materials m ON m.id = tc.material_id
       WHERE tc.trial_id = ?
       ORDER BY tc.sort_order ASC, tc.id ASC`
    )
    .all(trialId) as Array<{
    id: number;
    trialId: number;
    materialId: number;
    partsPer1000: number;
    sortOrder: number;
    note: string | null;
    materialName: string;
    cas: string | null;
    isNatural: number;
    dilutionPct: number;
    priceMinor: number | null;
    currency: string;
  }>;
}

export function listEvaluations(trialId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.evaluations)
    .where(eq(schema.evaluations.trialId, trialId))
    .orderBy(sql`evaluated_at DESC`)
    .all();
}

export function listMaterials() {
  const db = getDb();
  return db.select().from(schema.materials).orderBy(asc(schema.materials.name)).all();
}

export function getMaterial(id: number) {
  const db = getDb();
  return db.select().from(schema.materials).where(eq(schema.materials.id, id)).get();
}

export function getMaterialAnnex(materialId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.materialAnnexContributions)
    .where(eq(schema.materialAnnexContributions.materialId, materialId))
    .all();
}

export function getActiveAmendmentId(): number | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(`SELECT id FROM ifra_amendments WHERE is_active = 1 LIMIT 1`)
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function listCategories(): CategoryRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT number, code, label, sort_order as sortOrder
       FROM ifra_categories WHERE active = 1 ORDER BY sort_order`
    )
    .all() as CategoryRow[];
}

export function getSettings() {
  const db = getDb();
  let row = db.select().from(schema.settings).where(eq(schema.settings.id, 1)).get();
  if (!row) {
    db.insert(schema.settings).values({ id: 1 }).run();
    row = db.select().from(schema.settings).where(eq(schema.settings.id, 1)).get();
  }
  return row!;
}

/**
 * Loads all standards for an amendment, indexed by both id and primary CAS.
 */
export function loadStandardsByAmendment(amendmentId: number): {
  byId: Map<number, StandardRef>;
  byCas: Map<string, StandardRef>;
  byName: Map<string, StandardRef>;
  list: StandardRef[];
} {
  const sqlite = getSqlite();
  const stdRows = sqlite
    .prepare(
      `SELECT id, primary_cas as primaryCas, material_name as materialName,
              standard_type as type, reason
       FROM ifra_standards WHERE amendment_id = ?`
    )
    .all(amendmentId) as Array<{
    id: number;
    primaryCas: string | null;
    materialName: string;
    type: 'prohibition' | 'restriction' | 'specification';
    reason: string | null;
  }>;

  const limitRows = sqlite
    .prepare(
      `SELECT cl.standard_id as standardId, cl.category_number as categoryNumber,
              cl.limit_pct as limitPct, cl.prohibited, cl.no_restriction as noRestriction,
              cl.spec_text as specText
       FROM ifra_category_limits cl
       JOIN ifra_standards s ON s.id = cl.standard_id
       WHERE s.amendment_id = ?`
    )
    .all(amendmentId) as Array<{
    standardId: number;
    categoryNumber: number;
    limitPct: number | null;
    prohibited: number;
    noRestriction: number;
    specText: string | null;
  }>;

  const casRows = sqlite
    .prepare(
      `SELECT sc.standard_id as standardId, sc.cas
       FROM ifra_standard_cas sc
       JOIN ifra_standards s ON s.id = sc.standard_id
       WHERE s.amendment_id = ?`
    )
    .all(amendmentId) as Array<{ standardId: number; cas: string }>;

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
  for (const r of casRows) {
    byCas.set(r.cas, byId.get(r.standardId)!);
  }

  const byName = new Map<string, StandardRef>();
  for (const s of stdRows) byName.set(s.materialName.toLowerCase(), byId.get(s.id)!);

  return { byId, byCas, byName, list: Array.from(byId.values()) };
}

/**
 * Builds engine-ready ComponentInputs for a trial.
 */
export function buildComponentInputs(trialId: number): ComponentInput[] {
  const components = listTrialComponents(trialId);
  const amendmentId = getActiveAmendmentId();
  if (!amendmentId) return [];

  const { byCas, byName } = loadStandardsByAmendment(amendmentId);
  const sqlite = getSqlite();

  return components.map((c) => {
    const directStandards: StandardRef[] = [];
    const links = sqlite
      .prepare(
        `SELECT standard_id as standardId FROM material_ifra_links
         WHERE material_id = ?`
      )
      .all(c.materialId) as Array<{ standardId: number }>;
    for (const l of links) {
      const std = Array.from(byName.values()).find((s) => s.id === l.standardId);
      if (std) directStandards.push(std);
    }
    if (directStandards.length === 0 && c.cas) {
      const std = byCas.get(c.cas);
      if (std) directStandards.push(std);
    }

    const annexRows = sqlite
      .prepare(
        `SELECT constituent_name as constituentName, constituent_cas as constituentCas,
                contribution_pct as contributionPct
         FROM material_annex_contributions WHERE material_id = ?`
      )
      .all(c.materialId) as Array<{
      constituentName: string;
      constituentCas: string | null;
      contributionPct: number;
    }>;
    const annexContributions = annexRows
      .map((a) => {
        const std =
          (a.constituentCas && byCas.get(a.constituentCas)) ||
          byName.get(a.constituentName.toLowerCase());
        if (!std) return null;
        return { standard: std, contributionPct: a.contributionPct };
      })
      .filter((x): x is { standard: StandardRef; contributionPct: number } => !!x);

    return {
      componentId: c.id,
      materialId: c.materialId,
      materialName: c.materialName,
      cas: c.cas,
      isNatural: !!c.isNatural,
      partsPer1000: c.partsPer1000,
      dilutionPct: c.dilutionPct,
      directStandards,
      annexContributions
    };
  });
}
