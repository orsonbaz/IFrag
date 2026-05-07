<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import type { PageData } from './$types';
  import { getDb } from '$lib/db/client';
  import { deleteAmendment, setActiveAmendment } from '$lib/db/mutations';
  export let data: PageData;
  let tab: 'browse' | 'amendments' = 'browse';
  let search = '';
  $: filtered = data.standards.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.cas ?? '').includes(search)
  );

  async function makeActive(id: number) {
    const db = await getDb();
    setActiveAmendment(db, id);
    await invalidateAll();
  }
  async function remove(id: number) {
    if (!confirm('Delete this amendment and all its standards?')) return;
    const db = await getDb();
    deleteAmendment(db, id);
    await invalidateAll();
  }
</script>

<div class="space-y-4">
  <h1 class="text-2xl font-bold tracking-tight">IFRA standards</h1>
  <div class="flex items-center gap-2 border-b border-ink-200">
    {#each ['browse', 'amendments'] as t}
      <button
        class="px-3 py-1.5 text-sm font-medium border-b-2 transition {tab === t ? 'border-accent-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}"
        on:click={() => (tab = t as any)}
      >
        {t === 'browse' ? 'Browse' : 'Amendments'}
      </button>
    {/each}
    <a href={`${base}/ifra/import`} class="ml-auto btn btn-primary">Import official IFRA CSV</a>
  </div>

  {#if tab === 'browse'}
    <div class="card p-3 flex items-center gap-2">
      <input bind:value={search} placeholder="Search by name or CAS…" class="input flex-1" />
      <span class="text-xs text-ink-500">{filtered.length} of {data.standards.length}</span>
    </div>
    <div class="card overflow-hidden">
      <table class="min-w-full divide-y divide-ink-200">
        <thead class="bg-ink-50">
          <tr class="text-left text-xs uppercase font-semibold text-ink-600">
            <th class="px-3 py-1.5">Name</th>
            <th class="px-3 py-1.5">CAS</th>
            <th class="px-3 py-1.5">Type</th>
            <th class="px-3 py-1.5">Reason</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white">
          {#each filtered as s}
            <tr>
              <td class="px-3 py-1.5 font-medium">{s.name}</td>
              <td class="px-3 py-1.5 text-xs font-mono">{s.cas ?? '—'}</td>
              <td class="px-3 py-1.5 text-xs">
                <span class="badge {s.type === 'prohibition' ? 'badge-fail' : s.type === 'restriction' ? 'badge-warn' : 'badge-unknown'}">{s.type}</span>
              </td>
              <td class="px-3 py-1.5 text-xs text-ink-600">{s.reason ?? '—'}</td>
            </tr>
          {/each}
          {#if filtered.length === 0}
            <tr><td colspan="4" class="px-3 py-6 text-center text-sm text-ink-500">No standards loaded for the active amendment.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  {#if tab === 'amendments'}
    <div class="card overflow-hidden">
      <table class="min-w-full divide-y divide-ink-200">
        <thead class="bg-ink-50">
          <tr class="text-left text-xs uppercase font-semibold text-ink-600">
            <th class="px-3 py-1.5">Version</th>
            <th class="px-3 py-1.5">Published</th>
            <th class="px-3 py-1.5">Standards</th>
            <th class="px-3 py-1.5">Notes</th>
            <th class="px-3 py-1.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white">
          {#each data.amendments as a}
            <tr>
              <td class="px-3 py-1.5 font-medium">
                {a.version}
                {#if a.isActive}<span class="badge badge-pass ml-1">active</span>{/if}
                {#if a.isStarter}<span class="badge badge-warn ml-1">starter</span>{/if}
              </td>
              <td class="px-3 py-1.5 text-xs">{a.publishedOn ?? '—'}</td>
              <td class="px-3 py-1.5 text-sm">{a.count}</td>
              <td class="px-3 py-1.5 text-xs text-ink-600 max-w-md">{a.notes ?? '—'}</td>
              <td class="px-3 py-1.5 text-right">
                {#if !a.isActive}
                  <button class="btn" on:click={() => makeActive(a.id)}>Make active</button>
                {/if}
                <button class="btn" on:click={() => remove(a.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
