import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    /**
     * `/api` and `/uploads` are both proxied.
     *
     * The second one matters: uploaded images are served by the API, and without
     * the proxy every thumbnail in the media library would resolve against the
     * Vite origin and 404. Proxying both means the admin uses the same relative
     * paths in development that it will use in production.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
