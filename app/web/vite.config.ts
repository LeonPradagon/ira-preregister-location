import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Allows a public frontend tunnel to reach the local API through the
      // same origin when VITE_API_URL=/v1 is used.
      // This dev server is intentionally exposed through Cloudflare Tunnel.
      // Vite's host check is disabled here because the tunnel hostname can be
      // regenerated between runs; the backend CORS list remains restricted.
      allowedHosts: true as const,
      proxy: {
        '/v1': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
