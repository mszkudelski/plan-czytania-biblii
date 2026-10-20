import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNetlifyFunctionNames } from './check-netlify-functions.mjs';

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'netlify-functions-'));
  const file = path => {
    const segments = path.split('/');
    if (segments.length > 1) mkdirSync(join(directory, ...segments.slice(0, -1)), { recursive: true });
    writeFileSync(join(directory, path), '');
  };
  try { run(directory, file); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('build rejects the API test filename that caused both failed deployments', () => {
  fixture((directory, file) => {
    file('api.mts'); file('plan-replacement.test.ts');
    assert.throws(() => checkNetlifyFunctionNames(directory), /Invalid Netlify function names: plan-replacement\.test/);
  });
});

test('accepts real functions and ignores helper directories without entry points', () => {
  fixture((directory, file) => {
    file('api.mts'); file('reading-reminders.mts'); file('_shared/e2e-cleanup.test.ts');
    file('another_function/index.mts'); file('nested/nested.ts');
    assert.deepEqual(checkNetlifyFunctionNames(directory), ['another_function', 'api', 'nested', 'reading-reminders']);
  });
});

test('checks function directory names as well as top-level filenames', () => {
  fixture((directory, file) => {
    file('bad.name/index.ts');
    assert.throws(() => checkNetlifyFunctionNames(directory), /bad\.name/);
  });
});
