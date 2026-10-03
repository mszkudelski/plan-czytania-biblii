import { appendFileSync } from 'node:fs';
const { GITHUB_TOKEN, GITHUB_REPOSITORY, E2E_COMMIT, GITHUB_OUTPUT } = process.env;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !E2E_COMMIT) throw new Error('Missing GitHub deployment lookup configuration.');
const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  const response = await fetch('https://api.github.com/repos/' + GITHUB_REPOSITORY + '/commits/' + E2E_COMMIT + '/status', {
    headers: { authorization: 'Bearer ' + GITHUB_TOKEN, accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error('GitHub status lookup failed: ' + response.status);
  const { statuses } = await response.json();
  const deployment = statuses.find(status =>
    /^netlify\/plan-czytania\/(deploy-preview|branch-deploy)$/.test(status.context));
  if (deployment && ['failure', 'error'].includes(deployment.state)) {
    throw new Error('Netlify deployment failed for the tested commit.');
  }
  if (deployment?.state === 'success') {
    const target = new URL(deployment.target_url);
    let baseURL;
    if (/^(deploy-preview-\d+|develop)--plan-czytania\.netlify\.app$/.test(target.hostname)) {
      baseURL = target.origin;
    } else {
      const deployId = target.pathname.match(/\/deploys\/([a-f0-9]{24})/)?.[1];
      if (deployId) baseURL = 'https://' + deployId + '--plan-czytania.netlify.app';
    }
    if (baseURL) {
      try {
        const info = await fetch(baseURL + '/build-info.json', { cache: 'no-store' }).then(r => r.json());
        // Reject stale aliases, production deploys and previews from another commit.
        if (info.commit === E2E_COMMIT && ['deploy-preview', 'branch-deploy'].includes(info.context)) {
          if (/^[a-f0-9]{24}$/.test(info.deployId)) baseURL = 'https://' + info.deployId + '--plan-czytania.netlify.app';
          appendFileSync(GITHUB_OUTPUT, 'base_url=' + baseURL + '\n');
          console.log('Testing deployment of commit ' + E2E_COMMIT + ': ' + baseURL);
          process.exit(0);
        }
      } catch { /* Deployment may still be propagating. */ }
    }
  }
  await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error('No non-production Netlify deploy of the tested commit became ready within 15 minutes.');
