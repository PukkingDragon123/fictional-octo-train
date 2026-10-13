import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (GitHub Pages, artifacts, the bundled server).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
});
