<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import type { PageData } from './$types';
  import { formatPp1000, formatPct, formatMoney } from '$lib/utils/format';
  import { getDb } from '$lib/db/client';
  import {
    addEvaluation as addEvaluationDb,
    deleteEvaluation as deleteEvaluationDb,
    promoteToAccord as promoteToAccordDb,
    saveTrial as saveTrialDb
  } from '$lib/db/mutations';
  import { downloadCertificate } from '$lib/pdf/download';

  export let data: PageData;

  type Row = {
    id?: number;
    materialId: number;
    materialName: string;
    cas: string | null;
    isNatural: boolean;
    isAccord: boolean;
    partsPer1000: number;
    sortOrder: number;
    note: string | null;
    dilutionPct: number;
    priceMinor: number | null;
    currency: string;
  };

  let rows: Row[] = data.components.map((c) => ({
    id: c.id,
    materialId: c.materialId,
    materialName: c.materialName,
    cas: c.cas,
    isNatural: !!c.isNatural,
    isAccord: !!c.isAccord,
    partsPer1000: c.partsPer1000,
    sortOrder: c.sortOrder,
    note: c.note,
    dilutionPct: c.dilutionPct,
    priceMinor: c.priceMinor,
    currency: c.currency
  }));

  let compoundDosagePct = data.trial.compoundDosagePct;
  let targetCategoryNumber = data.trial.targetCategoryNumber ?? data.project.targetCategoryNumber ?? 4;
  let versionLabel = data.trial.versionLabel;
  let notes = data.trial.notes ?? '';
  let displayUnit: 'pp1000' | 'pct' | 'grams' = data.settings?.defaultUnitDisplay ?? 'pp1000';
  let batchG = data.settings?.defaultBatchG ?? 30;

  let materialPickerOpen = false;
  let materialPickerSearch = '';
  let dirty = false;
  $: if (rows || compoundDosagePct || targetCategoryNumber || versionLabel || notes) dirty = true;

  $: total = rows.reduce((s, r) => s + (r.partsPer1000 || 0), 0);
  $: totalCostMinor = rows.reduce(
    (s, r) => s + (r.priceMinor != null ? (r.partsPer1000 / 1000) * batchG * r.priceMinor : 0),
    0
  );

  $: filteredMaterials = data.materials.filter((m) =>
    m.name.toLowerCase().includes(materialPickerSearch.toLowerCase())
  );

  function addMaterial(materialId: number) {
    const m = data.materials.find((x) => x.id === materialId);
    if (!m) return;
    if (rows.some((r) => r.materialId === materialId)) {
      materialPickerOpen = false;
      return;
    }
    rows = [
      ...rows,
      {
        materialId: m.id,
        materialName: m.name,
        cas: m.cas,
        isNatural: !!m.isNatural,
        isAccord: !!(m as any).isAccord,
        partsPer1000: 0,
        sortOrder: rows.length,
        note: null,
        dilutionPct: m.dilutionPct,
        priceMinor: m.priceMinor,
        currency: m.currency
      }
    ];
    materialPickerOpen = false;
    materialPickerSearch = '';
  }

  function removeRow(idx: number) {
    rows = rows.filter((_, i) => i !== idx);
  }

  function balanceWith(materialId: number) {
    const remaining = 1000 - rows.reduce((s, r) => s + (r.partsPer1000 || 0), 0);
    if (remaining <= 0) return;
    const existing = rows.findIndex((r) => r.materialId === materialId);
    if (existing >= 0) {
      rows = rows.map((r, i) => (i === existing ? { ...r, partsPer1000: r.partsPer1000 + remaining } : r));
    } else {
      const m = data.materials.find((x) => x.id === materialId);
      if (!m) return;
      rows = [
        ...rows,
        {
          materialId,
          materialName: m.name,
          cas: m.cas,
          isNatural: !!m.isNatural,
          isAccord: !!(m as any).isAccord,
          partsPer1000: remaining,
          sortOrder: rows.length,
          note: 'auto-balance',
          dilutionPct: m.dilutionPct,
          priceMinor: m.priceMinor,
          currency: m.currency
        }
      ];
    }
  }

  function rowDisplayValue(r: Row) {
    if (displayUnit === 'pp1000') return r.partsPer1000;
    if (displayUnit === 'pct') return r.partsPer1000 / 10;
    return ((r.partsPer1000 / 1000) * batchG).toFixed(3);
  }

  function setRowDisplayValue(r: Row, v: number) {
    if (displayUnit === 'pp1000') r.partsPer1000 = v;
    else if (displayUnit === 'pct') r.partsPer1000 = v * 10;
    else if (displayUnit === 'grams' && batchG > 0) r.partsPer1000 = (v / batchG) * 1000;
    rows = rows;
  }

  function statusClass(s: string) {
    if (s === 'pass') return 'badge badge-pass';
    if (s === 'warn') return 'badge badge-warn';
    if (s === 'fail') return 'badge badge-fail';
    return 'badge badge-unknown';
  }

  function statusDot(s: string) {
    if (s === 'pass') return 'bg-emerald-500';
    if (s === 'warn') return 'bg-amber-500';
    if (s === 'fail') return 'bg-red-500';
    return 'bg-ink-300';
  }

  function rowTint(r: Row, meta: any) {
    const failures = (data.perCategory.find((p) => p.category.number === targetCategoryNumber)?.failures ?? []).filter(
      (f) => f.contributors.some((c) => c.componentId === r.id)
    );
    if (failures.some((f) => f.severity === 'prohibited')) return 'bg-red-50';
    if (failures.some((f) => f.severity === 'over_limit')) return 'bg-orange-50';
    if (failures.some((f) => f.severity === 'specification')) return 'bg-amber-50';
    if (meta?.directStandards.length === 0 && meta?.annexCount === 0 && r.cas) return 'bg-ink-50';
    return '';
  }

  let expandedCat: number | null = null;
  function toggleCat(n: number) {
    expandedCat = expandedCat === n ? null : n;
  }

  $: targetVerdict = data.perCategory.find((p) => p.category.number === targetCategoryNumber);

  const sortedTopCosts = () => {
    return [...rows]
      .filter((r) => r.priceMinor != null)
      .map((r) => ({
        name: r.materialName,
        costMinor: ((r.partsPer1000 / 1000) * batchG * (r.priceMinor as number))
      }))
      .sort((a, b) => b.costMinor - a.costMinor)
      .slice(0, 5);
  };

  let saving = false;

  // Stage form for evaluations
  let evalStage: 'top' | 'heart' | 'base' | 'drydown' | 'overall' = 'top';
  let evalElapsed = '';
  let evalRating = '';
  let evalNotes = '';

  async function saveAll() {
    saving = true;
    try {
      const db = await getDb();
      saveTrialDb(db, data.trial.id, {
        versionLabel,
        compoundDosagePct,
        targetCategoryNumber,
        notes: notes.trim() || null,
        components: rows.map((r) => ({
          id: r.id,
          materialId: r.materialId,
          partsPer1000: r.partsPer1000,
          sortOrder: r.sortOrder,
          note: r.note
        }))
      });
      await invalidateAll();
      dirty = false;
    } finally {
      saving = false;
    }
  }

  async function promoteAccord() {
    const proposed = data.accord?.name ?? `${data.project.name} — ${data.trial.versionLabel} accord`;
    const name = window.prompt(
      data.accord
        ? 'Update accord name (already published as a material):'
        : 'Save this trial as a reusable Accord. It will appear in the materials picker.\nName for the accord:',
      proposed
    );
    if (!name) return;
    const db = await getDb();
    promoteToAccordDb(db, data.trial.id, name.trim());
    await invalidateAll();
  }

  async function downloadCert() {
    await downloadCertificate(data.trial.id);
  }

  async function addEval() {
    const db = await getDb();
    addEvaluationDb(db, data.trial.id, {
      stage: evalStage,
      elapsedMinutes: evalElapsed ? Number(evalElapsed) : null,
      rating: evalRating ? Number(evalRating) : null,
      notes: evalNotes.trim() || null
    });
    evalStage = 'top';
    evalElapsed = '';
    evalRating = '';
    evalNotes = '';
    await invalidateAll();
  }

  async function removeEval(id: number) {
    const db = await getDb();
    deleteEvaluationDb(db, id);
    await invalidateAll();
  }
