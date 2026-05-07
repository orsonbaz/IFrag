<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  export let data: PageData;
  let showNew = false;
</script>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Projects</h1>
      <p class="mt-1 text-sm text-ink-600">
        Each project groups related trials. Open a project to add versions, run compliance checks
        and log evaluations.
      </p>
    </div>
    <button class="btn btn-primary" on:click={() => (showNew = !showNew)}>
      {showNew ? 'Cancel' : 'New project'}
    </button>
  </div>

  {#if showNew}
    <form method="POST" action="?/create" use:enhance class="card p-4 space-y-3">
      <div>
        <label for="name" class="block text-sm font-medium">Name</label>
        <input id="name" name="name" required class="input mt-1" placeholder="Spring 2026 EDP" />
      </div>
      <div>
        <label for="brief" class="block text-sm font-medium">Brief / intent</label>
        <textarea id="brief" name="brief" rows="2" class="input mt-1" placeholder="What's the idea?" />
      </div>
      <div>
        <label for="targetCategoryNumber" class="block text-sm font-medium">Target IFRA category</label>
        <select id="targetCategoryNumber" name="targetCategoryNumber" class="input mt-1">
          <option value="4">Cat 4 — Fine fragrance (default)</option>
          <option value="51">Cat 5A — Body lotion</option>
          <option value="52">Cat 5B — Face cream</option>
          <option value="2">Cat 2 — Deodorant / body spray</option>
          <option value="12">Cat 12 — Candles / no skin contact</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary">Create project</button>
    </form>
  {/if}

  {#if data.projects.length === 0}
    <div class="card p-12 text-center">
      <h2 class="text-lg font-semibold">No projects yet</h2>
      <p class="mt-1 text-sm text-ink-600">Create your first project to start formulating.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.projects as p}
        <a href={`/projects/${p.id}`} class="card p-4 hover:border-accent-500 transition">
          <h3 class="font-semibold text-ink-900 truncate">{p.name}</h3>
          {#if p.brief}
            <p class="mt-1 text-sm text-ink-600 line-clamp-2">{p.brief}</p>
          {/if}
          <div class="mt-3 flex items-center gap-3 text-xs text-ink-500">
            <span>{p.trialCount} trial{p.trialCount === 1 ? '' : 's'}</span>
            {#if p.targetCategoryNumber}
              <span>• Cat {p.targetCategoryNumber}</span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
