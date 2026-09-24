import { defineConfig } from '@playwright/test';

/**
 * Rendered-layout checks that `node --test` cannot make: these need an
 * actual browser laying out actual CSS at an actual viewport width.
 * Kept separate from the `node --test` unit suite (different runner,
 * different cost - a browser + dev server per run) rather than folded
 * into `npm test`. Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4321',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    },
  },
  webServer: {
    command: 'npm run dev -- -p 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
