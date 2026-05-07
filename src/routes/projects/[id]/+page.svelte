<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  export let data: PageData;
  let editing = false;

  function statusClass(s: string) {
    if (s === 'pass') return 'badge badge-pass';
    if (s === 'warn') return 'badge badge-warn';
    if (s === 'fail') return 'badge badge-fail';
    return 'badge badge-unknown';
  }
</script>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      {#if editing}
        <form
          method="POST"
          action="?/updateProject"
          use:enhance={() => () => (editing = false)}
          class="space-y-2"
        >
          <input name="name" required value={data.project.name} class="input text-2xl font-bold" />
          <textarea name="brief" rows="2" class="input" placeholder="Brief">{data.project.brief ?? ''}</textarea>
          <select name="targetCategoryNumber" class="input">
            {#each data.categories as c}
              <option value={c.number} selected={c.number === data.project.targetCategoryNumber}>
                Cat {c.code} — {c.label}
              </option>
            {/each}
          </select>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn" on:click={() => (editing = false)}>Cancel</button>
          </div>
        </form>
      {:else}
        <h1 class="text-2xl font-bold tracking-tight truncate">{data.project.name}</h1>
        {#if data.project.brief}
          <p class="mt-1 text-sm text-ink-700 max-w-3xl">{data.project.brief}</p>
        {/if}
        <p class="mt-2 text-xs text-ink-500">
          Target: Cat {data.categories.find((c) => c.number === data.project.targetCategoryNumber)?.code ?? '—'} —
          {data.categories.find((c) => c.number === data.project.targetCategoryNumber)?.label ?? '—'}
          <button class="ml-2 underline" on:click={() => (editing = true)}>edit</button>
        </p>
      {/if}
    </div>
    <div class="flex gap-2">
      {#if data.trials.length >= 2}
        <a href={`/projects/${data.project.id}/compare`} class="btn">Compare trials</a>
      {/if}
      <form method="POST" action="?/newTrial" use:enhance>
        <input type="hidden" name="versionLabel" value={`v${data.trials.length + 1}`} />
        <input type="hidden" name="compoundDosagePct" value="20" />
        <button class="btn btn-primary">+ New trial</button>
      </form>
    </div>
  </div>

  {#if data.trials.length === 0}
    <div class="card p-12 text-center">
      <h2 class="text-lg font-semibold">No trials yet</h2>
      <p class="mt-1 text-sm text-ink-600">Create your first trial to start formulating.</p>
    </div>
  {:else}
    <div class="card overflow-hidden">
      <table class="min-w-full divide-y divide-ink-200">
        <thead class="bg-ink-50">
          <tr class="text-left text-xs font-semibold uppercase text-ink-600">
            <th class="px-4 py-2">Version</th>
            <th class="px-4 py-2">Created</th>
            <th class="px-4 py-2">Components</th>
            <th class="px-4 py-2">Dosage in product</th>
            <th class="px-4 py-2">Compliance (target cat)</th>
            <th class="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100 bg-white">
          {#each data.trials as t}
            <tr>
              <td class="px-4 py-2 font-medium">
                <a href={`/projects/${data.project.id}/trials/${t.id}`} class="text-accent-600 hover:underline">
                  {t.versionLabel}
                </a>
                {#if t.parentTrialId}
                  <span class="ml-1 text-xs text-ink-500">(forked)</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-sm text-ink-600">{new Date(t.createdAt).toLocaleString()}</td>
              <td class="px-4 py-2 text-sm">{t.componentCount}</td>
              <td class="px-4 py-2 text-sm">{t.compoundDosagePct}%</td>
              <td class="px-4 py-2">
                <span class={statusClass(t.complianceStatus)}>
                  {t.complianceStatus}
                </span>
                {#if t.failuresAtTarget > 0}
                  <span class="ml-1 text-xs text-ink-500">({t.failuresAtTarget})</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-right">
                <form method="POST" action="?/forkTrial" use:enhance class="inline">
                  <input type="hidden" name="sourceTrialId" value={t.id} />
                  <button class="btn">Fork</button>
                </form>
                <form
                  method="POST"
                  action="?/deleteTrial"
                  use:enhance
                  class="inline"
                  on:submit|preventDefault={(e) => {
                    if (confirm('Delete this trial?')) (e.target as HTMLFormElement).submit();
                  }}
                >
                  <input type="hidden" name="trialId" value={t.id} />
                  <button class="btn">Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
