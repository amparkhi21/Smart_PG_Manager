import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.js', fullyParallel: false, workers: 1,
  timeout: 30000, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --configLoader runner --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179', reuseExistingServer: false,
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:4179/api' },
  },
});