</script>

<div class="space-y-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <a href={`${base}/projects/${data.project.id}`} class="text-xs text-ink-500 hover:underline">
        ← {data.project.name}
      </a>
      <input
        bind:value={versionLabel}
        class="input mt-1 text-2xl font-bold"
        style="width: auto; min-width: 12ch"
      />
    </div>
    <div class="flex items-center gap-2">
      <div class="text-xs text-ink-500">
        Total: <strong class:text-red-600={Math.abs(total - 1000) > 0.5}>{formatPp1000(total)}</strong> / 1000
      </div>
      <select bind:value={displayUnit} class="input text-xs" style="width:auto">
        <option value="pp1000">pp1000</option>
        <option value="pct">%</option>
        <option value="grams">grams</option>
      </select>
      {#if displayUnit === 'grams'}
        <input
          type="number"
          bind:value={batchG}
          min="1"
          step="0.5"
          class="input text-xs w-20"
          aria-label="Batch size in grams"
        />
        <span class="text-xs text-ink-500">g batch</span>
      {/if}
      <button
        type="button"
        class="btn"
        on:click={promoteAccord}
        title="Make this trial usable as a single ingredient in other trials"
      >
        {data.accord ? '↻ Update accord' : '☆ Save as Accord'}
      </button>
      <button type="button" class="btn" on:click={downloadCert} title="Download IFRA conformity certificate as PDF">
        ⬇ Certificate (PDF)
      </button>
      <button class="btn btn-primary" disabled={saving} on:click={saveAll}>
        {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
    <!-- LEFT: Ingredient table -->
    <div class="lg:col-span-3 card overflow-visible">
      <div class="flex items-center justify-between border-b border-ink-200 px-4 py-2">
        <h2 class="text-sm font-semibold text-ink-700">Ingredients</h2>
        <div class="relative">
          <button
            class="btn btn-primary"
            on:click={() => (materialPickerOpen = !materialPickerOpen)}
          >
            + Add
          </button>
          {#if materialPickerOpen}
            <div
              class="absolute right-0 top-9 z-20 w-80 max-h-96 overflow-auto card bg-white shadow-lg"
              role="dialog"
            >
              <input
                placeholder="Search materials…"
                bind:value={materialPickerSearch}
                class="input border-0 border-b rounded-none"
                autofocus
              />
              <ul class="divide-y divide-ink-100">
                {#each filteredMaterials.slice(0, 100) as m}
                  <li>
                    <button
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-ink-50"
                      on:click={() => addMaterial(m.id)}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="truncate">{m.name}</span>
                        <span class="text-xs text-ink-500 shrink-0">
                          {#if m.isAccord}<span class="text-accent-600 font-medium">📦 accord</span>{:else if m.isNatural}natural{/if}
                        </span>
                      </div>
                      {#if m.cas}<div class="text-xs text-ink-400">CAS {m.cas}</div>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
      <table class="min-w-full divide-y divide-ink-100">
        <thead class="bg-ink-50">
          <tr class="text-left text-xs uppercase font-semibold text-ink-600">
            <th class="px-3 py-1.5 w-1/3">Material</th>
            <th class="px-3 py-1.5 text-right">{displayUnit === 'pp1000' ? 'pp1000' : displayUnit === 'pct' ? '%' : 'g'}</th>
            <th class="px-3 py-1.5 text-right">cost</th>
            <th class="px-3 py-1.5 w-1/4">note</th>
            <th class="px-3 py-1.5 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white">
          {#each rows as r, i (r.materialId)}
            {@const meta = data.componentMeta.find((m) => m.componentId === r.id)}
            <tr class={rowTint(r, meta)}>
              <td class="px-3 py-1.5">
                <div class="font-medium text-sm flex items-center gap-1.5">
                  {#if r.isAccord}
                    <span class="badge bg-accent-500/15 text-accent-600" title="Accord — flattens into its constituents for compliance">📦 ACCORD</span>
                  {/if}
                  <span>{r.materialName}</span>
                </div>
                <div class="flex items-center gap-2 text-xs text-ink-500">
                  {#if r.cas}<span>CAS {r.cas}</span>{/if}
                  {#if r.dilutionPct < 100}
                    <span class="badge badge-unknown">{r.dilutionPct}% dilution</span>
                  {/if}
                  {#if meta?.directStandards.length}
                    {#each meta.directStandards as s}
                      <span class="badge {s.type === 'prohibition' ? 'badge-fail' : s.type === 'restriction' ? 'badge-warn' : 'badge-unknown'}">
                        {s.type === 'prohibition' ? '⚠ prohibited' : s.type === 'restriction' ? 'restricted' : 'spec'}
                      </span>
                    {/each}
                  {/if}
                  {#if meta && meta.annexCount > 0}
                    <span class="badge badge-unknown">{meta.annexCount} annex constituent{meta.annexCount === 1 ? '' : 's'}</span>
                  {/if}
                </div>
              </td>
              <td class="px-3 py-1.5 text-right">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  class="input text-right w-24"
                  value={rowDisplayValue(r)}
                  on:input={(e) => setRowDisplayValue(r, Number((e.currentTarget as HTMLInputElement).value))}
                />
              </td>
              <td class="px-3 py-1.5 text-right text-sm text-ink-600">
                {formatMoney(r.priceMinor != null ? Math.round((r.partsPer1000 / 1000) * batchG * r.priceMinor) : null, r.currency)}
              </td>
              <td class="px-3 py-1.5">
                <input
                  bind:value={r.note}
                  class="input text-xs"
                  placeholder="—"
                />
              </td>
              <td class="px-3 py-1.5 text-right">
                <button
                  class="text-xs text-ink-500 hover:text-red-600"
                  on:click={() => removeRow(i)}
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          {/each}
          {#if rows.length === 0}
            <tr><td colspan="5" class="px-3 py-6 text-center text-sm text-ink-500">No ingredients yet — add some above.</td></tr>
          {/if}
        </tbody>
        <tfoot class="bg-ink-50">
          <tr class="text-sm font-medium">
            <td class="px-3 py-1.5">Total</td>
            <td class="px-3 py-1.5 text-right" class:text-red-600={Math.abs(total - 1000) > 0.5}>
              {displayUnit === 'pp1000' ? formatPp1000(total) : displayUnit === 'pct' ? formatPct(total / 10) : ((total / 1000) * batchG).toFixed(2) + ' g'}
              <span class="text-xs text-ink-500"> / {displayUnit === 'pp1000' ? '1000' : displayUnit === 'pct' ? '100%' : batchG + ' g'}</span>
            </td>
            <td class="px-3 py-1.5 text-right">{formatMoney(Math.round(totalCostMinor), 'EUR')}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
      {#if Math.abs(total - 1000) > 0.5}
        <div class="border-t border-ink-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 flex items-center gap-2">
          <span>Off by {formatPp1000(1000 - total)} parts. Balance with:</span>
          <select
            class="input text-xs"
            style="width:auto"
            on:change={(e) => {
              const v = Number((e.currentTarget as HTMLSelectElement).value);
              if (v) balanceWith(v);
              (e.currentTarget as HTMLSelectElement).value = '';
            }}
          >
            <option value="">— pick —</option>
            {#each data.materials.filter((m) => /solvent|alcohol|ethanol|dpg|ipm|tec/i.test(m.name) || rows.some((r) => r.materialId === m.id)) as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- RIGHT: Compliance / cost / evaluation -->
    <div class="lg:col-span-2 space-y-4">
      <!-- COMPLIANCE -->
      <div class="card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-ink-700">IFRA compliance</h2>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs">
            <span class="block text-ink-600">Target category</span>
            <select bind:value={targetCategoryNumber} class="input mt-0.5">
              {#each data.categories as c}
                <option value={c.number}>Cat {c.code} — {c.label}</option>
              {/each}
            </select>
          </label>
          <label class="text-xs">
            <span class="block text-ink-600">Compound dosage in product</span>
            <div class="flex items-center gap-1">
              <input type="range" min="0.1" max="100" step="0.1" bind:value={compoundDosagePct} class="flex-1" />
              <input type="number" min="0" max="100" step="0.1" bind:value={compoundDosagePct} class="input w-16 text-right" />
              <span class="text-xs text-ink-500">%</span>
            </div>
          </label>
        </div>

        {#if data.standardsAvailable === 0}
          <p class="text-xs text-amber-700">
            No IFRA standards loaded yet. Compliance shown as pass for everything. Import an amendment in
            <a href="/ifra" class="underline">IFRA → Import</a>.
          </p>
        {/if}

        <div class="border border-ink-200 rounded overflow-hidden">
          <div class="bg-ink-50 px-3 py-1.5 text-xs uppercase font-semibold text-ink-600 grid grid-cols-12 gap-2">
            <span class="col-span-2">Cat</span>
            <span class="col-span-7">Label</span>
            <span class="col-span-3 text-right">Status</span>
          </div>
          <ul class="divide-y divide-ink-100">
            {#each data.perCategory as p}
              {@const isTarget = p.category.number === targetCategoryNumber}
              <li class={isTarget ? 'bg-accent-500/5' : ''}>
                <button
                  class="w-full text-left px-3 py-1.5 grid grid-cols-12 gap-2 items-center hover:bg-ink-50"
                  on:click={() => toggleCat(p.category.number)}
                >
                  <span class="col-span-2 text-xs font-mono">{p.category.code}</span>
                  <span class="col-span-7 text-sm truncate">{p.category.label}</span>
                  <span class="col-span-3 text-right flex justify-end items-center gap-1">
                    {#if p.failures.length > 0}
                      <span class="text-xs text-ink-500">{p.failures.length}</span>
                    {/if}
                    <span class="inline-block h-2.5 w-2.5 rounded-full {statusDot(p.status)}"></span>
                    <span class={statusClass(p.status)}>{p.status}</span>
                  </span>
                </button>
                {#if expandedCat === p.category.number}
                  <div class="bg-white px-3 py-2 border-t border-ink-100 text-xs">
                    {#if p.failures.length === 0}
                      <p class="text-ink-500">No issues for Cat {p.category.code}.</p>
                    {/if}
                    {#each p.failures as f}
                      <div class="mb-2">
                        <div class="font-semibold">
                          {f.standardName}
                          <span class="badge {f.severity === 'prohibited' ? 'badge-fail' : f.severity === 'over_limit' ? 'badge-fail' : 'badge-warn'} ml-1">
                            {f.severity.replace('_', ' ')}
                          </span>
                        </div>
                        {#if f.severity === 'over_limit' && f.limitPct != null}
                          <div class="text-ink-600">
                            actual {formatPct(f.actualInProductPct)} in product &gt; limit {formatPct(f.limitPct)}
                          </div>
                        {/if}
                        {#if f.severity === 'prohibited'}
                          <div class="text-ink-600">prohibited at any concentration</div>
                        {/if}
                        {#if f.reason}
                          <div class="text-ink-500 italic">{f.reason}</div>
                        {/if}
                        <ul class="mt-1 ml-3 list-disc text-ink-600">
                          {#each f.contributors as c}
                            <li>
                              {c.materialName}
                              <span class="text-ink-400">({c.via}, {formatPct(c.effectivePctInCompound)} in compound)</span>
                            </li>
                          {/each}
                        </ul>
                      </div>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>

        {#if data.warnings.length > 0}
          <div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
            <div class="font-semibold">Notes</div>
            {#each data.warnings as w}
              <div>• {w}</div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- COST -->
      <div class="card p-4 space-y-2">
        <h2 class="text-sm font-semibold text-ink-700">Cost</h2>
        <div class="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div class="text-xs text-ink-500">/ g</div>
            <div class="font-mono">{formatMoney(Math.round(totalCostMinor / batchG), 'EUR')}</div>
          </div>
          <div>
            <div class="text-xs text-ink-500">/ 10 g</div>
            <div class="font-mono">{formatMoney(Math.round((totalCostMinor / batchG) * 10), 'EUR')}</div>
          </div>
          <div>
            <div class="text-xs text-ink-500">/ 100 g</div>
            <div class="font-mono">{formatMoney(Math.round((totalCostMinor / batchG) * 100), 'EUR')}</div>
          </div>
        </div>
        <div class="pt-2 border-t border-ink-100">
          <div class="text-xs uppercase text-ink-500 mb-1">Top cost drivers (this batch)</div>
          <ul class="text-xs space-y-0.5">
            {#each sortedTopCosts() as t}
              <li class="flex justify-between">
                <span class="truncate">{t.name}</span>
                <span class="font-mono ml-2">{formatMoney(Math.round(t.costMinor), 'EUR')}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <!-- NOTES -->
      <div class="card p-4 space-y-2">
        <h2 class="text-sm font-semibold text-ink-700">Trial notes</h2>
        <textarea bind:value={notes} rows="3" class="input text-sm" placeholder="What were you going for? What changed from last version?"></textarea>
      </div>

      <!-- EVALUATIONS -->
      <div class="card p-4 space-y-2">
        <h2 class="text-sm font-semibold text-ink-700">Olfactory evaluations</h2>
<form on:submit|preventDefault={addEval} class="space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <select bind:value={evalStage} class="input text-xs">
              <option value="top">Top</option>
              <option value="heart">Heart</option>
              <option value="base">Base</option>
              <option value="drydown">Dry-down</option>
              <option value="overall">Overall</option>
            </select>
            <input bind:value={evalElapsed} type="number" min="0" placeholder="min elapsed" class="input text-xs" />
            <select bind:value={evalRating} class="input text-xs">
              <option value="">rating</option>
              <option value="1">★</option>
              <option value="2">★★</option>
              <option value="3">★★★</option>
              <option value="4">★★★★</option>
              <option value="5">★★★★★</option>
            </select>
          </div>
          <textarea bind:value={evalNotes} rows="2" class="input text-sm" placeholder="What do you smell?"></textarea>
          <button class="btn" type="submit">+ Log evaluation</button>
        </form>
        <ul class="space-y-1 max-h-64 overflow-auto">
          {#each data.evaluations as e}
            <li class="border-l-2 border-accent-500 pl-2 py-1 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-medium uppercase">{e.stage}</span>
                <span class="text-ink-500">
                  {new Date(e.evaluatedAt).toLocaleString()}
                  {#if e.elapsedMinutes != null}• {e.elapsedMinutes} min{/if}
                  {#if e.rating}• {'★'.repeat(e.rating)}{/if}
                </span>
              </div>
              {#if e.notes}<div class="text-ink-700">{e.notes}</div>{/if}
              <button class="text-xs text-ink-400 hover:text-red-600 mt-1" on:click={() => removeEval(e.id)}>delete</button>
            </li>
          {/each}
          {#if data.evaluations.length === 0}
            <li class="text-xs text-ink-500">No evaluations yet.</li>
          {/if}
        </ul>
      </div>
    </div>
  </div>
</div>
