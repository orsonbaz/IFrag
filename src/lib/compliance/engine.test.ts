import { describe, expect, it } from 'vitest';
import { evaluate } from './engine.js';
import type { CategoryRow, ComponentInput, StandardRef, StandardLimit } from './types.js';

const CAT_4: CategoryRow = { number: 4, code: '4', label: 'Fine fragrance', sortOrder: 4 };
const CAT_1: CategoryRow = { number: 1, code: '1', label: 'Lip products', sortOrder: 1 };
const CATS = [CAT_1, CAT_4];

function limit(opts: Partial<StandardLimit> = {}): StandardLimit {
  return {
    limitPct: opts.limitPct ?? null,
    prohibited: opts.prohibited ?? false,
    noRestriction: opts.noRestriction ?? false,
    spec: opts.spec ?? null
  };
}

function restriction(name: string, id: number, limitsByCat: Record<number, number>): StandardRef {
  const limits = new Map<number, StandardLimit>();
  for (const c of CATS) {
    const lp = limitsByCat[c.number];
    limits.set(c.number, limit({ limitPct: lp ?? null }));
  }
  return { id, name, type: 'restriction', reason: 'test', primaryCas: null, limits };
}

function prohibition(name: string, id: number): StandardRef {
  const limits = new Map<number, StandardLimit>();
  for (const c of CATS) limits.set(c.number, limit({ prohibited: true }));
  return { id, name, type: 'prohibition', reason: 'test', primaryCas: null, limits };
}

function spec(name: string, id: number): StandardRef {
  const limits = new Map<number, StandardLimit>();
  for (const c of CATS) limits.set(c.number, limit({ spec: 'must meet purity criteria' }));
  return { id, name, type: 'specification', reason: 'spec', primaryCas: null, limits };
}

function comp(p: Partial<ComponentInput>): ComponentInput {
  return {
    componentId: p.componentId ?? Math.random(),
    materialId: p.materialId ?? 1,
    materialName: p.materialName ?? 'Material',
    cas: p.cas ?? null,
    isNatural: p.isNatural ?? false,
    partsPer1000: p.partsPer1000 ?? 0,
    dilutionPct: p.dilutionPct ?? 100,
    directStandards: p.directStandards ?? [],
    annexContributions: p.annexContributions ?? []
  };
}

