<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
</script>

<div class="min-h-screen flex items-center justify-center p-6 bg-ink-50">
  <div class="card p-6 max-w-2xl w-full space-y-3">
    <h1 class="text-xl font-bold">Something went wrong</h1>
    <p class="text-sm text-ink-700">{$page.error?.message ?? 'Unknown error'}</p>
    {#if $page.status}<p class="text-xs text-ink-500">HTTP {$page.status}</p>{/if}
    <details class="text-xs">
      <summary>Diagnostic</summary>
      <pre class="bg-ink-100 p-2 mt-1 overflow-auto">{JSON.stringify($page.error, null, 2)}</pre>
    </details>
    <a href={`${base}/`} class="btn">Reload home</a>
  </div>
</div>
