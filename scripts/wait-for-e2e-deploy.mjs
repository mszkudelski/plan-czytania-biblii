import { appendFileSync } from 'node:fs';
const { E2E_COMMIT, GITHUB_OUTPUT } = process.env;
if (!/^[a-f0-9]{40}$/.test(E2E_COMMIT ?? '') || !GITHUB_OUTPUT) throw new Error('Missing deployment lookup configuration.');
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  try {
    const response = await fetch('https://plan-czytania.netlify.app/build-info.json?commit=' + E2E_COMMIT, {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const info = await response.json();
      if (info.commit === E2E_COMMIT && info.context === 'production' && /^[a-f0-9]{24}$/.test(info.deployId)) {
        const baseURL = 'https://' + info.deployId + '--plan-czytania.netlify.app';
        appendFileSync(GITHUB_OUTPUT, 'base_url=' + baseURL + '\n');
        console.log('Testing immutable production deployment of commit ' + E2E_COMMIT);
        process.exit(0);
      }
    }
  } catch { /* The previous deploy remains live while Netlify builds. */ }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
throw new Error('Expected production commit was not published within ten minutes.');
