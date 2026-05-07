import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { parseFileBuffer, type Row } from '$lib/importer/parse';
import { getSqlite } from '$lib/db/client';

const fields = [
  'material_name',
  'primary_cas',
  'standard_type',
  'reason',
  'limit_cat_1',
  'limit_cat_2',
  'limit_cat_3',
  'limit_cat_4',
  'limit_cat_5A',
  'limit_cat_5B',
  'limit_cat_5C',
  'limit_cat_5D',
  'limit_cat_6',
  'limit_cat_7A',
  'limit_cat_7B',
  'limit_cat_8',
  'limit_cat_9',
  'limit_cat_10A',
  'limit_cat_10B',
  'limit_cat_11A',
  'limit_cat_11B',
  'limit_cat_12'
];

const catCodeToNumber: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4,
  '5A': 51, '5B': 52, '5C': 53, '5D': 54,
  '6': 6, '7A': 71, '7B': 72,
  '8': 8, '9': 9,
  '10A': 101, '10B': 102,
  '11A': 111, '11B': 112,
  '12': 12
};

function autoMapIfra(headers: string[]): Record<string, string | null> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[._]/g, '');
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    out[f] = headers.find((h) => norm(h) === norm(f)) ?? null;
  }
  return out;
}

function parseLimitCell(v: unknown): { limitPct: number | null; prohibited: boolean; noRestriction: boolean } {
  if (v == null || v === '') return { limitPct: null, prohibited: false, noRestriction: false };
  const s = String(v).trim().toUpperCase();
  if (s === 'P' || s === 'PROHIBITED' || s === 'BANNED') return { limitPct: null, prohibited: true, noRestriction: false };
  if (s === 'NR' || s === 'NO RESTRICTION') return { limitPct: null, prohibited: false, noRestriction: true };
  const n = Number(s.replace('%', '').replace(',', '.'));
  if (isNaN(n)) return { limitPct: null, prohibited: false, noRestriction: false };
  return { limitPct: n, prohibited: false, noRestriction: false };
}

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
  upload: async ({ request }) => {
    const data = await request.formData();
    const file = data.get('file') as File | null;
    if (!file || file.size === 0) return fail(400, { error: 'No file' });
    const buf = await file.arrayBuffer();
    let parsed;
    try {
      parsed = parseFileBuffer(file.name, buf);
    } catch (err) {
      return fail(400, { error: 'Failed to parse: ' + (err as Error).message });
    }
    const sheetName = Object.keys(parsed.sheets)[0];
    const rows = parsed.sheets[sheetName] ?? [];
    const headers = rows.length > 0 ? Object.keys(rows[0] as object) : [];
    const mapping = autoMapIfra(headers);
    return {
      preview: {
        sheets: Object.keys(parsed.sheets),
        sheetName,
        headers,
        mapping,
        rowCount: rows.length,
        rows: rows.slice(0, 20),
        fullDataB64: Buffer.from(JSON.stringify(parsed.sheets)).toString('base64')
      }
    };
  },

  commit: async ({ request }) => {
    const data = await request.formData();
    const fullDataB64 = String(data.get('fullDataB64') ?? '');
    const mappingJson = String(data.get('mappingJson') ?? '{}');
    const sheetName = String(data.get('sheetName') ?? '');
    const amendmentVersion = String(data.get('amendmentVersion') ?? '').trim();
    const mergeMode = String(data.get('mergeMode') ?? 'upsert');
    if (!amendmentVersion) return fail(400, { error: 'Amendment version required' });
    if (!fullDataB64 || !sheetName) return fail(400, { error: 'Missing payload' });
    const allSheets: Record<string, Row[]> = JSON.parse(Buffer.from(fullDataB64, 'base64').toString('utf8'));
    const rows = allSheets[sheetName] ?? [];
    const mapping = JSON.parse(mappingJson) as Record<string, string | null>;

    const sqlite = getSqlite();
    let amendmentId: number;
    let added = 0,
      updated = 0,
      skipped = 0;

    sqlite.transaction(() => {
      const existing = sqlite
        .prepare(`SELECT id FROM ifra_amendments WHERE version = ?`)
        .get(amendmentVersion) as { id: number } | undefined;
      if (existing) {
        amendmentId = existing.id;
      } else {
        const result = sqlite
          .prepare(`INSERT INTO ifra_amendments (version, is_active, is_starter) VALUES (?, 0, 0)`)
          .run(amendmentVersion);
        amendmentId = Number(result.lastInsertRowid);
      }

      if (mergeMode === 'replace') {
        sqlite.prepare(`DELETE FROM ifra_standards WHERE amendment_id = ?`).run(amendmentId);
      }

      const insStd = sqlite.prepare(
        `INSERT INTO ifra_standards (amendment_id, primary_cas, material_name, standard_type, reason, raw_row)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (amendment_id, primary_cas, material_name) DO UPDATE SET
           standard_type = excluded.standard_type,
           reason = excluded.reason,
           raw_row = excluded.raw_row
         RETURNING id`
      );

      const get = (r: Row, key: string) => (mapping[key] ? r[mapping[key] as string] : null);

      for (const r of rows) {
        const name = String(get(r, 'material_name') ?? '').trim();
        if (!name) {
          skipped++;
          continue;
        }
        const cas = String(get(r, 'primary_cas') ?? '').trim() || null;
        const typeRaw = String(get(r, 'standard_type') ?? 'restriction').trim().toLowerCase();
        const type =
          typeRaw === 'prohibition' || typeRaw === 'specification' ? typeRaw : 'restriction';
        const reason = String(get(r, 'reason') ?? '').trim() || null;
        const before = sqlite
          .prepare(
            `SELECT id FROM ifra_standards WHERE amendment_id=? AND primary_cas IS ? AND material_name=?`
          )
          .get(amendmentId, cas, name) as { id: number } | undefined;
        const row = insStd.get(amendmentId, cas, name, type, reason, JSON.stringify(r)) as { id: number };
        if (before) updated++;
        else added++;
        if (cas) {
          sqlite
            .prepare(`INSERT OR IGNORE INTO ifra_standard_cas (standard_id, cas) VALUES (?, ?)`)
            .run(row.id, cas);
        }
        sqlite.prepare(`DELETE FROM ifra_category_limits WHERE standard_id = ?`).run(row.id);
        for (const [code, num] of Object.entries(catCodeToNumber)) {
          const cellKey = `limit_cat_${code}`;
          const v = get(r, cellKey);
          const parsed = parseLimitCell(v);
          if (parsed.limitPct == null && !parsed.prohibited && !parsed.noRestriction) continue;
          sqlite
            .prepare(
              `INSERT INTO ifra_category_limits (standard_id, category_number, limit_pct, prohibited, no_restriction) VALUES (?, ?, ?, ?, ?)`
            )
            .run(row.id, num, parsed.limitPct, parsed.prohibited ? 1 : 0, parsed.noRestriction ? 1 : 0);
        }
      }
    })();

    // Auto-link materials by CAS in this amendment.
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO material_ifra_links (material_id, standard_id, link_source)
         SELECT m.id, s.id, 'cas_auto'
         FROM materials m
         JOIN ifra_standards s ON s.amendment_id = ?
           AND (s.primary_cas = m.cas OR EXISTS (SELECT 1 FROM ifra_standard_cas c WHERE c.standard_id = s.id AND c.cas = m.cas))
         WHERE m.cas IS NOT NULL`
      )
      .run(amendmentId!);

    return { ok: true, added, updated, skipped, amendmentVersion };
  }
};
