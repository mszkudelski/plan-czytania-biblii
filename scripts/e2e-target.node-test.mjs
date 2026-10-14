import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateE2eTarget } from '../e2e/run-context.mjs';
const env = { E2E_RUN_TOKEN: 'a'.repeat(64), E2E_PRODUCTION: '1', EXPECTED_COMMIT: 'b'.repeat(40) };
test('production requires an explicit opt-in, exact commit and cleanup capability', () => {
  assert.doesNotThrow(() => validateE2eTarget('https://plan-czytania.netlify.app', env));
  for (const override of [{ E2E_RUN_TOKEN: '' }, { E2E_PRODUCTION: '' }, { EXPECTED_COMMIT: '' }]) {
    assert.throws(() => validateE2eTarget('https://plan-czytania.netlify.app', { ...env, ...override }));
  }
  assert.doesNotThrow(() => validateE2eTarget('https://' + 'a'.repeat(24) + '--plan-czytania.netlify.app', env));
  for (const url of ['https://elsewhere.test', 'http://plan-czytania.netlify.app', 'https://plan-czytania.netlify.app/api', 'https://user:password@plan-czytania.netlify.app']) assert.throws(() => validateE2eTarget(url, env));
});
