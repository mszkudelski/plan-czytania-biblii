import { defineConfig } from '@playwright/test';
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('Set E2E_BASE_URL to a Netlify preview or develop deploy.');
const url = new URL(baseURL);
if (url.protocol !== 'https:' || !/^(?:develop|deploy-preview-\d+|[a-f0-9]{24})--plan-czytania\.netlify\.app$/.test(url.hostname)) {
  throw new Error('E2E may only write to the non-production plan-czytania deploys.');
}
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
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    // API bodies contain access tokens. Do not retain traces or storageState.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
