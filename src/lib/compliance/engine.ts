import type {
  CategoryFailure,
  CategoryVerdict,
  ComplianceInput,
  ComplianceResult,
  ComponentInput,
  FailureContributor,
  Severity,
  StandardRef
} from './types.js';

/**
 * Pure compliance engine. Given the trial's components, target IFRA category,
 * and compound dosage in finished product, returns a per-category verdict
 * matrix (every active category, not just the target).
 */
export function evaluate(input: ComplianceInput): ComplianceResult {
  const { components, compoundDosagePct, activeCategories } = input;

  const componentsTotalPp1000 = components.reduce((s, c) => s + c.partsPer1000, 0);
  const warnings: string[] = [];
  if (Math.abs(componentsTotalPp1000 - 1000) > 0.001) {
    warnings.push(`Components total ${formatNum(componentsTotalPp1000)} parts (target 1000).`);
  }
  if (compoundDosagePct <= 0) {
    warnings.push('Compound dosage in product is 0% — actual concentrations are zero.');
  }
  for (const c of components) {
    if (c.dilutionPct < 100 && c.dilutionPct > 0) {
      const effective = (c.partsPer1000 * c.dilutionPct) / 100;
      warnings.push(
        `${c.materialName}: entered ${formatNum(c.partsPer1000)} parts of a ${c.dilutionPct}% dilution — effective active = ${formatNum(effective)} parts.`
      );
    }
  }

  // Map standardId -> { standard, contributors[] } collected once across all components+categories.
  // Each contributor knows its effective fraction-in-compound (already accounting for dilution).
  type Bucket = {
    standard: StandardRef;
    contributors: FailureContributor[];
  };
  const buckets = new Map<number, Bucket>();

  function addContributor(std: StandardRef, c: ComponentInput, via: 'direct' | 'annex', share: number) {
    const fractionOfCompound = (c.partsPer1000 / 1000) * (c.dilutionPct / 100); // 0..1
    const effectivePctInCompound = fractionOfCompound * share * 100;
    if (effectivePctInCompound <= 0) return;
    let b = buckets.get(std.id);
    if (!b) {
      b = { standard: std, contributors: [] };
      buckets.set(std.id, b);
    }
    b.contributors.push({
      componentId: c.componentId,
      materialId: c.materialId,
      materialName: c.materialName,
      via,
      effectivePctInCompound
    });
  }

  for (const c of components) {
    for (const s of c.directStandards) addContributor(s, c, 'direct', 1);
    for (const a of c.annexContributions) addContributor(a.standard, c, 'annex', a.contributionPct / 100);
  }

  // Materials that declare a CAS but didn't link to any standard in the active amendment.
  // This is a global concern, surfaced once at the top level — not per category.
  for (const c of components) {
    const hasNoLinks = c.directStandards.length === 0 && c.annexContributions.length === 0;
    if (hasNoLinks && c.cas) {
      warnings.push(`${c.materialName} (CAS ${c.cas}): no IFRA standard linked in active amendment.`);
    }
  }

  const perCategory = new Map<number, CategoryVerdict>();
  for (const cat of activeCategories) {
    const failures: CategoryFailure[] = [];
    const catWarnings: string[] = [];

    for (const { standard, contributors } of buckets.values()) {
      const totalEffectivePctInCompound = contributors.reduce((s, c) => s + c.effectivePctInCompound, 0);
      const actualInProductPct = totalEffectivePctInCompound * (compoundDosagePct / 100);

      const lim = standard.limits.get(cat.number);
      const prohibited = lim?.prohibited ?? false;
      const limitPct = lim?.limitPct ?? null;

      if (prohibited && totalEffectivePctInCompound > 0) {
        failures.push({
          standardId: standard.id,
          standardName: standard.name,
          severity: 'prohibited',
          contributors,
          limitPct: null,
          actualInProductPct,
          reason: standard.reason
        });
        continue;
      }
      if (standard.type === 'restriction' && limitPct !== null && actualInProductPct > limitPct) {
        failures.push({
          standardId: standard.id,
          standardName: standard.name,
          severity: 'over_limit',
          contributors,
          limitPct,
          actualInProductPct,
          reason: standard.reason
        });
        continue;
      }
      if (standard.type === 'specification' && totalEffectivePctInCompound > 0) {
        failures.push({
          standardId: standard.id,
          standardName: standard.name,
          severity: 'specification',
          contributors,
          limitPct: null,
          actualInProductPct,
          reason: standard.reason
        });
      }
    }

    const status = computeStatus(failures, catWarnings);
    perCategory.set(cat.number, {
      categoryNumber: cat.number,
      status,
      failures,
      warnings: catWarnings
    });
  }

  return { perCategory, componentsTotalPp1000, warnings };
}

function computeStatus(failures: CategoryFailure[], warnings: string[]): CategoryVerdict['status'] {
  if (failures.some((f) => f.severity === 'prohibited' || f.severity === 'over_limit')) return 'fail';
  if (failures.some((f) => f.severity === 'specification') || warnings.length > 0) return 'warn';
  return 'pass';
}

export function severityRank(s: Severity): number {
  switch (s) {
    case 'prohibited':
      return 4;
    case 'over_limit':
      return 3;
    case 'specification':
      return 2;
    case 'unknown':
      return 1;
  }
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
