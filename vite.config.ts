import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

const buildSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
})();
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { exclude: ['better-sqlite3'] },
  ssr: { noExternal: [] },
  build: { target: 'node20' },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
