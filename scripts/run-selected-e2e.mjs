import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function playwrightFilters(mode, files, exists = existsSync) {
  if (!['all', 'selected'].includes(mode)) throw new Error('Only all/selected modes may launch E2E.');
  if (!Array.isArray(files) || !files.length || !files.every(file => typeof file === 'string' && /^[a-z0-9-]+\.e2e\.mjs$/.test(file) && exists(`e2e/${file}`))) {
    throw new Error('Expected a nonempty list of existing E2E files.');
  }
  return mode === 'all' ? [] : [...new Set(files)].map(file => `(^|/)${file.replaceAll('.', '\\.')}$`);
}
function main() {
  const filters = playwrightFilters(process.env.E2E_MODE, JSON.parse(process.env.E2E_TEST_FILES));
  const result = spawnSync('npm', ['run', 'test:e2e', '--', ...filters], { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
