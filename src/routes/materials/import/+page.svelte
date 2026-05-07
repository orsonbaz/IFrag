<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { getDb } from '$lib/db/client';
  import {
    autoMap,
    parseDilutionPct,
    parseFileBuffer,
    parsePriceEurPerKg,
    type Row
  } from '$lib/importer/parse';

  const fields = [
    'name',
    'cas',
    'supplier',
    'dilutionPct',
    'priceEurPerKg',
    'isNatural',
    'family',
    'chemicalGroup',
    'descriptor1',
    'descriptor2',
    'personalDescription',
    'volatility',
    'dosageBand',
    'usage'
  ];

  let preview: {
    sheets: string[];
    sheetName: string;
    sheets_data: Record<string, Row[]>;
    headers: string[];
    rows: Row[];
    rowCount: number;
    mapping: Record<string, string | null>;
  } | null = null;
  let mappingOverride: Record<string, string | null> = {};
  let isNaturalDefault = false;
  let result: { added: number; skipped: number } | null = null;
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
      const mapping = autoMap(headers);
      preview = {
        sheets: Object.keys(parsed.sheets),
        sheetName,
        sheets_data: parsed.sheets,
        headers,
        rows: rows.slice(0, 50),
        rowCount: rows.length,
        mapping
      };
      mappingOverride = { ...mapping };
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function commit() {
    if (!preview) return;
    const db = await getDb();
    const rows = preview.sheets_data[preview.sheetName] ?? [];
    let added = 0;
    let skipped = 0;
    db.transaction(() => {
      const ins = db.prepare(
        `INSERT INTO materials (
          name, cas, supplier, price_minor, currency, dilution_pct,
          is_natural, chemical_group, family, descriptor_1, descriptor_2,
          personal_description, volatility, dosage_band, usage, notes
        ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const exists = db.prepare('SELECT id FROM materials WHERE lower(name) = lower(?)');
      for (const r of rows) {
        const get = (key: string) => (mappingOverride[key] ? r[mappingOverride[key] as string] : null);
        const name = String(get('name') ?? '').trim();
        if (!name) { skipped++; continue; }
        if (exists.get(name)) { skipped++; continue; }
        const priceEur = parsePriceEurPerKg(get('priceEurPerKg'));
        const priceMinor = priceEur != null ? Math.round((priceEur / 1000) * 100) : null;
        const dilution = parseDilutionPct(get('dilutionPct'));
        const cas = String(get('cas') ?? '').trim() || null;
        const isNaturalCell = get('isNatural');
        const isNatural = isNaturalCell == null
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
    });
    result = { added, skipped };
    preview = null;
  }
</script>

<div class="space-y-4">
  <a href={`${base}/materials`} class="text-xs text-ink-500 hover:underline">← Materials</a>
  <h1 class="text-2xl font-bold tracking-tight">Import materials from XLSX or CSV</h1>
  <p class="text-sm text-ink-600">
    Upload your spreadsheet. We'll auto-detect columns by header name; you can correct the mapping
    before committing. The import runs entirely in your browser — no data is sent anywhere.
  </p>

  {#if error}
    <div class="card p-3 bg-red-50 border-red-200 text-sm text-red-900">{error}</div>
  {/if}

  {#if !preview && !result}
    <div class="card p-4 space-y-3">
      <input type="file" accept=".xlsx,.xls,.csv,.tsv,.ods" class="input" on:change={onFile} />
      <p class="text-xs text-ink-500">Supported: .xlsx, .csv, .tsv, .ods. The first sheet will be used.</p>
    </div>
  {/if}

  {#if preview}
    <div class="card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Preview — {preview.rowCount} row(s)</h2>
        <span class="text-xs text-ink-500">Sheets in file: {preview.sheets.join(', ')}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-ink-200 text-xs">
          <thead class="bg-ink-50">
            <tr>{#each preview.headers as h}<th class="px-2 py-1 text-left font-semibold">{h}</th>{/each}</tr>
          </thead>
          <tbody class="divide-y divide-ink-100">
            {#each preview.rows.slice(0, 10) as r}
              <tr>{#each preview.headers as h}<td class="px-2 py-0.5 truncate max-w-32">{r[h] ?? ''}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h2 class="text-sm font-semibold pt-4 border-t border-ink-100">Column mapping</h2>
      <div class="grid grid-cols-2 gap-3">
        {#each fields as f}
          <label class="text-sm flex items-center gap-2">
            <span class="w-32 text-ink-600">{f}</span>
            <select bind:value={mappingOverride[f]} class="input flex-1">
              <option value={null}>— ignore —</option>
              {#each preview.headers as h}<option value={h}>{h}</option>{/each}
            </select>
          </label>
        {/each}
      </div>

      <div class="pt-4 border-t border-ink-100 space-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input bind:checked={isNaturalDefault} type="checkbox" />
          <span>Treat all imported rows as <em>natural</em> by default</span>
        </label>
        <button class="btn btn-primary" on:click={commit}>Commit import</button>
      </div>
    </div>
  {/if}

  {#if result}
    <div class="card p-4 bg-emerald-50 border-emerald-200">
      <h2 class="font-semibold">Imported.</h2>
      <p class="text-sm">{result.added} added, {result.skipped} skipped (existing names or empty).</p>
      <a href={`${base}/materials`} class="btn btn-primary mt-2">View materials</a>
    </div>
  {/if}
</div>
