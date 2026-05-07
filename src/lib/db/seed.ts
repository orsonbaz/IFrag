import type { DbAdapter } from './client.js';
import categoriesSeed from '../../../seed/ifra_categories.json';
import ifraStarter from '../../../seed/ifra_starter.json';
import materialsStarter from '../../../seed/materials_starter.json';

interface CategorySeed {
  number: number;
  code: string;
  label: string;
  description: string;
  sortOrder: number;
}

interface StandardSeed {
  primaryCas: string;
  name: string;
  synonyms?: string[];
  type: 'prohibition' | 'restriction' | 'specification';
  reason?: string;
  limits: Record<string, number | null>;
  prohibitedAll?: boolean;
}

interface AmendmentSeed {
  amendmentVersion: string;
  publishedOn: string;
  notes: string;
  standards: StandardSeed[];
}

interface MaterialSeed {
  name: string;
  isNatural: boolean;
  cas?: string | null;
  chemicalGroup?: string;
  family?: string;
  descriptor1?: string;
  descriptor2?: string;
  personalDescription?: string;
  dilutionPct: number;
  volatility?: string;
  dosageBand?: string;
  usage?: string;
  priceEurPerKg?: number;
  country?: string;
  extraction?: string;
  annexContributions?: Array<{
    constituentName: string;
    constituentCas?: string | null;
    contributionPct: number;
  }>;
}

export function isAlreadySeeded(db: DbAdapter): boolean {
  const r = db.prepare('SELECT count(*) as c FROM ifra_categories').get() as { c: number };
  return r.c > 0;
}

export function runSeed(db: DbAdapter, opts: { force?: boolean } = {}): { seededAmendmentId: number } {
  if (isAlreadySeeded(db) && !opts.force) {
    const active = db
      .prepare('SELECT id FROM ifra_amendments WHERE is_active = 1 LIMIT 1')
      .get() as { id: number } | undefined;
    return { seededAmendmentId: active?.id ?? -1 };
  }

  const categories = categoriesSeed as CategorySeed[];
  const amendment = ifraStarter as AmendmentSeed;
  const materials = materialsStarter as MaterialSeed[];

  db.transaction(() => {
    for (const cat of categories) {
      db.prepare(
        `INSERT OR REPLACE INTO ifra_categories (number, code, label, description, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)`
      ).run(cat.number, cat.code, cat.label, cat.description, cat.sortOrder);
    }

    let amendmentId: number;
    const existing = db
      .prepare('SELECT id FROM ifra_amendments WHERE version = ?')
      .get(amendment.amendmentVersion) as { id: number } | undefined;
    if (existing) {
      amendmentId = existing.id;
    } else {
      const r = db
        .prepare(
          `INSERT INTO ifra_amendments (version, published_on, notes, is_active, is_starter) VALUES (?, ?, ?, 1, 1)`
        )
        .run(amendment.amendmentVersion, amendment.publishedOn, amendment.notes);
      amendmentId = r.lastInsertRowid;
    }

    for (const std of amendment.standards) {
      const ins = db.prepare(
        `INSERT INTO ifra_standards (amendment_id, primary_cas, material_name, standard_type, reason, raw_row)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (amendment_id, primary_cas, material_name) DO UPDATE SET
           standard_type = excluded.standard_type,
           reason = excluded.reason,
           raw_row = excluded.raw_row
         RETURNING id`
      );
      const row = ins.get(
        amendmentId,
        std.primaryCas,
        std.name,
        std.type,
        std.reason ?? null,
        JSON.stringify(std)
      ) as { id: number };
      const stdId = row.id;

      db.prepare('DELETE FROM ifra_standard_cas WHERE standard_id = ?').run(stdId);
      const allCas = [std.primaryCas, ...(std.synonyms ?? []).filter((s) => /^[\d-]+$/.test(s))];
      for (const cas of allCas) {
        db.prepare('INSERT OR IGNORE INTO ifra_standard_cas (standard_id, cas) VALUES (?, ?)').run(
          stdId,
          cas
        );
      }

      db.prepare('DELETE FROM ifra_category_limits WHERE standard_id = ?').run(stdId);
      for (const cat of categories) {
        const k = String(cat.number);
        const v = std.limits[k];
        const prohibited =
          std.prohibitedAll === true ||
          (std.type === 'prohibition' && (v === null || v === undefined));
        const isSpec = std.type === 'specification';
        db.prepare(
          `INSERT INTO ifra_category_limits (standard_id, category_number, limit_pct, prohibited, no_restriction, spec_text) VALUES (?, ?, ?, ?, 0, ?)`
        ).run(
          stdId,
          cat.number,
          typeof v === 'number' ? v : null,
          prohibited ? 1 : 0,
          isSpec ? std.reason ?? null : null
        );
      }
    }

    for (const m of materials) {
      const priceMinor =
        typeof m.priceEurPerKg === 'number' ? Math.round(m.priceEurPerKg * 100) : null;
      const r = db
        .prepare(
          `INSERT INTO materials (
            name, cas, supplier, price_minor, currency, dilution_pct,
            is_natural, chemical_group, family, descriptor_1, descriptor_2,
            personal_description, volatility, dosage_band, usage, notes
          ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          m.name,
          m.cas ?? null,
          null,
          priceMinor,
          m.dilutionPct,
          m.isNatural ? 1 : 0,
          m.chemicalGroup ?? null,
          m.family ?? null,
          m.descriptor1 ?? null,
          m.descriptor2 ?? null,
          m.personalDescription ?? null,
          m.volatility ?? null,
          m.dosageBand ?? null,
          m.usage ?? null,
          [
            m.country ? `Origin: ${m.country}` : null,
            m.extraction ? `Extraction: ${m.extraction}` : null
          ]
            .filter(Boolean)
            .join(' • ') || null
        );
      const materialId = r.lastInsertRowid;

      if (m.cas) {
        const linkedStd = db
          .prepare(
            `SELECT s.id FROM ifra_standards s
             LEFT JOIN ifra_standard_cas c ON c.standard_id = s.id
             WHERE s.amendment_id = ? AND (s.primary_cas = ? OR c.cas = ?)
             LIMIT 1`
          )
          .get(amendmentId, m.cas, m.cas) as { id: number } | undefined;
        if (linkedStd) {
          db.prepare(
            `INSERT OR IGNORE INTO material_ifra_links (material_id, standard_id, link_source) VALUES (?, ?, 'cas_auto')`
          ).run(materialId, linkedStd.id);
        }
      }

      if (m.annexContributions) {
        for (const ann of m.annexContributions) {
          db.prepare(
            `INSERT INTO material_annex_contributions (material_id, constituent_name, constituent_cas, contribution_pct) VALUES (?, ?, ?, ?)`
          ).run(materialId, ann.constituentName, ann.constituentCas ?? null, ann.contributionPct);
        }
      }
    }

    const settingsExists = db.prepare('SELECT id FROM settings WHERE id = 1').get() as
      | { id: number }
      | undefined;
    if (!settingsExists) {
      db.prepare(
        `INSERT INTO settings (id, default_currency, default_category_number, default_unit_display, active_amendment_id, default_batch_g) VALUES (1, 'EUR', 4, 'pp1000', ?, 30)`
      ).run(amendmentId);
    } else {
      db.prepare(`UPDATE settings SET active_amendment_id = ? WHERE id = 1`).run(amendmentId);
    }
  });

  const active = db
    .prepare('SELECT id FROM ifra_amendments WHERE version = ?')
    .get(amendment.amendmentVersion) as { id: number };
  return { seededAmendmentId: active.id };
}
