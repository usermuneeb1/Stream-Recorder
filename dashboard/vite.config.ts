import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// FIX #21 — replace __BUILD_ID__ in dist/sw.js after build so each deploy
// gets a unique service-worker cache version (kills stale-shell white-screen).
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build' as const,
    closeBundle() {
      const swPath = resolve('dist/sw.js');
      if (!existsSync(swPath)) return;
      const buildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const src = readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, buildId);
      writeFileSync(swPath, src);
      // eslint-disable-next-line no-console
      console.log(`[stamp-service-worker] stamped sw.js with BUILD_ID=${buildId}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@vidstack')) return 'vidstack';
            if (id.includes('react-dom'))   return 'react-dom';
            if (id.includes('react/'))      return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
