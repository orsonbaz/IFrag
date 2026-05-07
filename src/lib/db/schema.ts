import { sqliteTable, integer, text, real, primaryKey, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const ifraAmendments = sqliteTable('ifra_amendments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  version: text('version').notNull().unique(),
  publishedOn: text('published_on'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  isStarter: integer('is_starter', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const ifraCategories = sqliteTable('ifra_categories', {
  number: integer('number').primaryKey(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true)
});

export const ifraStandards = sqliteTable(
  'ifra_standards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    amendmentId: integer('amendment_id')
      .notNull()
      .references(() => ifraAmendments.id, { onDelete: 'cascade' }),
    primaryCas: text('primary_cas'),
    materialName: text('material_name').notNull(),
    standardType: text('standard_type', {
      enum: ['prohibition', 'restriction', 'specification']
    }).notNull(),
    reason: text('reason'),
    sourceUrl: text('source_url'),
    rawRow: text('raw_row')
  },
  (t) => ({
    casIdx: index('ifra_standards_cas_idx').on(t.primaryCas),
    nameIdx: index('ifra_standards_name_idx').on(t.materialName),
    uniqEntry: unique('ifra_standards_uniq').on(t.amendmentId, t.primaryCas, t.materialName)
  })
);

export const ifraStandardCas = sqliteTable(
  'ifra_standard_cas',
  {
    standardId: integer('standard_id')
      .notNull()
      .references(() => ifraStandards.id, { onDelete: 'cascade' }),
    cas: text('cas').notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.standardId, t.cas] }),
    casIdx: index('ifra_standard_cas_lookup').on(t.cas)
  })
);

export const ifraCategoryLimits = sqliteTable(
  'ifra_category_limits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    standardId: integer('standard_id')
      .notNull()
      .references(() => ifraStandards.id, { onDelete: 'cascade' }),
    categoryNumber: integer('category_number')
      .notNull()
      .references(() => ifraCategories.number),
    limitPct: real('limit_pct'),
    prohibited: integer('prohibited', { mode: 'boolean' }).notNull().default(false),
    noRestriction: integer('no_restriction', { mode: 'boolean' }).notNull().default(false),
    specText: text('spec_text')
  },
  (t) => ({
    uniq: unique('ifra_category_limits_uniq').on(t.standardId, t.categoryNumber)
  })
);

export const materials = sqliteTable(
  'materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    cas: text('cas'),
    supplier: text('supplier'),
    priceMinor: integer('price_minor'),
    currency: text('currency').notNull().default('EUR'),
    dilutionPct: real('dilution_pct').notNull().default(100),
    densityGPerMl: real('density_g_per_ml'),
    stockG: real('stock_g'),
    isNatural: integer('is_natural', { mode: 'boolean' }).notNull().default(false),
    chemicalGroup: text('chemical_group'),
    family: text('family'),
    descriptor1: text('descriptor_1'),
    descriptor2: text('descriptor_2'),
    personalDescription: text('personal_description'),
    volatility: text('volatility'),
    dosageBand: text('dosage_band'),
    usage: text('usage'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    casIdx: index('materials_cas_idx').on(t.cas),
    nameIdx: index('materials_name_idx').on(t.name)
  })
);

export const materialIfraLinks = sqliteTable(
  'material_ifra_links',
  {
    materialId: integer('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    standardId: integer('standard_id')
      .notNull()
      .references(() => ifraStandards.id, { onDelete: 'cascade' }),
    linkSource: text('link_source', { enum: ['cas_auto', 'manual'] }).notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.materialId, t.standardId] })
  })
);

export const materialAnnexContributions = sqliteTable('material_annex_contributions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  materialId: integer('material_id')
    .notNull()
    .references(() => materials.id, { onDelete: 'cascade' }),
  constituentName: text('constituent_name').notNull(),
  constituentCas: text('constituent_cas'),
  contributionPct: real('contribution_pct').notNull(),
  notes: text('notes')
});

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  brief: text('brief'),
  targetCategoryNumber: integer('target_category_number')
    .references(() => ifraCategories.number),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const trials = sqliteTable('trials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  versionLabel: text('version_label').notNull(),
  parentTrialId: integer('parent_trial_id'),
  targetCategoryNumber: integer('target_category_number')
    .references(() => ifraCategories.number),
  compoundDosagePct: real('compound_dosage_pct').notNull().default(20),
  notes: text('notes'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const trialComponents = sqliteTable('trial_components', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trialId: integer('trial_id')
    .notNull()
    .references(() => trials.id, { onDelete: 'cascade' }),
  materialId: integer('material_id')
    .notNull()
    .references(() => materials.id),
  partsPer1000: real('parts_per_1000').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  note: text('note')
});

export const evaluations = sqliteTable('evaluations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trialId: integer('trial_id')
    .notNull()
    .references(() => trials.id, { onDelete: 'cascade' }),
  evaluatedAt: text('evaluated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  stage: text('stage', { enum: ['top', 'heart', 'base', 'drydown', 'overall'] }).notNull(),
  elapsedMinutes: integer('elapsed_minutes'),
  rating: integer('rating'),
  notes: text('notes')
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  defaultCurrency: text('default_currency').notNull().default('EUR'),
  defaultCategoryNumber: integer('default_category_number').notNull().default(4),
  defaultUnitDisplay: text('default_unit_display', { enum: ['pp1000', 'pct', 'grams'] })
    .notNull()
    .default('pp1000'),
  activeAmendmentId: integer('active_amendment_id').references(() => ifraAmendments.id),
  defaultBatchG: real('default_batch_g').notNull().default(30)
});

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
export type IfraStandard = typeof ifraStandards.$inferSelect;
export type IfraCategoryLimit = typeof ifraCategoryLimits.$inferSelect;
export type IfraCategory = typeof ifraCategories.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Trial = typeof trials.$inferSelect;
export type TrialComponent = typeof trialComponents.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type MaterialAnnexContribution = typeof materialAnnexContributions.$inferSelect;
