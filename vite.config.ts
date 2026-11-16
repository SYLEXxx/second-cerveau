import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Deux sorties :
// - par défaut : application web installable (PWA) + base de l'app Android (Capacitor) ;
// - `--mode single` : un seul fichier HTML autonome, pratique pour un aperçu.
export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2021',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  plugins:
    mode === 'single'
      ? [viteSingleFile()]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['icon.svg'],
            workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], maximumFileSizeToCacheInBytes: 6_000_000 },
            manifest: {
              name: 'Second cerveau',
              short_name: 'Cerveau',
              description: 'Notes, bases de données, graphe et budget, hors ligne.',
              lang: 'fr',
              start_url: './',
              display: 'standalone',
              background_color: '#0f172a',
              theme_color: '#7c3aed',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
              ],
            },
          }),
        ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
