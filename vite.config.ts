import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { exclude: ['better-sqlite3'] },
  ssr: { noExternal: [] },
  build: { target: 'node20' },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
