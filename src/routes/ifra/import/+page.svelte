<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';
  export let form: ActionData;

  const expectedFields = [
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

  let mappingOverride: Record<string, string | null> = {};
  $: if (form?.preview && Object.keys(mappingOverride).length === 0) {
    mappingOverride = { ...form.preview.mapping };
  }
</script>

<div class="space-y-4">
  <a href="/ifra" class="text-xs text-ink-500 hover:underline">← IFRA</a>
  <h1 class="text-2xl font-bold tracking-tight">Import IFRA standards</h1>
  <p class="text-sm text-ink-600 max-w-3xl">
    Upload a CSV or XLSX with one row per restricted/prohibited substance and one column per IFRA
    category. Limit cells accept a number (% in finished product), or <code>P</code> for prohibited,
    or <code>NR</code> for no restriction. The 12 categories use codes 1, 2, 3, 4, 5A, 5B, 5C, 5D,
    6, 7A, 7B, 8, 9, 10A, 10B, 11A, 11B, 12.
  </p>

  {#if !form?.preview && !form?.ok}
    <form method="POST" action="?/upload" use:enhance enctype="multipart/form-data" class="card p-4 space-y-3">
      <input type="file" name="file" required accept=".xlsx,.csv,.tsv,.ods" class="input" />
      <button class="btn btn-primary">Upload &amp; preview</button>
    </form>
  {/if}

  {#if form?.preview}
    <div class="card p-4 space-y-4">
      <h2 class="text-sm font-semibold">Preview — {form.preview.rowCount} row(s)</h2>
      <div class="overflow-x-auto max-h-64">
        <table class="min-w-full divide-y divide-ink-200 text-xs">
          <thead class="bg-ink-50 sticky top-0">
            <tr>
              {#each form.preview.headers as h}<th class="px-2 py-1 text-left font-semibold">{h}</th>{/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-ink-100">
            {#each form.preview.rows as r}
              <tr>
                {#each form.preview.headers as h}<td class="px-2 py-0.5 truncate max-w-32">{r[h] ?? ''}</td>{/each}
              </tr>
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
              {#each form.preview.headers as h}<option value={h}>{h}</option>{/each}
            </select>
          </label>
        {/each}
      </div>

      <form method="POST" action="?/commit" use:enhance class="pt-4 border-t border-ink-100 space-y-2">
        <input type="hidden" name="fullDataB64" value={form.preview.fullDataB64} />
        <input type="hidden" name="sheetName" value={form.preview.sheetName} />
        <input type="hidden" name="mappingJson" value={JSON.stringify(mappingOverride)} />
        <label class="block text-sm">
          <span class="text-ink-600">Amendment version label</span>
          <input name="amendmentVersion" required placeholder="e.g. 51, 52" class="input mt-0.5" />
        </label>
        <label class="block text-sm">
          <span class="text-ink-600">If a standard already exists in this amendment</span>
          <select name="mergeMode" class="input mt-0.5">
            <option value="upsert">Upsert (update existing, add new)</option>
            <option value="replace">Replace (wipe amendment first)</option>
          </select>
        </label>
        <button class="btn btn-primary">Commit import</button>
      </form>
    </div>
  {/if}

  {#if form?.ok}
    <div class="card p-4 bg-emerald-50 border-emerald-200">
      <h2 class="font-semibold">Imported amendment {form.amendmentVersion}</h2>
      <p class="text-sm">{form.added} added, {form.updated} updated, {form.skipped} skipped.</p>
      <a href="/ifra" class="btn btn-primary mt-2">Back to IFRA</a>
    </div>
  {/if}
</div>
