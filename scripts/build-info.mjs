import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../public/build-info.json', import.meta.url), JSON.stringify({
  commit: process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'local',
  context: process.env.CONTEXT ?? 'local',
}));
