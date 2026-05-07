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
              m.is_accord as isAccord, m.source_trial_id as sourceTrialId,
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
    isAccord: number;
    sourceTrialId: number | null;
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
 * Builds engine-ready ComponentInputs for a trial. Accord materials are
 * recursively expanded into their constituent components (scaled by share).
 */
export function buildComponentInputs(trialId: number): ComponentInput[] {
  const amendmentId = getActiveAmendmentId();
  if (!amendmentId) return [];
  const { byCas, byName } = loadStandardsByAmendment(amendmentId);
  const sqlite = getSqlite();

  function loadDirectStandards(materialId: number, cas: string | null): StandardRef[] {
    const links = sqlite
      .prepare(`SELECT standard_id as standardId FROM material_ifra_links WHERE material_id = ?`)
      .all(materialId) as Array<{ standardId: number }>;
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
    const rows = sqlite
      .prepare(
        `SELECT constituent_name as constituentName, constituent_cas as constituentCas,
                contribution_pct as contributionPct
         FROM material_annex_contributions WHERE material_id = ?`
      )
      .all(materialId) as Array<{
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
    if (depth > 6) return; // accord recursion guard
    if (isAccord && sourceTrialId) {
      const sub = sqlite
        .prepare(
          `SELECT tc.id, tc.material_id as materialId, tc.parts_per_1000 as partsPer1000,
                  m.name as materialName, m.cas, m.is_natural as isNatural,
                  m.is_accord as isAccord, m.source_trial_id as sourceTrialId,
                  m.dilution_pct as dilutionPct
           FROM trial_components tc
           JOIN materials m ON m.id = tc.material_id
           WHERE tc.trial_id = ?`
        )
        .all(sourceTrialId) as Array<{
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
      // The accord at `partsPer1000` in the parent represents `partsPer1000` parts of a
      // mixture whose internal proportions are the source trial. Each sub-component
      // contributes `partsPer1000 * (sub.partsPer1000 / subTotal)` parts to the parent.
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

  const top = listTrialComponents(trialId);
  for (const c of top) {
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

/**
 * Recursively compute the cost in minor currency units for a parent share of an accord.
 * Returns null if any component has no price.
 */
export function accordCostMinorPerGram(materialId: number, depth = 0): number | null {
  if (depth > 6) return null;
  const sqlite = getSqlite();
  const m = sqlite
    .prepare(
      `SELECT id, is_accord as isAccord, source_trial_id as sourceTrialId, price_minor as priceMinor FROM materials WHERE id = ?`
    )
    .get(materialId) as { id: number; isAccord: number; sourceTrialId: number | null; priceMinor: number | null } | undefined;
  if (!m) return null;
  if (!m.isAccord || !m.sourceTrialId) return m.priceMinor ?? null;
  const sub = sqlite
    .prepare(
      `SELECT tc.material_id as materialId, tc.parts_per_1000 as partsPer1000
       FROM trial_components tc WHERE tc.trial_id = ?`
    )
    .all(m.sourceTrialId) as Array<{ materialId: number; partsPer1000: number }>;
  const total = sub.reduce((s, x) => s + x.partsPer1000, 0);
  if (total === 0) return null;
  let cost = 0;
  let hasUnknown = false;
  for (const sc of sub) {
    const c = accordCostMinorPerGram(sc.materialId, depth + 1);
    if (c == null) {
      hasUnknown = true;
      continue;
    }
    cost += (sc.partsPer1000 / total) * c;
  }
  if (hasUnknown && cost === 0) return null;
  return Math.round(cost);
}
