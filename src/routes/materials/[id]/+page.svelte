<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<div class="space-y-4">
  <a href="/materials" class="text-xs text-ink-500 hover:underline">← All materials</a>
  <h1 class="text-2xl font-bold tracking-tight">{data.material.name}</h1>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form method="POST" action="?/update" use:enhance class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Properties</h2>
      <label class="block text-sm">
        <span class="text-ink-600">Name</span>
        <input name="name" required value={data.material.name} class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">CAS</span>
        <input name="cas" value={data.material.cas ?? ''} class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Supplier</span>
        <input name="supplier" value={data.material.supplier ?? ''} class="input mt-0.5" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">
          <span class="text-ink-600">Dilution %</span>
          <input name="dilutionPct" type="number" step="0.1" value={data.material.dilutionPct} class="input mt-0.5" />
        </label>
        <label class="block text-sm">
          <span class="text-ink-600">Price € / kg</span>
          <input
            name="priceEurPerKg"
            type="number"
            step="0.01"
            value={data.material.priceMinor != null ? (data.material.priceMinor * 1000) / 100 : ''}
            class="input mt-0.5"
          />
        </label>
      </div>
      <label class="block text-sm">
        <span class="text-ink-600">Stock (g)</span>
        <input name="stockG" type="number" step="0.1" value={data.material.stockG ?? ''} class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Notes</span>
        <textarea name="notes" rows="3" class="input mt-0.5">{data.material.notes ?? ''}</textarea>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input name="isNatural" type="checkbox" checked={data.material.isNatural} />
        <span>Natural (essential oil, absolute, etc.)</span>
      </label>
      <button class="btn btn-primary">Save</button>
    </form>

    <div class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">IFRA links</h2>
      {#if data.links.length === 0}
        <p class="text-xs text-ink-500">No direct IFRA standards linked to this material.</p>
      {:else}
        <ul class="text-sm divide-y divide-ink-100">
          {#each data.links as l}
            <li class="py-1.5 flex items-center justify-between">
              <span>{l.name} <span class="text-xs text-ink-400">CAS {l.cas ?? '—'}</span></span>
              <span class="badge {l.type === 'prohibition' ? 'badge-fail' : l.type === 'restriction' ? 'badge-warn' : 'badge-unknown'}">
                {l.type}
              </span>
            </li>
          {/each}
        </ul>
      {/if}

      <hr class="my-2" />
      <h2 class="text-sm font-semibold">Restricted constituents (annex contributions)</h2>
      <p class="text-xs text-ink-500">For naturals: which restricted ingredients does this material contain, and at what %?</p>
      <ul class="text-sm divide-y divide-ink-100">
        {#each data.annex as a}
          <li class="py-1.5 flex items-center justify-between">
            <span>
              {a.constituentName}
              {#if a.constituentCas}<span class="text-xs text-ink-400">CAS {a.constituentCas}</span>{/if}
              <span class="ml-2 text-xs text-ink-500">{a.contributionPct}%</span>
            </span>
            <form method="POST" action="?/removeAnnex" use:enhance>
              <input type="hidden" name="id" value={a.id} />
              <button class="text-xs text-ink-400 hover:text-red-600">remove</button>
            </form>
          </li>
        {/each}
      </ul>
      <form method="POST" action="?/addAnnex" use:enhance class="grid grid-cols-3 gap-2">
        <input name="constituentName" required placeholder="Constituent name" class="input text-sm col-span-2" />
        <input name="contributionPct" type="number" step="0.01" min="0" max="100" required placeholder="%" class="input text-sm" />
        <input name="constituentCas" placeholder="CAS (optional)" class="input text-sm col-span-2" />
        <button class="btn">+ Add</button>
      </form>
    </div>
  </div>
</div>
