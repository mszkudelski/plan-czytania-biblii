import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const extensions = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'];
const defaultDirectory = fileURLToPath(new URL('../netlify/functions/', import.meta.url));

export function checkNetlifyFunctionNames(directory = defaultDirectory) {
  const names = readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isFile() && extensions.includes(extname(entry.name))) {
      return [basename(entry.name, extname(entry.name))];
    }
    if (entry.isDirectory() && extensions.some(extension =>
      existsSync(join(directory, entry.name, 'index' + extension)) ||
      existsSync(join(directory, entry.name, entry.name + extension)))) return [entry.name];
    return [];
  });
  const invalid = names.filter(name => !/^[a-zA-Z0-9_-]+$/.test(name));
  if (invalid.length) {
    throw new Error(`Invalid Netlify function names: ${invalid.join(', ')}. Use letters, numbers, hyphens or underscores. Keep API tests in netlify/tests, outside netlify/functions.`);
  }
  return names.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Netlify function names verified: ' + checkNetlifyFunctionNames().join(', '));
}
