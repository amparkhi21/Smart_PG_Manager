import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'portal-features.spec.js', workers: 1, fullyParallel: false,
  outputDir: '../tmp/portal-browser-results',
  timeout: 120000, expect: { timeout: 15000 }, reporter: 'list',
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
});
