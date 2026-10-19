import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const visual = 'develop-visual-review.e2e.mjs';
const notifications = ['notifications.e2e.mjs', 'onboarding.e2e.mjs', visual];
const reading = ['browser.e2e.mjs', 'reading-home.e2e.mjs', 'recovery-prompt.e2e.mjs', 'member-access.e2e.mjs', 'onboarding.e2e.mjs', visual];
const access = ['backend.e2e.mjs', 'browser.e2e.mjs', 'identity.e2e.mjs', 'member-access.e2e.mjs', 'group-access-hint.e2e.mjs', 'onboarding.e2e.mjs', visual];
// Explicit allowlist: shared app/API/storage/configuration and unknown files run all.
// Keep cross-feature consumers here, even when they import a module indirectly.
const rules = [
  { paths: ["src/PlanReplacement.tsx", "src/lib/plan-replacement.ts"], tests: [...reading, ...access, ...notifications, "plan-replacement.e2e.mjs"] },
  { paths: ['src/NotificationSettings.tsx', 'src/NotificationTestControls.tsx', 'src/ReminderPrompt.tsx', 'src/lib/notifications.ts', 'src/lib/push-client.ts', 'src/lib/install.ts', 'src/lib/reminder-time-save.ts', 'netlify/functions/_shared/notifications.ts', 'netlify/functions/reading-reminders.mts'], tests: notifications },
  { paths: ['src/RecoveryPrompt.tsx', 'src/lib/recovery-prompt.ts', 'src/lib/recovery.ts', 'src/lib/reading-home.ts', 'src/lib/metrics.ts'], tests: reading },
  { paths: ['src/MemberAccessModal.tsx', 'src/GroupAccessSettings.tsx', 'src/lib/invite.ts', 'src/lib/access-recovery.ts', 'src/lib/name.ts'], tests: access },
  { paths: ['src/GroupAccessHint.tsx'], tests: ['group-access-hint.e2e.mjs', 'member-access.e2e.mjs', 'identity.e2e.mjs', visual] },
  { paths: ['src/Onboarding.tsx', 'src/lib/onboarding.ts'], tests: [...notifications, ...reading, ...access] },
];

export function selectTests(changedFiles, availableTests) {
  const files = [...new Set(changedFiles)].sort();
  const tests = new Set();
  const reasons = [];
  let full = files.length === 0;
  if (full) reasons.push('No changed files: run the full suite conservatively.');
  for (const file of files) {
    if (file === 'README.md' || file === 'e2e/README.md' || /^docs\/.*\.md$/.test(file)) {
      reasons.push(`${file}: documentation only`);
      continue;
    }
    if (/^e2e\/[^/]+\.e2e\.mjs$/.test(file)) {
      const name = file.slice(4);
      if (availableTests.includes(name)) {
        tests.add(name);
        reasons.push(`${file}: changed test`);
      } else {
        full = true;
        reasons.push(`${file}: removed test, run all remaining tests`);
      }
      continue;
    }
    const source = file.replace(/\.test\.(tsx?)$/, '.$1');
    const rule = rules.find(rule => rule.paths.includes(source));
    if (!rule) {
      full = true;
      reasons.push(`${file}: shared or unmapped file, run all`);
    } else {
      rule.tests.forEach(test => tests.add(test));
      reasons.push(`${file}: ${[...new Set(rule.tests)].join(', ')}`);
    }
  }
  // A stale mapping must not silently omit coverage.
  if ([...tests].some(test => !availableTests.includes(test))) {
    full = true;
    reasons.push('A mapped test is missing: run all remaining tests.');
  }
  const selected = full ? [...availableTests].sort() : [...tests].sort();
  if (full && selected.length === 0) throw new Error('No E2E tests found.');
  return { mode: full ? 'all' : selected.length ? 'selected' : 'none', files: selected, changedFiles: files, reasons };
}

export function selectionForEvent(eventName, event, availableTests, diff) {
  const all = reason => ({ mode: 'all', files: [...availableTests].sort(), changedFiles: [], reasons: [reason] });
  if (eventName === 'push' && event.ref === 'refs/heads/main') {
    if (!availableTests.length) throw new Error('No E2E tests found.');
    return all('Main push: full E2E suite on synthetic production plans with per-run cleanup.');
  }
  return { mode: 'none', files: [], changedFiles: [], reasons: ['E2E runs only after a push to main; unit tests and build still run.'] };
}

export function gitChangedFiles(base, head, mergeBase = false, cwd = process.cwd()) {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Expected commit SHAs.');
  const args = ['diff', '--no-renames', '--name-only', '-z', ...(mergeBase ? [`${base}...${head}`] : [base, head]), '--'];
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function main() {
  const available = readdirSync('e2e').filter(file => file.endsWith('.e2e.mjs')).sort();
  if (!available.length) throw new Error('No E2E tests found.');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const selection = selectionForEvent(process.env.GITHUB_EVENT_NAME, event, available, gitChangedFiles);
  console.log(JSON.stringify(selection, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${selection.mode}\nfiles=${JSON.stringify(selection.files)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = `## E2E selection\n\nMode: **${selection.mode}**\n\nSelected tests: ${selection.files.length ? selection.files.map(file => `\`${file}\``).join(', ') : 'none'}\n\n${selection.reasons.map(reason => `- ${reason.replaceAll('\n', ' ')}`).join('\n')}\n`;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
