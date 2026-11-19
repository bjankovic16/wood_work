import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { offlineViewerPlugin } from './scripts/offline-viewer-plugin.ts';
import { offlineAppPlugin } from './scripts/offline-app-plugin.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineViewerPlugin(), offlineAppPlugin()],
  // Relative asset paths, so a build works from any folder or host path.
  base: './',
  // Listen on the local network too, so the app can be opened from a phone on the same Wi-Fi.
  server: { host: true },
  preview: { host: true, port: 4173 },
  build: {
    // three.js alone is about 700 kB minified; it loads only when the 3D view opens.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app. In files of their own they stay in the visitor's browser
        // cache across app updates, and they download in parallel with the app code.
        codeSplitting: {
          groups: [
            { name: 'model-exporter', test: /[\\/]three[\\/]examples[\\/]jsm[\\/]exporters[\\/]GLTFExporter\.js$/, priority: 40 },
            // React and the small helpers both the app and the 3D libraries use, so the first screen never pulls in 3D code.
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store|@babel[\\/]runtime)[\\/]/, priority: 30 },
            { name: 'plan-canvas', test: /[\\/]node_modules[\\/](konva|react-konva|react-reconciler)[\\/]/, priority: 20 },
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 20 },
            { name: 'three-react', test: /[\\/]node_modules[\\/](@react-three|three-stdlib|@monogrid)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
