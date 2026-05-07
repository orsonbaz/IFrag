<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import { formatMoney } from '$lib/utils/format';
  export let data: PageData;
  let search = '';
  let filterNatural: 'all' | 'natural' | 'synthetic' | 'accord' = 'all';
  let filterIfra: 'all' | 'linked' | 'unlinked' = 'all';
  let showNew = false;

  $: filtered = data.materials
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || (m.cas ?? '').includes(search))
    .filter((m) => {
      if (filterNatural === 'all') return true;
      if (filterNatural === 'accord') return !!m.isAccord;
      if (m.isAccord) return false;
      return (filterNatural === 'natural') === m.isNatural;
    })
    .filter((m) =>
      filterIfra === 'all'
        ? true
        : filterIfra === 'linked'
          ? m.linkedStandards + m.annexCount > 0
          : m.linkedStandards + m.annexCount === 0
    );
</script>

<div class="space-y-4">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Materials</h1>
      <p class="mt-1 text-sm text-ink-600">{data.materials.length} ingredients in your library.</p>
    </div>
    <div class="flex gap-2">
      <a href="/materials/import" class="btn">Import from XLSX/CSV</a>
      <button class="btn btn-primary" on:click={() => (showNew = !showNew)}>+ New material</button>
    </div>
  </div>

  {#if showNew}
    <form method="POST" action="?/create" use:enhance={() => () => (showNew = false)} class="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <label class="text-sm">
        <span class="block text-ink-600">Name</span>
        <input name="name" required class="input mt-0.5" />
      </label>
      <label class="text-sm">
        <span class="block text-ink-600">CAS</span>
        <input name="cas" class="input mt-0.5" placeholder="e.g. 5392-40-5" />
      </label>
      <label class="text-sm">
        <span class="block text-ink-600">Supplier</span>
        <input name="supplier" class="input mt-0.5" />
      </label>
      <label class="text-sm">
        <span class="block text-ink-600">Dilution %</span>
        <input name="dilutionPct" type="number" value="100" min="0" max="100" step="0.1" class="input mt-0.5" />
      </label>
      <label class="text-sm">
        <span class="block text-ink-600">Price € / kg</span>
        <input name="priceEurPerKg" type="number" step="0.01" min="0" class="input mt-0.5" />
      </label>
      <label class="text-sm flex items-end gap-2">
        <input type="checkbox" name="isNatural" />
        <span>Natural (essential oil, absolute, etc.)</span>
      </label>
      <div class="md:col-span-3 flex gap-2">
        <button class="btn btn-primary" type="submit">Add material</button>
        <button class="btn" type="button" on:click={() => (showNew = false)}>Cancel</button>
      </div>
    </form>
  {/if}

  <div class="card p-3 flex flex-wrap items-center gap-2">
    <input bind:value={search} placeholder="Search name or CAS…" class="input flex-1 min-w-48" />
    <select bind:value={filterNatural} class="input" style="width:auto">
      <option value="all">All types</option>
      <option value="synthetic">Synthetic</option>
      <option value="natural">Natural</option>
      <option value="accord">Accord</option>
    </select>
    <select bind:value={filterIfra} class="input" style="width:auto">
      <option value="all">Any IFRA status</option>
      <option value="linked">Linked / has annex</option>
      <option value="unlinked">No IFRA links</option>
    </select>
  </div>

  <div class="card overflow-hidden">
    <table class="min-w-full divide-y divide-ink-200">
      <thead class="bg-ink-50">
        <tr class="text-left text-xs font-semibold uppercase text-ink-600">
          <th class="px-3 py-1.5">Name</th>
          <th class="px-3 py-1.5">CAS</th>
          <th class="px-3 py-1.5">Type</th>
          <th class="px-3 py-1.5">Family</th>
          <th class="px-3 py-1.5 text-right">Dilution</th>
          <th class="px-3 py-1.5 text-right">€/kg</th>
          <th class="px-3 py-1.5">IFRA</th>
          <th class="px-3 py-1.5 text-right"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-ink-100 bg-white">
        {#each filtered as m}
          <tr>
            <td class="px-3 py-1.5">
              <a href={`/materials/${m.id}`} class="text-accent-600 hover:underline font-medium">{m.name}</a>
              {#if m.isAccord}<span class="badge bg-accent-500/15 text-accent-600 ml-1">📦 accord</span>{/if}
              {#if m.descriptor1 || m.descriptor2}
                <div class="text-xs text-ink-500">{[m.descriptor1, m.descriptor2].filter(Boolean).join(' / ')}</div>
              {/if}
            </td>
            <td class="px-3 py-1.5 text-xs font-mono">{m.cas ?? '—'}</td>
            <td class="px-3 py-1.5 text-xs">{m.isAccord ? 'accord' : m.isNatural ? 'natural' : 'synthetic'}</td>
            <td class="px-3 py-1.5 text-xs">{m.family ?? '—'}</td>
            <td class="px-3 py-1.5 text-right text-sm">{m.dilutionPct}%</td>
            <td class="px-3 py-1.5 text-right text-sm">{m.priceMinor != null ? formatMoney(m.priceMinor * 1000, m.currency) + '/kg' : '—'}</td>
            <td class="px-3 py-1.5 text-xs">
              {#if m.linkedStandards > 0}
                <span class="badge badge-warn">{m.linkedStandards} link{m.linkedStandards === 1 ? '' : 's'}</span>
              {/if}
              {#if m.annexCount > 0}
                <span class="badge badge-unknown">{m.annexCount} annex</span>
              {/if}
              {#if m.linkedStandards === 0 && m.annexCount === 0}
                <span class="text-ink-400">—</span>
              {/if}
            </td>
            <td class="px-3 py-1.5 text-right">
              <form method="POST" action="?/delete" use:enhance class="inline" on:submit|preventDefault={(e) => { if (confirm('Delete material?')) (e.target as HTMLFormElement).submit(); }}>
                <input type="hidden" name="id" value={m.id} />
                <button class="text-xs text-ink-400 hover:text-red-600">delete</button>
              </form>
            </td>
          </tr>
        {/each}
        {#if filtered.length === 0}
          <tr><td colspan="8" class="px-3 py-6 text-center text-sm text-ink-500">No materials match.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
