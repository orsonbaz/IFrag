<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatPp1000, formatMoney } from '$lib/utils/format';

  export let data: PageData;

  // Build a per-material × per-trial matrix.
  $: matrix = data.materialOrder.map((m) => ({
    material: m,
    cells: data.trials.map((t) => {
      const c = t.components.find((x) => x.materialId === m.id);
      return c ? c.partsPer1000 : null;
    })
  }));

  function diffClass(values: Array<number | null>, idx: number): string {
    const v = values[idx];
    if (v == null) return 'text-ink-300';
    // baseline = first non-null
    const baseline = values.find((x) => x != null);
    if (baseline == null || idx === values.indexOf(baseline)) return '';
    const delta = v - baseline;
    if (Math.abs(delta) < 0.01) return '';
    return delta > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold';
  }

  function diffIndicator(values: Array<number | null>, idx: number): string {
    const v = values[idx];
    if (v == null) return '';
    const baseline = values.find((x) => x != null);
    if (baseline == null || idx === values.indexOf(baseline)) return '';
    const delta = v - baseline;
    if (Math.abs(delta) < 0.01) return '';
    return delta > 0 ? '▲' : '▼';
  }

  function addedRemoved(values: Array<number | null>, idx: number): string {
    const v = values[idx];
    const prev = idx > 0 ? values[idx - 1] : null;
    if (v != null && prev == null && idx > 0) return ' (added)';
    if (v == null && prev != null) return ' (removed)';
    return '';
  }

  function statusDot(s: string) {
    if (s === 'pass') return 'bg-emerald-500';
    if (s === 'warn') return 'bg-amber-500';
    if (s === 'fail') return 'bg-red-500';
    return 'bg-ink-300';
  }

  let pickerOpen = false;
  let selected = new Set(data.selectedIds);
  $: selected = new Set(data.selectedIds); // keep in sync after navigation

  function toggle(id: number) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = selected;
  }

  function applySelection() {
    const ids = Array.from(selected).join(',');
    goto(`?ids=${ids}`, { invalidateAll: true });
    pickerOpen = false;
  }
</script>

<div class="space-y-4">
  <a href={`/projects/${data.project.id}`} class="text-xs text-ink-500 hover:underline">← {data.project.name}</a>

  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold tracking-tight">Compare trials</h1>
    <div class="relative">
      <button class="btn" on:click={() => (pickerOpen = !pickerOpen)}>
        {data.trials.length} of {data.allTrials.length} selected
      </button>
      {#if pickerOpen}
        <div class="absolute right-0 top-9 z-10 w-72 card bg-white shadow-lg p-3 space-y-1.5">
          {#each data.allTrials as t}
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                on:change={() => toggle(t.id)}
              />
              <span>{t.versionLabel}</span>
              <span class="text-xs text-ink-500 ml-auto">{new Date(t.createdAt).toLocaleDateString()}</span>
            </label>
          {/each}
          <div class="pt-2 border-t border-ink-100 flex gap-2">
            <button class="btn btn-primary text-xs" on:click={applySelection}>Apply</button>
            <button class="btn text-xs" on:click={() => (pickerOpen = false)}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  {#if data.trials.length === 0}
    <div class="card p-8 text-center text-sm text-ink-600">No trials selected.</div>
  {:else}
    <!-- Header summary -->
    <div class="card overflow-x-auto">
      <table class="min-w-full divide-y divide-ink-200">
        <thead class="bg-ink-50">
          <tr class="text-left text-xs uppercase font-semibold text-ink-600">
            <th class="px-3 py-1.5 w-1/3">Material</th>
            {#each data.trials as t}
              <th class="px-3 py-1.5 text-right">
                <a href={`/projects/${data.project.id}/trials/${t.id}`} class="text-accent-600 hover:underline">{t.versionLabel}</a>
                <div class="text-xs text-ink-500">cat {t.targetCategoryNumber} · {t.compoundDosagePct}%</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white text-sm">
          {#each matrix as row}
            <tr>
              <td class="px-3 py-1 align-top">
                <span>{row.material.name}</span>
                {#if row.material.isNatural}<span class="ml-1 text-xs text-ink-500">nat</span>{/if}
              </td>
              {#each row.cells as cell, i}
                <td class="px-3 py-1 text-right tabular-nums {diffClass(row.cells, i)}">
                  {#if cell == null}
                    <span class="text-ink-300">—</span>
                  {:else}
                    {diffIndicator(row.cells, i)} {formatPp1000(cell)}
                  {/if}
                  <span class="text-xs text-ink-400">{addedRemoved(row.cells, i)}</span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot class="bg-ink-50 text-sm">
          <tr class="font-semibold">
            <td class="px-3 py-1.5">Total</td>
            {#each data.trials as t}
              <td class="px-3 py-1.5 text-right tabular-nums" class:text-red-600={Math.abs(t.total - 1000) > 0.5}>
                {formatPp1000(t.total)}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="px-3 py-1.5">Cost / 30 g batch</td>
            {#each data.trials as t}
              <td class="px-3 py-1.5 text-right tabular-nums">
                {formatMoney(t.totalCostMinorPer30g, 'EUR')}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="px-3 py-1.5">Compliance (target cat)</td>
            {#each data.trials as t}
              <td class="px-3 py-1.5 text-right">
                <span class="inline-block h-2.5 w-2.5 rounded-full {statusDot(t.complianceStatus)}"></span>
                <span class="badge badge-{t.complianceStatus === 'pass' ? 'pass' : t.complianceStatus === 'warn' ? 'warn' : t.complianceStatus === 'fail' ? 'fail' : 'unknown'}">
                  {t.complianceStatus}
                </span>
                {#if t.failuresAtTarget > 0}<span class="text-xs text-ink-500 ml-1">({t.failuresAtTarget})</span>{/if}
              </td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Per-category compliance grid -->
    <div class="card overflow-x-auto">
      <h2 class="text-sm font-semibold p-3 border-b border-ink-200">Compliance across all categories</h2>
      <table class="min-w-full divide-y divide-ink-200 text-xs">
        <thead class="bg-ink-50">
          <tr>
            <th class="px-3 py-1.5 text-left font-semibold">Category</th>
            {#each data.trials as t}
              <th class="px-3 py-1.5 text-center font-semibold">{t.versionLabel}</th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white">
          {#each data.categories as cat}
            <tr>
              <td class="px-3 py-1">Cat {cat.code} — {cat.label}</td>
              {#each data.trials as t}
                {@const status = t.perCategory.find((p) => p.number === cat.number)?.status ?? 'unknown'}
                <td class="px-3 py-1 text-center">
                  <span class="inline-block h-2.5 w-2.5 rounded-full {statusDot(status)}" title={status}></span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
