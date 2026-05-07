<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import type { PageData } from './$types';
  import { getDb } from '$lib/db/client';
  import { addAnnex, deleteAnnex, updateMaterial } from '$lib/db/mutations';
  export let data: PageData;

  let m = data.material;
  let priceEurPerKg: number | '' = m.priceMinor != null ? m.priceMinor / 100 : '';

  let aName = '';
  let aCas = '';
  let aPct: number | '' = '';

  async function save() {
    const db = await getDb();
    updateMaterial(db, m.id, {
      name: m.name.trim(),
      cas: (m.cas ?? '').trim() || null,
      supplier: (m.supplier ?? '').trim() || null,
      priceEurPerKg: priceEurPerKg === '' ? null : Number(priceEurPerKg),
      dilutionPct: Number(m.dilutionPct ?? 100),
      isNatural: !!m.isNatural,
      stockG: m.stockG ?? null,
      notes: m.notes
    });
    await invalidateAll();
  }

  async function addAnnexRow() {
    if (!aName.trim() || aPct === '') return;
    const db = await getDb();
    addAnnex(db, m.id, {
      constituentName: aName.trim(),
      constituentCas: aCas.trim() || null,
      contributionPct: Number(aPct)
    });
    aName = aCas = '';
    aPct = '';
    await invalidateAll();
  }

  async function removeAnnexRow(id: number) {
    const db = await getDb();
    deleteAnnex(db, id);
    await invalidateAll();
  }
</script>

<div class="space-y-4">
  <a href={`${base}/materials`} class="text-xs text-ink-500 hover:underline">← All materials</a>
  <h1 class="text-2xl font-bold tracking-tight">{m.name}</h1>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form on:submit|preventDefault={save} class="card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Properties</h2>
      <label class="block text-sm">
        <span class="text-ink-600">Name</span>
        <input bind:value={m.name} required class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">CAS</span>
        <input bind:value={m.cas} class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Supplier</span>
        <input bind:value={m.supplier} class="input mt-0.5" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">
          <span class="text-ink-600">Dilution %</span>
          <input bind:value={m.dilutionPct} type="number" step="0.1" class="input mt-0.5" />
        </label>
        <label class="block text-sm">
          <span class="text-ink-600">Price € / kg</span>
          <input bind:value={priceEurPerKg} type="number" step="0.01" class="input mt-0.5" />
        </label>
      </div>
      <label class="block text-sm">
        <span class="text-ink-600">Stock (g)</span>
        <input bind:value={m.stockG} type="number" step="0.1" class="input mt-0.5" />
      </label>
      <label class="block text-sm">
        <span class="text-ink-600">Notes</span>
        <textarea bind:value={m.notes} rows="3" class="input mt-0.5"></textarea>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input bind:checked={m.isNatural} type="checkbox" />
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
            <button class="text-xs text-ink-400 hover:text-red-600" on:click={() => removeAnnexRow(a.id)}>remove</button>
          </li>
        {/each}
      </ul>
      <form on:submit|preventDefault={addAnnexRow} class="grid grid-cols-3 gap-2">
        <input bind:value={aName} required placeholder="Constituent name" class="input text-sm col-span-2" />
        <input bind:value={aPct} type="number" step="0.01" min="0" max="100" required placeholder="%" class="input text-sm" />
        <input bind:value={aCas} placeholder="CAS (optional)" class="input text-sm col-span-2" />
        <button class="btn">+ Add</button>
      </form>
    </div>
  </div>
</div>
