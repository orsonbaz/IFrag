export type StandardType = 'prohibition' | 'restriction' | 'specification';

export interface CategoryRow {
  number: number;
  code: string;
  label: string;
  sortOrder: number;
}

export interface StandardLimit {
  limitPct: number | null;
  prohibited: boolean;
  noRestriction: boolean;
  spec: string | null;
}

export interface StandardRef {
  id: number;
  name: string;
  type: StandardType;
  reason: string | null;
  primaryCas: string | null;
  limits: Map<number, StandardLimit>;
}

export interface ComponentInput {
  componentId: number | string;
  materialId: number;
  materialName: string;
  cas: string | null;
  isNatural: boolean;
  partsPer1000: number;
  dilutionPct: number;
  directStandards: StandardRef[];
  annexContributions: Array<{ standard: StandardRef; contributionPct: number }>;
}

export interface ComplianceInput {
  components: ComponentInput[];
  targetCategoryNumber: number;
  compoundDosagePct: number;
  activeCategories: CategoryRow[];
}

export type Severity = 'prohibited' | 'over_limit' | 'specification' | 'unknown';

export interface FailureContributor {
  componentId: number | string;
  materialId: number;
  materialName: string;
  via: 'direct' | 'annex';
  effectivePctInCompound: number;
}

export interface CategoryFailure {
  standardId: number;
  standardName: string;
  severity: Severity;
  contributors: FailureContributor[];
  limitPct: number | null;
  actualInProductPct: number;
  reason: string | null;
}

export interface CategoryVerdict {
  categoryNumber: number;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  failures: CategoryFailure[];
  warnings: string[];
}

export interface ComplianceResult {
  perCategory: Map<number, CategoryVerdict>;
  componentsTotalPp1000: number;
  warnings: string[];
}
