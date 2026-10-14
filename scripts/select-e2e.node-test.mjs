import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { selectTests, selectionForEvent, gitChangedFiles } from './select-e2e.mjs';
import { playwrightFilters } from './run-selected-e2e.mjs';

const available = readdirSync(new URL('../e2e', import.meta.url)).filter(file => file.endsWith('.e2e.mjs')).sort();
const select = files => selectTests(files, available);

test('notification changes select real notification, onboarding and visual regressions', () => {
  assert.deepEqual(select(['src/NotificationSettings.tsx']).files, ['develop-visual-review.e2e.mjs', 'notifications.e2e.mjs', 'onboarding.e2e.mjs']);
  assert.equal(select(['src/NotificationSettings.tsx']).mode, 'selected');
  for (const file of ['src/lib/push-client.ts', 'src/lib/install.ts', 'src/lib/notifications.ts', 'src/lib/reminder-time-save.test.ts', 'netlify/functions/_shared/notifications.ts', 'netlify/functions/reading-reminders.mts']) {
    assert.deepEqual(select([file]).files, select(['src/NotificationSettings.tsx']).files, file);
  }
});
test('multiple domains and changed tests are combined without duplicates', () => {
  const result = select(['src/NotificationSettings.tsx', 'src/RecoveryPrompt.tsx', 'e2e/identity.e2e.mjs']);
  assert.equal(result.mode, 'selected');
  for (const name of ['notifications', 'onboarding', 'browser', 'reading-home', 'recovery-prompt', 'identity']) assert.ok(result.files.includes(`${name}.e2e.mjs`));
  assert.equal(new Set(result.files).size, result.files.length);
});
test('group access changes retain identity, permissions and backend coverage', () => {
  for (const file of ['src/MemberAccessModal.tsx', 'src/lib/invite.ts', 'src/lib/access-recovery.ts', 'src/lib/name.ts']) {
    const result = select([file]);
    for (const name of ['backend', 'identity', 'member-access', 'group-access-hint']) assert.ok(result.files.includes(`${name}.e2e.mjs`), file);
  }
});
test('shared files, unknown files, selector and config changes run all', () => {
  for (const file of ['src/SimpleApp.tsx', 'src/simple.css', 'src/lib/api.ts', 'src/lib/group-state.ts', 'src/lib/progress-log.ts', 'src/lib/optimistic-progress.ts', 'src/lib/schedule.ts', 'src/types.ts', 'public/sw.js', 'netlify/functions/api.mts', 'package-lock.json', 'scripts/select-e2e.mjs', '.github/workflows/ci.yml', 'e2e/helpers.mjs', 'e2e/playwright.config.mjs', 'src/NewThing.tsx', 'AGENTS.md']) {
    assert.equal(select([file]).mode, 'all', file);
    assert.deepEqual(select([file]).files, available, file);
  }
});
test('only an explicit documentation allowlist skips E2E', () => {
  assert.equal(select(['README.md', 'e2e/README.md', 'docs/testing.md']).mode, 'none');
  assert.equal(select(['README.md', 'src/NotificationSettings.tsx']).mode, 'selected');
  assert.equal(select(['src/README.md']).mode, 'all');
  assert.equal(select(['docs/config.json']).mode, 'all');
  assert.equal(select([]).mode, 'all');
});
test('new or edited test runs itself; removed test and stale mappings run all', () => {
  assert.deepEqual(selectTests(['e2e/new.e2e.mjs'], [...available, 'new.e2e.mjs']).files, ['new.e2e.mjs']);
  assert.equal(select(['e2e/deleted.e2e.mjs']).mode, 'all');
  assert.equal(selectTests(['src/NotificationSettings.tsx'], ['onboarding.e2e.mjs']).mode, 'all');
  assert.throws(() => selectTests(['src/SimpleApp.tsx'], []), /No E2E/);
});
test('promotion and manual runs always run all; production pushes do not write', () => {
  const noDiff = () => { throw new Error('diff must not run'); };
  assert.equal(selectionForEvent('pull_request', { pull_request: { base: { ref: 'main' } } }, available, noDiff).mode, 'all');
  assert.equal(selectionForEvent('workflow_dispatch', {}, available, noDiff).mode, 'all');
  assert.equal(selectionForEvent('push', { ref: 'refs/heads/main' }, available, noDiff).mode, 'none');
});
test('PR comparison uses merge base and push uses before/after, independent of CI checkout', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  const diff = (b, h, merge) => { assert.equal(b, base); assert.equal(h, head); assert.equal(merge, true); return ['src/NotificationSettings.tsx']; };
  assert.equal(selectionForEvent('pull_request', { pull_request: { base: { ref: 'develop', sha: base }, head: { sha: head } } }, available, diff).mode, 'selected');
  assert.equal(selectionForEvent('push', { before: base, after: head }, available, (b, h, merge) => { assert.deepEqual([b, h, merge], [base, head, false]); return ['README.md']; }).mode, 'none');
});
test('missing history, first push and unsupported events conservatively run all', () => {
  assert.equal(selectionForEvent('push', { before: '0'.repeat(40), after: 'a'.repeat(40) }, available, () => []).mode, 'all');
  assert.equal(selectionForEvent('push', { before: 'a'.repeat(40), after: 'b'.repeat(40) }, available, () => { throw new Error('missing commit'); }).mode, 'all');
  assert.equal(selectionForEvent('pull_request', {}, available, () => []).mode, 'all');
  assert.equal(selectionForEvent('unknown', {}, available, () => []).mode, 'all');
});
test('real git diff includes both sides of a rename and ignores unrelated base-branch changes for PRs', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'e2e-diff-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'develop'); git('config', 'user.email', 'tests@example.invalid'); git('config', 'user.name', 'Tests');
    writeFileSync(join(cwd, 'old name\nfile.ts'), 'source\n'); git('add', '.'); git('commit', '-m', 'base');
    const ancestor = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'feature'); renameSync(join(cwd, 'old name\nfile.ts'), join(cwd, 'new.ts')); git('add', '-A'); git('commit', '-m', 'rename');
    const head = git('rev-parse', 'HEAD');
    assert.deepEqual(gitChangedFiles(ancestor, head, false, cwd).sort(), ['new.ts', 'old name\nfile.ts']);
    git('checkout', 'develop'); writeFileSync(join(cwd, 'base-only.ts'), 'base change'); git('add', '.'); git('commit', '-m', 'advance base');
    const base = git('rev-parse', 'HEAD');
    assert.deepEqual(gitChangedFiles(base, head, true, cwd).sort(), ['new.ts', 'old name\nfile.ts']);
    assert.ok(gitChangedFiles(base, head, false, cwd).includes('base-only.ts'));
    assert.throws(() => gitChangedFiles('--bad', head, false, cwd), /SHAs/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test('runner validates mode/files and passes exact escaped Playwright filters', () => {
  assert.deepEqual(playwrightFilters('all', available), []);
  assert.deepEqual(playwrightFilters('selected', ['notifications.e2e.mjs']), ['(^|/)notifications\\.e2e\\.mjs$']);
  for (const files of [[], ['missing.e2e.mjs'], ['../outside.e2e.mjs'], ['$(echo bad).e2e.mjs'], [null]]) assert.throws(() => playwrightFilters('selected', files));
  assert.throws(() => playwrightFilters('none', available));
});

test('Required CI validates actual workflow shell for selection, skips, failures and production', async () => {
  const { readFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const script = workflow.slice(workflow.lastIndexOf('        run: |\n') + '        run: |\n'.length).replace(/^          /gm, '');
  const check = overrides => spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, SELECTION_RESULT: 'success', SELECTION_MODE: 'selected', UNIT_RESULT: 'success', E2E_RESULT: 'success', PRODUCTION_RESULT: 'skipped', PRODUCTION_PUSH: 'false', ...overrides } }).status;
  assert.equal(check({}), 0);
  assert.equal(check({ SELECTION_MODE: 'all' }), 0);
  assert.equal(check({ SELECTION_MODE: 'none', E2E_RESULT: 'skipped' }), 0);
  assert.equal(check({ SELECTION_MODE: 'none', E2E_RESULT: 'skipped', PRODUCTION_PUSH: 'true', PRODUCTION_RESULT: 'success' }), 0);
  for (const overrides of [
    { SELECTION_RESULT: 'failure' }, { SELECTION_RESULT: 'cancelled' },
    { SELECTION_MODE: '' }, { SELECTION_MODE: 'unexpected' },
    { E2E_RESULT: 'failure' }, { E2E_RESULT: 'cancelled' }, { E2E_RESULT: 'skipped' },
    { UNIT_RESULT: 'failure' }, { UNIT_RESULT: 'cancelled' },
    { SELECTION_MODE: 'none', E2E_RESULT: 'failure' },
    { PRODUCTION_PUSH: 'true', E2E_RESULT: 'skipped', PRODUCTION_RESULT: 'failure' },
  ]) assert.notEqual(check(overrides), 0, JSON.stringify(overrides));
});
