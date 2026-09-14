import { defineConfig } from '@playwright/test';

// Browser smoke tests for the rendered UI. In CI the workflow installs the
// matching Chromium via `npx playwright install --with-deps chromium`.
// Locally you can point at an existing Chromium build with
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npx playwright test
export default defineConfig({
  testDir: './tests',
  testMatch: /smoke\.spec\.js$/,
  timeout: 30_000,
  use: {
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
  workers: 1,
});
