import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * `/api` and `/uploads` are both proxied.
     *
     * Same-origin in development means the app runs against the same relative
     * paths it will use in production, so nothing about CORS or cookie scope
     * changes between the two.
     *
     * `/uploads` is not optional: images added through the admin are served by
     * the API from disk, and without this every merchant-uploaded photograph
     * resolves against the Vite origin and 404s — while the seeded external URLs
     * keep working, which makes it look like the upload itself failed.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