describe('compliance engine', () => {
  it('passes with no restricted standards touched', () => {
    const result = evaluate({
      components: [comp({ partsPer1000: 1000, materialName: 'Hedione' })],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(result.perCategory.get(4)!.status).toBe('pass');
    expect(result.warnings.length).toBe(0);
  });

  it('warns when components total != 1000', () => {
    const r = evaluate({
      components: [comp({ partsPer1000: 800 })],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.warnings.some((w) => w.includes('800'))).toBe(true);
  });

  it('flags prohibited material as fail across categories', () => {
    const std = prohibition('Atranol', 1);
    const r = evaluate({
      components: [comp({ partsPer1000: 1, materialName: 'Oakmoss', directStandards: [std] })],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    const v = r.perCategory.get(4)!;
    expect(v.status).toBe('fail');
    expect(v.failures[0].severity).toBe('prohibited');
  });

  it('passes restriction at threshold', () => {
    // Limit Cat 4 = 1.0%. Compound dosage = 20%. To reach exactly 1.0% in product:
    // effectiveInCompound = 5%, so component at 50 pp1000 of pure material.
    const std = restriction('Citral', 1, { 4: 1.0, 1: 0.05 });
    const r = evaluate({
      components: [
        comp({ partsPer1000: 50, materialName: 'Citral', directStandards: [std] }),
        comp({ partsPer1000: 950, materialName: 'Filler' })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.perCategory.get(4)!.status).toBe('pass');
  });

  it('fails restriction when over limit', () => {
    const std = restriction('Citral', 1, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({ partsPer1000: 100, materialName: 'Citral', directStandards: [std] }),
        comp({ partsPer1000: 900, materialName: 'Filler' })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    const v = r.perCategory.get(4)!;
    expect(v.status).toBe('fail');
    expect(v.failures[0].severity).toBe('over_limit');
    expect(v.failures[0].actualInProductPct).toBeCloseTo(2.0, 5);
  });

  it('warns on specification standards', () => {
    const std = spec('Benzaldehyde', 1);
    const r = evaluate({
      components: [comp({ partsPer1000: 50, directStandards: [std] }), comp({ partsPer1000: 950 })],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.perCategory.get(4)!.status).toBe('warn');
  });

  it('sums annex contributions from naturals', () => {
    // Limonene limit Cat 4 = 4%. Compound dosage = 20%. Lemongrass is 75% Citral
    // (we use Citral for the test). 100 pp1000 of Lemongrass → 7.5% Citral in compound → 1.5% in product.
    const std = restriction('Citral', 99, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({
          partsPer1000: 100,
          materialName: 'Lemongrass EO',
          isNatural: true,
          annexContributions: [{ standard: std, contributionPct: 75 }]
        }),
        comp({ partsPer1000: 900 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    const v = r.perCategory.get(4)!;
    expect(v.status).toBe('fail');
    expect(v.failures[0].actualInProductPct).toBeCloseTo(1.5, 5);
  });

  it('combines direct + annex contributions of the same standard across components', () => {
    const std = restriction('Citral', 99, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({
          partsPer1000: 50,
          materialName: 'Lemongrass',
          isNatural: true,
          annexContributions: [{ standard: std, contributionPct: 75 }]
        }),
        comp({
          partsPer1000: 30,
          materialName: 'Citral',
          directStandards: [std]
        }),
        comp({ partsPer1000: 920 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    const v = r.perCategory.get(4)!;
    // Effective in compound: lemongrass 5% × 75% = 3.75% + citral 3% = 6.75%
    // In product at 20%: 1.35% > 1.0% → fail
    expect(v.status).toBe('fail');
    expect(v.failures[0].contributors.length).toBe(2);
    expect(v.failures[0].actualInProductPct).toBeCloseTo(1.35, 5);
  });

  it('respects dilution: 10% dilution halves the effective active', () => {
    const std = restriction('Citral', 99, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({
          partsPer1000: 100,
          materialName: 'Citral 10%',
          dilutionPct: 10,
          directStandards: [std]
        }),
        comp({ partsPer1000: 900 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    const v = r.perCategory.get(4)!;
    expect(v.status).toBe('pass');
    expect(r.warnings.some((w) => w.includes('dilution'))).toBe(true);
  });

  it('compound dosage zero produces warning', () => {
    const r = evaluate({
      components: [comp({ partsPer1000: 1000 })],
      targetCategoryNumber: 4,
      compoundDosagePct: 0,
      activeCategories: CATS
    });
    expect(r.warnings.some((w) => w.toLowerCase().includes('dosage'))).toBe(true);
  });

  it('failure shape includes contributors with via=direct or via=annex', () => {
    const std = restriction('Citral', 99, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({
          partsPer1000: 50,
          materialName: 'Lemongrass',
          annexContributions: [{ standard: std, contributionPct: 75 }]
        }),
        comp({ partsPer1000: 30, materialName: 'Citral', directStandards: [std] }),
        comp({ partsPer1000: 920 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 30,
      activeCategories: CATS
    });
    const failure = r.perCategory.get(4)!.failures[0];
    const vias = new Set(failure.contributors.map((c) => c.via));
    expect(vias.has('direct')).toBe(true);
    expect(vias.has('annex')).toBe(true);
  });

  it('different categories see different limits (Cat 1 stricter)', () => {
    const std = restriction('Citral', 99, { 1: 0.05, 4: 1.0 });
    const r = evaluate({
      components: [
        comp({ partsPer1000: 30, materialName: 'Citral', directStandards: [std] }),
        comp({ partsPer1000: 970 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.perCategory.get(4)!.status).toBe('pass'); // 30 pp = 3% compound × 20% = 0.6% < 1.0
    expect(r.perCategory.get(1)!.status).toBe('fail'); // 0.6% > 0.05
  });

  it('aggregates multiple distinct standards per category', () => {
    const cit = restriction('Citral', 1, { 4: 1.0 });
    const eug = restriction('Eugenol', 2, { 4: 0.5 });
    const r = evaluate({
      components: [
        comp({ partsPer1000: 30, directStandards: [cit] }),
        comp({ partsPer1000: 30, directStandards: [eug] }),
        comp({ partsPer1000: 940 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 50,
      activeCategories: CATS
    });
    // Each: 3% compound × 50% = 1.5% in product. Citral 1.5 > 1.0 fail. Eugenol 1.5 > 0.5 fail.
    const v = r.perCategory.get(4)!;
    expect(v.status).toBe('fail');
    expect(v.failures.length).toBe(2);
  });

  it('handles empty components', () => {
    const r = evaluate({
      components: [],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.perCategory.get(4)!.status).toBe('pass');
  });

  it('does not flag a component with annex contribution of 0%', () => {
    const std = restriction('Citral', 99, { 4: 1.0 });
    const r = evaluate({
      components: [
        comp({
          partsPer1000: 100,
          materialName: 'Synthetic with traces',
          annexContributions: [{ standard: std, contributionPct: 0 }]
        }),
        comp({ partsPer1000: 900 })
      ],
      targetCategoryNumber: 4,
      compoundDosagePct: 20,
      activeCategories: CATS
    });
    expect(r.perCategory.get(4)!.status).toBe('pass');
  });
});
