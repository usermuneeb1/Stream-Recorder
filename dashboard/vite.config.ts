import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// In dev, serve the repo's data/ directory at /data/* so the app can read
// the real archive index without depending on the CDN (works offline and in
// sandboxed previews). Production builds never see this middleware.
function serveLocalData() {
  const DATA_ROOT = resolve(import.meta.dirname, '..', 'data');
  return {
    name: 'serve-local-data',
    apply: 'serve' as const,
    configureServer(server: any) {
      server.middlewares.use('/data', (req: any, res: any, next: any) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(DATA_ROOT, rel);
        if (file.startsWith(DATA_ROOT + sep) && existsSync(file)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(readFileSync(file, 'utf8'));
          return;
        }
        next();
      });
    },
  };
}

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
  plugins: [react(), serveLocalData(), stampServiceWorker()],
  base: '/',
  server: {
    host: '0.0.0.0',
    // Sandboxed preview hosts vary per session — allow any host so the
    // live preview (and local LAN access) works out of the box.
    allowedHosts: true,
    // In production, Vercel serverless functions power /api/* (storyboard
    // VTT proxy, live YouTube endpoints, etc.). In dev there is no Vercel,
    // so proxy those routes to the deployed instance — this makes the
    // storyboard hover-preview thumbnails and live feeds work locally too.
    proxy: {
      '/api': {
        target: 'https://muslim-lantern-archive.vercel.app',
        changeOrigin: true,
      },
    },
  },
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
