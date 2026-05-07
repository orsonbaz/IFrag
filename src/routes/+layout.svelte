<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

  $: nav = [
    { href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/projects') },
    { href: '/materials', label: 'Materials', match: (p: string) => p.startsWith('/materials') },
    { href: '/ifra', label: 'IFRA', match: (p: string) => p.startsWith('/ifra') },
    { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') }
  ];
</script>

<div class="min-h-full bg-ink-50">
  <header class="border-b border-ink-200 bg-white/80 backdrop-blur sticky top-0 z-30">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-14 items-center justify-between">
        <a href="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span class="inline-block h-6 w-6 rounded-full bg-accent-500"></span>
          IFrag
        </a>
        <nav class="flex items-center gap-1">
          {#each nav as item}
            <a
              href={item.href}
              class="rounded-md px-3 py-1.5 text-sm font-medium transition {item.match($page.url.pathname)
                ? 'bg-ink-200 text-ink-900'
                : 'text-ink-700 hover:bg-ink-100'}"
            >
              {item.label}
            </a>
          {/each}
        </nav>
      </div>
    </div>
    {#if data.amendment?.isStarter}
      <div class="bg-amber-100 border-t border-amber-300 px-4 py-1.5 text-xs text-amber-900">
        <div class="mx-auto max-w-7xl">
          IFRA amendment <strong>{data.amendment.version}</strong> is a starter dataset for convenience.
          Re-import the official IFRA standards before relying on this for any commercial product —
          go to <a class="underline font-semibold" href="/ifra">IFRA → Import</a>.
        </div>
      </div>
    {/if}
  </header>
  <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <slot />
  </main>
</div>
