<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<div class="space-y-4">
  <h1 class="text-2xl font-bold tracking-tight">Settings</h1>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form method="POST" action="?/save" use:enhance class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Defaults</h2>
      <label class="block text-sm">
        <span class="text-ink-600">Default currency</span>
        <select name="defaultCurrency" class="input mt-0.5" value={data.settings.defaultCurrency}>
          <option value="EUR">EUR €</option>
          <option value="USD">USD $</option>
          <option value="GBP">GBP £</option>
        </select>
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Default IFRA category</span>
        <select name="defaultCategoryNumber" class="input mt-0.5" value={data.settings.defaultCategoryNumber}>
          {#each data.categories as c}
            <option value={c.number}>Cat {c.code} — {c.label}</option>
          {/each}
        </select>
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Default amount unit</span>
        <select name="defaultUnitDisplay" class="input mt-0.5" value={data.settings.defaultUnitDisplay}>
          <option value="pp1000">parts-per-1000 (perfumer convention)</option>
          <option value="pct">percent</option>
          <option value="grams">grams (with batch size)</option>
        </select>
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Default batch size (grams)</span>
        <input
          type="number"
          name="defaultBatchG"
          step="0.5"
          min="1"
          value={data.settings.defaultBatchG}
          class="input mt-0.5"
        />
      </label>
      <button class="btn btn-primary">Save</button>
    </form>

    <div class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Database</h2>
      <p class="text-xs text-ink-600">
        Your data lives at <code class="bg-ink-100 px-1 rounded">{data.dbPath}</code>.
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
        <a href="/api/backup" download class="btn">Export DB (download .db file)</a>
        <p class="text-xs text-ink-500">
          To restore: stop the server, replace the file at the path above with your backup,
          then restart.
        </p>
      </div>
    </div>
  </div>
</div>
