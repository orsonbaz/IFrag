import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { parseFileBuffer, autoMap, parseDilutionPct, parsePriceEurPerKg, type Row } from '$lib/importer/parse';
import { getSqlite } from '$lib/db/client';

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
      return fail(400, { error: 'Failed to parse file: ' + (err as Error).message });
    }
    const sheetName = Object.keys(parsed.sheets)[0];
    const rows = parsed.sheets[sheetName] ?? [];
    const headers = rows.length > 0 ? Object.keys(rows[0] as object) : [];
    const mapping = autoMap(headers);
    return {
      preview: {
        sheets: Object.keys(parsed.sheets),
        sheetName,
        headers,
        rows: rows.slice(0, 50),
        rowCount: rows.length,
        mapping,
        // Stash full data round-trip via base64 so the second step can commit it.
        fullDataB64: Buffer.from(JSON.stringify(parsed.sheets)).toString('base64')
      }
    };
  },

  commit: async ({ request }) => {
    const data = await request.formData();
    const fullDataB64 = String(data.get('fullDataB64') ?? '');
    const mappingJson = String(data.get('mappingJson') ?? '{}');
    const sheetName = String(data.get('sheetName') ?? '');
    const isNaturalDefault = data.get('isNaturalDefault') === 'on';
    if (!fullDataB64 || !sheetName) return fail(400, { error: 'Missing payload' });
    let allSheets: Record<string, Row[]>;
    try {
      allSheets = JSON.parse(Buffer.from(fullDataB64, 'base64').toString('utf8'));
    } catch {
      return fail(400, { error: 'Bad payload' });
    }
    const mapping = JSON.parse(mappingJson) as Record<string, string | null>;
    const rows = allSheets[sheetName] ?? [];
    const sqlite = getSqlite();
    let added = 0,
      skipped = 0;
    sqlite.transaction(() => {
      const ins = sqlite.prepare(
        `INSERT INTO materials (
          name, cas, supplier, price_minor, currency, dilution_pct,
          is_natural, chemical_group, family, descriptor_1, descriptor_2,
          personal_description, volatility, dosage_band, usage, notes
        ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const exists = sqlite.prepare(`SELECT id FROM materials WHERE lower(name) = lower(?)`);
      for (const r of rows) {
        const get = (key: string) => (mapping[key] ? r[mapping[key] as string] : null);
        const name = String(get('name') ?? '').trim();
        if (!name) {
          skipped++;
          continue;
        }
        if (exists.get(name)) {
          skipped++;
          continue;
        }
        const priceEur = parsePriceEurPerKg(get('priceEurPerKg'));
        const priceMinor = priceEur != null ? Math.round((priceEur / 1000) * 100) : null;
        const dilution = parseDilutionPct(get('dilutionPct'));
        const cas = String(get('cas') ?? '').trim() || null;
        const isNaturalCell = get('isNatural');
        const isNatural =
          isNaturalCell == null
            ? isNaturalDefault
            : /^(y|yes|true|natural|1)$/i.test(String(isNaturalCell));
        ins.run(
          name,
          cas,
          null,
          priceMinor,
          dilution,
          isNatural ? 1 : 0,
          String(get('chemicalGroup') ?? '').trim() || null,
          String(get('family') ?? '').trim() || null,
          String(get('descriptor1') ?? '').trim() || null,
          String(get('descriptor2') ?? '').trim() || null,
          String(get('personalDescription') ?? '').trim() || null,
          String(get('volatility') ?? '').trim() || null,
          String(get('dosageBand') ?? '').trim() || null,
          String(get('usage') ?? '').trim() || null,
          null
        );
        added++;
      }
    })();
    return { ok: true, added, skipped };
  }
};
