import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const disableHmr = process.env.DISABLE_HMR === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: !disableHmr,
    watch: disableHmr ? null : {},
    // Development tunnels may use a different hostname on each run.
    allowedHosts: true,
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
