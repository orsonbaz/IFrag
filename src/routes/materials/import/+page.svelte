<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';
  export let form: ActionData;

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

  let mappingOverride: Record<string, string | null> = {};
  $: if (form?.preview && Object.keys(mappingOverride).length === 0) {
    mappingOverride = { ...form.preview.mapping };
  }
</script>

<div class="space-y-4">
  <a href="/materials" class="text-xs text-ink-500 hover:underline">← Materials</a>
  <h1 class="text-2xl font-bold tracking-tight">Import materials from XLSX or CSV</h1>
  <p class="text-sm text-ink-600">
    Upload your spreadsheet. We'll auto-detect columns by header name. Then you can correct the
    mapping before committing.
  </p>

  {#if !form?.preview && !form?.ok}
    <form method="POST" action="?/upload" use:enhance enctype="multipart/form-data" class="card p-4 space-y-3">
      <input type="file" name="file" required accept=".xlsx,.xls,.csv,.tsv,.ods" class="input" />
      <p class="text-xs text-ink-500">
        Supported: .xlsx, .csv, .tsv, .ods. The first sheet will be used.
        Common headers we recognize: Name, CAS, Supplier, Dilution, Price, Family,
        Chemical group, Descriptor 1/2, Personal Description, Volatility, Dosage, Usage.
      </p>
      <button class="btn btn-primary">Upload &amp; preview</button>
    </form>
  {/if}

  {#if form?.preview}
    <div class="card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Preview — {form.preview.rowCount} row(s)</h2>
        <span class="text-xs text-ink-500">Sheets in file: {form.preview.sheets.join(', ')}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-ink-200 text-xs">
          <thead class="bg-ink-50">
            <tr>
              {#each form.preview.headers as h}
                <th class="px-2 py-1 text-left font-semibold">{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-ink-100">
            {#each form.preview.rows.slice(0, 10) as r}
              <tr>
                {#each form.preview.headers as h}
                  <td class="px-2 py-0.5 truncate max-w-32">{r[h] ?? ''}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if form.preview.rowCount > 10}<p class="text-xs text-ink-400 mt-1">+ {form.preview.rowCount - 10} more rows…</p>{/if}
      </div>

      <h2 class="text-sm font-semibold pt-4 border-t border-ink-100">Column mapping</h2>
      <div class="grid grid-cols-2 gap-3">
        {#each fields as f}
          <label class="text-sm flex items-center gap-2">
            <span class="w-32 text-ink-600">{f}</span>
            <select bind:value={mappingOverride[f]} class="input flex-1">
              <option value={null}>— ignore —</option>
              {#each form.preview.headers as h}
                <option value={h}>{h}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>

      <form method="POST" action="?/commit" use:enhance class="pt-4 border-t border-ink-100 space-y-2">
        <input type="hidden" name="fullDataB64" value={form.preview.fullDataB64} />
        <input type="hidden" name="sheetName" value={form.preview.sheetName} />
        <input type="hidden" name="mappingJson" value={JSON.stringify(mappingOverride)} />
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isNaturalDefault" />
          <span>Treat all imported rows as <em>natural</em> by default (use for a "naturals" sheet)</span>
        </label>
        <button class="btn btn-primary">Commit import</button>
      </form>
    </div>
  {/if}

  {#if form?.ok}
    <div class="card p-4 bg-emerald-50 border-emerald-200">
      <h2 class="font-semibold">Imported.</h2>
      <p class="text-sm">{form.added} added, {form.skipped} skipped (existing names or empty).</p>
      <a href="/materials" class="btn btn-primary mt-2">View materials</a>
    </div>
  {/if}
</div>
