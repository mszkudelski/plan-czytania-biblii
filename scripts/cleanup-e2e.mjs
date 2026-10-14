import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateE2eTarget } from '../e2e/run-context.mjs';
export const manifestPath = '.e2e-run.json';
export async function cleanupRun(fetcher = fetch) {
  if (!existsSync(manifestPath)) return;
  const { baseURL, token, production, commit } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateE2eTarget(baseURL, { E2E_RUN_TOKEN: token, E2E_PRODUCTION: production, EXPECTED_COMMIT: commit });
  const headers = { 'x-reading-e2e-run': token };
  const list = async () => {
    const response = await fetcher(baseURL + '/api/e2e/cleanup', { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('E2E cleanup lookup failed: ' + response.status);
    const { groups } = await response.json();
    if (!Array.isArray(groups) || !groups.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))) throw new Error('Invalid cleanup manifest response.');
    return groups;
  };
  for (const groupId of await list()) {
    let removed = false;
    for (let attempt = 0; attempt < 3 && !removed; attempt++) {
      try {
        const response = await fetcher(baseURL + '/api/e2e/cleanup/' + groupId, { method: 'DELETE', headers, signal: AbortSignal.timeout(60000) });
        removed = response.ok || response.status === 404;
      } catch { /* Retain the capability and retry interrupted cleanup. */ }
    }
    if (!removed) throw new Error('E2E cleanup failed for a synthetic plan; rerun the cleanup step.');
  }
  if ((await list()).length) throw new Error('Some E2E plans remain.');
  unlinkSync(manifestPath);
  console.log('E2E cleanup verified: no plans from this run remain.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await cleanupRun();
