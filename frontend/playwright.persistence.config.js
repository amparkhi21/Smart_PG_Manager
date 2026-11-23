import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'resident-bed-persistence.spec.js', workers: 1, fullyParallel: false,
  timeout: 180000, expect: { timeout: 15000 }, reporter: 'list',
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
});
