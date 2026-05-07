// Plain TypeScript types matching the SQLite tables (see migrations/*.sql).
// We use raw SQL throughout — no ORM runtime.

export interface IfraAmendment {
  id: number;
  version: string;
  publishedOn: string | null;
  notes: string | null;
  isActive: number; // 0/1
  isStarter: number;
  createdAt: string;
}

export interface IfraCategory {
  number: number;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  active: number;
}

export interface IfraStandard {
  id: number;
  amendmentId: number;
  primaryCas: string | null;
  materialName: string;
  standardType: 'prohibition' | 'restriction' | 'specification';
  reason: string | null;
  sourceUrl: string | null;
  rawRow: string | null;
}

export interface IfraStandardCas {
  standardId: number;
  cas: string;
}

export interface IfraCategoryLimit {
  id: number;
  standardId: number;
  categoryNumber: number;
  limitPct: number | null;
  prohibited: number;
  noRestriction: number;
  specText: string | null;
}

export interface Material {
  id: number;
  name: string;
  cas: string | null;
  supplier: string | null;
  priceMinor: number | null;
  currency: string;
  dilutionPct: number;
  densityGPerMl: number | null;
  stockG: number | null;
  isNatural: number;
  isAccord: number;
  sourceTrialId: number | null;
  chemicalGroup: string | null;
  family: string | null;
  descriptor1: string | null;
  descriptor2: string | null;
  personalDescription: string | null;
  volatility: string | null;
  dosageBand: string | null;
  usage: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialIfraLink {
  materialId: number;
  standardId: number;
  linkSource: 'cas_auto' | 'manual';
}

export interface MaterialAnnexContribution {
  id: number;
  materialId: number;
  constituentName: string;
  constituentCas: string | null;
  contributionPct: number;
  notes: string | null;
}

export interface Project {
  id: number;
  name: string;
  brief: string | null;
  targetCategoryNumber: number | null;
  createdAt: string;
}

export interface Trial {
  id: number;
  projectId: number;
  versionLabel: string;
  parentTrialId: number | null;
  targetCategoryNumber: number | null;
  compoundDosagePct: number;
  notes: string | null;
  archived: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrialComponent {
  id: number;
  trialId: number;
  materialId: number;
  partsPer1000: number;
  sortOrder: number;
  note: string | null;
}

export interface Evaluation {
  id: number;
  trialId: number;
  evaluatedAt: string;
  stage: 'top' | 'heart' | 'base' | 'drydown' | 'overall';
  elapsedMinutes: number | null;
  rating: number | null;
  notes: string | null;
}

export interface Settings {
  id: number;
  defaultCurrency: string;
  defaultCategoryNumber: number;
  defaultUnitDisplay: 'pp1000' | 'pct' | 'grams';
  activeAmendmentId: number | null;
  defaultBatchG: number;
}

export type NewMaterial = Omit<Material, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Material, 'id' | 'createdAt' | 'updatedAt'>>;
