<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import { exportDb, getDb, importDb, resetDb } from '$lib/db/client';
  import { saveSettings } from '$lib/db/mutations';
  export let data: PageData;

  let s = { ...data.settings, visibleCategoryNumbers: [...data.settings.visibleCategoryNumbers] };
  let importing = false;
  let importMsg = '';

  function toggleVisible(n: number) {
    s.visibleCategoryNumbers = s.visibleCategoryNumbers.includes(n)
      ? s.visibleCategoryNumbers.filter((x) => x !== n)
      : [...s.visibleCategoryNumbers, n].sort((a, b) => a - b);
  }

  async function save() {
    const db = await getDb();
    saveSettings(db, {
      defaultCurrency: s.defaultCurrency,
      defaultCategoryNumber: s.defaultCategoryNumber,
      defaultUnitDisplay: s.defaultUnitDisplay,
      defaultBatchG: s.defaultBatchG,
      visibleCategoryNumbers: s.visibleCategoryNumbers
    });
    await invalidateAll();
  }

  async function exportFile() {
    const bytes = await exportDb();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ifrag-${new Date().toISOString().slice(0, 10)}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!confirm(`Replace all current data with the contents of "${file.name}"? This cannot be undone.`)) {
      (e.target as HTMLInputElement).value = '';
      return;
    }
    importing = true;
    importMsg = '';
    try {
      const buf = await file.arrayBuffer();
      await importDb(new Uint8Array(buf));
      importMsg = 'Database restored. Reload the page to see all changes.';
      await invalidateAll();
    } catch (err) {
      importMsg = `Import failed: ${(err as Error).message}`;
    } finally {
      importing = false;
      (e.target as HTMLInputElement).value = '';
    }
  }

  async function reset() {
    if (!confirm('Wipe ALL local data and re-seed from the starter dataset? This deletes every project, trial, material, evaluation and amendment from your browser. This cannot be undone.')) {
      return;
    }
    await resetDb();
    location.reload();
  }
</script>

<div class="space-y-4">
  <h1 class="text-2xl font-bold tracking-tight">Settings</h1>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form on:submit|preventDefault={save} class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Defaults</h2>
      <label class="block text-sm">
        <span class="text-ink-600">Default currency</span>
        <select bind:value={s.defaultCurrency} class="input mt-0.5">
          <option value="EUR">EUR €</option>
          <option value="USD">USD $</option>
          <option value="GBP">GBP £</option>
        </select>
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Default IFRA category</span>
        <select bind:value={s.defaultCategoryNumber} class="input mt-0.5">
          {#each data.categories as c}
            <option value={c.number}>Cat {c.code} — {c.label}</option>
          {/each}
        </select>
      </label>
      <fieldset class="block text-sm">
        <legend class="text-ink-600">Visible IFRA categories</legend>
        <p class="text-xs text-ink-500 mb-1">
          Categories shown in the trial compliance panel. Pick one or more.
        </p>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 max-h-56 overflow-auto rounded border border-ink-200 p-2">
          {#each data.categories as c}
            <label class="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={s.visibleCategoryNumbers.includes(c.number)}
                on:change={() => toggleVisible(c.number)}
              />
              <span><span class="font-mono">{c.code}</span> {c.label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      <label class="block text-sm">
        <span class="text-ink-600">Default amount unit</span>
        <select bind:value={s.defaultUnitDisplay} class="input mt-0.5">
          <option value="pp1000">parts-per-1000 (perfumer convention)</option>
          <option value="pct">percent</option>
          <option value="grams">grams (with batch size)</option>
        </select>
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Default batch size (grams)</span>
        <input type="number" bind:value={s.defaultBatchG} step="0.5" min="1" class="input mt-0.5" />
      </label>
      <button class="btn btn-primary">Save</button>
    </form>

    <div class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Database</h2>
      <p class="text-xs text-ink-600">
        IFrag runs entirely in your browser. Your data is stored in the browser's
        Origin Private File System and IndexedDB, persisted automatically as you work.
        It stays on this device — clearing browser data deletes it.
      </p>
      <ul class="text-sm space-y-1">
        <li>Materials: <strong>{data.counts.materials}</strong></li>
        <li>Projects: <strong>{data.counts.projects}</strong></li>
        <li>Trials: <strong>{data.counts.trials}</strong></li>
        <li>Evaluations: <strong>{data.counts.evaluations}</strong></li>
        <li>IFRA standards (all amendments): <strong>{data.counts.standards}</strong></li>
      </ul>
      <hr />
      <div class="space-y-2">
        <button class="btn" on:click={exportFile}>⬇ Export DB (.db file)</button>
        <p class="text-xs text-ink-500">Save a portable backup. Move it between browsers or devices.</p>

        <label class="btn cursor-pointer inline-flex items-center">
          <span>{importing ? 'Importing…' : '⬆ Import DB (.db file)'}</span>
          <input type="file" accept=".db,.sqlite,.sqlite3" class="hidden" on:change={onImportFile} disabled={importing} />
        </label>
        {#if importMsg}<p class="text-xs">{importMsg}</p>{/if}

        <hr class="my-2" />
        <button class="btn btn-danger" on:click={reset}>↺ Reset all data</button>
        <p class="text-xs text-ink-500">Wipes browser storage and re-seeds the starter dataset.</p>
      </div>
    </div>
  </div>
</div>
