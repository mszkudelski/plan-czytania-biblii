import { defineConfig } from '@playwright/test';
import { e2eHeaders, validateE2eTarget } from './run-context.mjs';
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('Set E2E_BASE_URL.');
validateE2eTarget(baseURL);
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.mjs',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: e2eHeaders,
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    // API bodies contain access tokens. Do not retain traces or storageState.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
