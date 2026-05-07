<script lang="ts">
  import { base } from '$app/paths';
  import { getDb } from '$lib/db/client';
  import { parseFileBuffer, type Row } from '$lib/importer/parse';

  const expectedFields = [
    'material_name', 'primary_cas', 'standard_type', 'reason',
    'limit_cat_1', 'limit_cat_2', 'limit_cat_3', 'limit_cat_4',
    'limit_cat_5A', 'limit_cat_5B', 'limit_cat_5C', 'limit_cat_5D',
    'limit_cat_6', 'limit_cat_7A', 'limit_cat_7B',
    'limit_cat_8', 'limit_cat_9',
    'limit_cat_10A', 'limit_cat_10B',
    'limit_cat_11A', 'limit_cat_11B', 'limit_cat_12'
  ];

  const catCodeToNumber: Record<string, number> = {
    '1': 1, '2': 2, '3': 3, '4': 4,
    '5A': 51, '5B': 52, '5C': 53, '5D': 54,
    '6': 6, '7A': 71, '7B': 72,
    '8': 8, '9': 9, '10A': 101, '10B': 102,
    '11A': 111, '11B': 112, '12': 12
  };

  function autoMapIfra(headers: string[]): Record<string, string | null> {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[._]/g, '');
    const out: Record<string, string | null> = {};
    for (const f of expectedFields) {
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

  let preview: {
    sheets: string[];
    sheetName: string;
    sheetData: Record<string, Row[]>;
    headers: string[];
    rowCount: number;
    rows: Row[];
    mapping: Record<string, string | null>;
  } | null = null;
  let mappingOverride: Record<string, string | null> = {};
  let amendmentVersion = '';
  let mergeMode: 'upsert' | 'replace' = 'upsert';
  let result: { added: number; updated: number; skipped: number; amendmentVersion: string } | null = null;
  let error: string | null = null;

  async function onFile(e: Event) {
    error = null;
    result = null;
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseFileBuffer(file.name, buf);
      const sheetName = Object.keys(parsed.sheets)[0];
      const rows = parsed.sheets[sheetName] ?? [];
      const headers = rows.length > 0 ? Object.keys(rows[0] as object) : [];
      const mapping = autoMapIfra(headers);
      preview = {
        sheets: Object.keys(parsed.sheets),
        sheetName,
        sheetData: parsed.sheets,
        headers,
        rowCount: rows.length,
        rows: rows.slice(0, 20),
        mapping
      };
      mappingOverride = { ...mapping };
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function commit() {
    if (!preview || !amendmentVersion.trim()) return;
    const db = await getDb();
    const rows = preview.sheetData[preview.sheetName] ?? [];
    let amendmentId = 0;
    let added = 0, updated = 0, skipped = 0;
    db.transaction(() => {
      const existing = db
        .prepare('SELECT id FROM ifra_amendments WHERE version = ?')
        .get(amendmentVersion.trim()) as { id: number } | undefined;
      if (existing) {
        amendmentId = existing.id;
      } else {
        const r = db
          .prepare('INSERT INTO ifra_amendments (version, is_active, is_starter) VALUES (?, 0, 0) RETURNING id')
          .run(amendmentVersion.trim());
        amendmentId = r.lastInsertRowid;
      }
      if (mergeMode === 'replace') {
        db.prepare('DELETE FROM ifra_standards WHERE amendment_id = ?').run(amendmentId);
      }
      const insStd = db.prepare(
        `INSERT INTO ifra_standards (amendment_id, primary_cas, material_name, standard_type, reason, raw_row)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (amendment_id, primary_cas, material_name) DO UPDATE SET
           standard_type = excluded.standard_type,
           reason = excluded.reason,
           raw_row = excluded.raw_row
         RETURNING id`
      );
      const get = (r: Row, key: string) => (mappingOverride[key] ? r[mappingOverride[key] as string] : null);

      for (const r of rows) {
        const name = String(get(r, 'material_name') ?? '').trim();
        if (!name) { skipped++; continue; }
        const cas = String(get(r, 'primary_cas') ?? '').trim() || null;
        const typeRaw = String(get(r, 'standard_type') ?? 'restriction').trim().toLowerCase();
        const type = (typeRaw === 'prohibition' || typeRaw === 'specification') ? typeRaw : 'restriction';
        const reason = String(get(r, 'reason') ?? '').trim() || null;
        const before = db
          .prepare('SELECT id FROM ifra_standards WHERE amendment_id=? AND primary_cas IS ? AND material_name=?')
          .get(amendmentId, cas, name) as { id: number } | undefined;
        const row = insStd.run(amendmentId, cas, name, type, reason, JSON.stringify(r));
        const stdId = row.lastInsertRowid;
        if (before) updated++; else added++;
        if (cas) {
          db.prepare('INSERT OR IGNORE INTO ifra_standard_cas (standard_id, cas) VALUES (?, ?)').run(stdId, cas);
        }
        db.prepare('DELETE FROM ifra_category_limits WHERE standard_id = ?').run(stdId);
        for (const [code, num] of Object.entries(catCodeToNumber)) {
          const v = get(r, `limit_cat_${code}`);
          const parsed = parseLimitCell(v);
          if (parsed.limitPct == null && !parsed.prohibited && !parsed.noRestriction) continue;
          db.prepare(
            `INSERT INTO ifra_category_limits (standard_id, category_number, limit_pct, prohibited, no_restriction)
             VALUES (?, ?, ?, ?, ?)`
          ).run(stdId, num, parsed.limitPct, parsed.prohibited ? 1 : 0, parsed.noRestriction ? 1 : 0);
        }
      }

      // auto-link materials by CAS
      db.prepare(
        `INSERT OR IGNORE INTO material_ifra_links (material_id, standard_id, link_source)
         SELECT m.id, s.id, 'cas_auto'
         FROM materials m
         JOIN ifra_standards s ON s.amendment_id = ?
           AND (s.primary_cas = m.cas OR EXISTS (SELECT 1 FROM ifra_standard_cas c WHERE c.standard_id = s.id AND c.cas = m.cas))
         WHERE m.cas IS NOT NULL`
      ).run(amendmentId);
    });
    result = { added, updated, skipped, amendmentVersion: amendmentVersion.trim() };
    preview = null;
  }
</script>

<div class="space-y-4">
  <a href={`${base}/ifra`} class="text-xs text-ink-500 hover:underline">← IFRA</a>
  <h1 class="text-2xl font-bold tracking-tight">Import IFRA standards</h1>
  <p class="text-sm text-ink-600 max-w-3xl">
    Upload a CSV or XLSX with one row per restricted/prohibited substance and one column per IFRA
    category. Limit cells accept a number (% in finished product), or <code>P</code> for prohibited,
    or <code>NR</code> for no restriction. Categories use codes 1, 2, 3, 4, 5A–D, 6, 7A–B, 8, 9,
    10A–B, 11A–B, 12. Everything is parsed and stored locally in your browser.
  </p>

  {#if error}<div class="card p-3 bg-red-50 border-red-200 text-sm text-red-900">{error}</div>{/if}

  {#if !preview && !result}
    <div class="card p-4 space-y-3">
      <input type="file" accept=".xlsx,.csv,.tsv,.ods" class="input" on:change={onFile} />
    </div>
  {/if}

  {#if preview}
    <div class="card p-4 space-y-4">
      <h2 class="text-sm font-semibold">Preview — {preview.rowCount} row(s)</h2>
      <div class="overflow-x-auto max-h-64">
        <table class="min-w-full divide-y divide-ink-200 text-xs">
          <thead class="bg-ink-50 sticky top-0">
            <tr>{#each preview.headers as h}<th class="px-2 py-1 text-left font-semibold">{h}</th>{/each}</tr>
          </thead>
          <tbody class="divide-y divide-ink-100">
            {#each preview.rows as r}
              <tr>{#each preview.headers as h}<td class="px-2 py-0.5 truncate max-w-32">{r[h] ?? ''}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h2 class="text-sm font-semibold pt-4 border-t border-ink-100">Column mapping</h2>
      <div class="grid grid-cols-2 gap-2">
        {#each expectedFields as f}
          <label class="text-sm flex items-center gap-2">
            <span class="w-32 text-ink-600 font-mono text-xs">{f}</span>
            <select bind:value={mappingOverride[f]} class="input flex-1 text-xs">
              <option value={null}>— ignore —</option>
              {#each preview.headers as h}<option value={h}>{h}</option>{/each}
            </select>
          </label>
        {/each}
      </div>

      <div class="pt-4 border-t border-ink-100 space-y-2">
        <label class="block text-sm">
          <span class="text-ink-600">Amendment version label</span>
          <input bind:value={amendmentVersion} required placeholder="e.g. 51, 52" class="input mt-0.5" />
        </label>
        <label class="block text-sm">
          <span class="text-ink-600">If a standard already exists in this amendment</span>
          <select bind:value={mergeMode} class="input mt-0.5">
            <option value="upsert">Upsert (update existing, add new)</option>
            <option value="replace">Replace (wipe amendment first)</option>
          </select>
        </label>
        <button class="btn btn-primary" on:click={commit}>Commit import</button>
      </div>
    </div>
  {/if}

  {#if result}
    <div class="card p-4 bg-emerald-50 border-emerald-200">
      <h2 class="font-semibold">Imported amendment {result.amendmentVersion}</h2>
      <p class="text-sm">{result.added} added, {result.updated} updated, {result.skipped} skipped.</p>
      <a href={`${base}/ifra`} class="btn btn-primary mt-2">Back to IFRA</a>
    </div>
  {/if}
</div>
