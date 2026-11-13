import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths, so a build works from any folder or host path.
  base: './',
  // Listen on the local network too, so the app can be opened from a phone on the same Wi-Fi.
  server: { host: true },
  preview: { host: true, port: 4173 },
  build: {
    // Konva and React make up most of the bundle; it is an app loaded once.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
