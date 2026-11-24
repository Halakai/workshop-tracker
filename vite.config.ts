/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { manualsDev } from './scripts/manuals-dev.ts';

// On GitHub Pages everything lives under /<repo-name>/ (the deploy workflow sets BASE_PATH). The app is in /app/
// below that; the top level only forwards to it (scripts/build-root.mjs).
const base = `${process.env.BASE_PATH || '/'}app/`;

export default defineConfig({
  base,
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // the service worker caches the bundle on the phone; big rarely-used parts (PDF) are lazy-loaded.
  // Two pages: the app, and view.html (the website for the team and customers' pages, in the website's look).
  build: {
    outDir: 'dist/app',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        view: fileURLToPath(new URL('./view.html', import.meta.url)),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    manualsDev(base),
    VitePWA({
      // the app decides when to switch to a new version (src/app/UpdatePrompt.tsx), so nobody loses a half-typed entry
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Workshop Tracker',
        short_name: 'Workshop',
        description: 'Car flips, customer jobs, stock and money for our workshop',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#0c0f14',
        theme_color: '#0c0f14',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        // view.html is a page of its own, never the app
        navigateFallbackDenylist: [/view\.html/],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'site/src/**/*.test.ts', 'site/src/**/*.test.tsx', 'supabase/functions/**/*.test.ts'],
  },
});
