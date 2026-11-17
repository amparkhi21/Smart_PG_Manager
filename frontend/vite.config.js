import { defineConfig, loadEnv } from 'vite';
import { resolveApiBaseUrl } from './src/api/config.js';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const productionApiUrl = command === 'build' ? resolveApiBaseUrl(env.VITE_API_BASE_URL, true) : undefined;
  return {
    plugins: [react(), tailwindcss()],
    // Inline the resolved public URL so even a local .env cannot leak localhost into dist.
    define: command === 'build' ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(productionApiUrl) } : {},
    server: {
      port: 5173,
      // Development only; production always uses the resolved HTTPS API URL.
      proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
    },
  };
});
