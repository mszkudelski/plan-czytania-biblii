import { existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cleanupRun, manifestPath } from './cleanup-e2e.mjs';
import { validateE2eTarget } from '../e2e/run-context.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function playwrightFilters(mode, files, exists = existsSync) {
  if (!['all', 'selected'].includes(mode)) throw new Error('Only all/selected modes may launch E2E.');
  if (!Array.isArray(files) || !files.length || !files.every(file => typeof file === 'string' && /^[a-z0-9-]+\.e2e\.mjs$/.test(file) && exists(`e2e/${file}`))) {
    throw new Error('Expected a nonempty list of existing E2E files.');
  }
  return mode === 'all' ? [] : [...new Set(files)].map(file => `(^|/)${file.replaceAll('.', '\\.')}$`);
}
async function main() {
  const filters = playwrightFilters(process.env.E2E_MODE, JSON.parse(process.env.E2E_TEST_FILES));
  const token = randomBytes(32).toString('hex');
  const env = { ...process.env, E2E_RUN_TOKEN: token };
  const baseURL = env.E2E_BASE_URL;
  validateE2eTarget(baseURL, env);
  const response = await fetch(baseURL + '/build-info.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Cannot verify tested deployment.');
  const info = await response.json();
  if (env.E2E_PRODUCTION === '1' && (info.commit !== env.EXPECTED_COMMIT || info.context !== 'production')) throw new Error('Production deploy does not match the tested commit.');
  // Verify that cleanup exists BEFORE creating anything.
  const probe = await fetch(baseURL + '/api/e2e/cleanup', { headers: { 'x-reading-e2e-run': token }, signal: AbortSignal.timeout(15000) });
  if (!probe.ok || !Array.isArray((await probe.json()).groups)) throw new Error('Cleanup API is unavailable; refusing to create test data.');
  if (existsSync(manifestPath)) throw new Error('Previous E2E cleanup is unfinished. Run cleanup first.');
  writeFileSync(manifestPath, JSON.stringify({ baseURL, token, production: env.E2E_PRODUCTION, commit: env.EXPECTED_COMMIT }), { mode: 0o600, flag: 'wx' });
  if (env.CI) console.log('::add-mask::' + token);
  let child;
  const terminate = () => {
    if (!child?.pid) return;
    if (process.platform === 'win32') child.kill('SIGTERM');
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already closed. */ } }
  };
  process.on('SIGTERM', terminate); process.on('SIGINT', terminate);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child = spawn('npm', ['run', 'test:e2e', '--', ...filters], { stdio: 'inherit', shell: false, env, detached: process.platform !== 'win32' });
      child.on('error', reject); child.on('close', code => resolve(code ?? 1));
    });
  } finally {
    process.off('SIGTERM', terminate); process.off('SIGINT', terminate);
    await cleanupRun();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
