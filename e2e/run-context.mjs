export const e2eHeaders = { 'x-reading-e2e-run': process.env.E2E_RUN_TOKEN ?? '' };
export function validateE2eTarget(baseURL, env = process.env) {
  const url = new URL(baseURL);
  const preview = /^(?:develop|deploy-preview-\d+|[a-f0-9]{24})--plan-czytania\.netlify\.app$/.test(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(preview || url.hostname === 'plan-czytania.netlify.app')) throw new Error('Unsupported E2E target.');
  if (!/^[a-f0-9]{64}$/.test(env.E2E_RUN_TOKEN ?? '')) throw new Error('E2E requires a cleanup capability. Use the E2E runner.');
  if (!preview && env.E2E_PRODUCTION !== '1') throw new Error('Production E2E requires explicit approval.');
  if (env.E2E_PRODUCTION === '1' && !/^[a-f0-9]{40}$/.test(env.EXPECTED_COMMIT ?? '')) throw new Error('Production E2E requires an exact commit.');
}
