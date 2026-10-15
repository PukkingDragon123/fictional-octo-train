import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (GitHub Pages, artifacts, the bundled server).
export default defineConfig({
  base: './',
  // NOHMR=1: no hot reload (stable headless screenshots while files change)
  server: { host: true, port: 5173, hmr: process.env.NOHMR ? false : undefined },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: false, // one stylesheet, so single-page packaging can inline all of it
    chunkSizeWarningLimit: 4000,
  },
});
