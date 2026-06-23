import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
