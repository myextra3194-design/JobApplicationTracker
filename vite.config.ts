/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Arena live preview reaches this server through a proxied host
// (https://<port>-<sandboxId>.e2b.app), so: bind all interfaces, allow any
// Host header, and keep the HMR websocket on the same origin the browser used.
export default defineConfig({
  // Relative base so the same `dist/` works from any path: GitHub Pages
  // project sites (https://<user>.github.io/<repo>/), custom domains, and
  // local `vite preview`. The dev server ignores it and serves from '/'.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
