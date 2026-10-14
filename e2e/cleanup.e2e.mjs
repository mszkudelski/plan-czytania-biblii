import { test, expect } from './fixtures.mjs';
import { createPlan } from './helpers.mjs';
test('cleanup requires the run capability and leaves unrelated test plans intact', async ({ request }) => {
  const removed = await createPlan(request, 'cleanup-target');
  const retained = await createPlan(request, 'cleanup-retained');
  const url = '/api/e2e/cleanup/' + removed.group.id;
  expect((await request.delete(url, { headers: { 'x-reading-e2e-run': 'b'.repeat(64) } })).status()).toBe(404);
  expect((await request.delete(url)).status()).toBe(200);
  expect((await request.get('/api/groups/' + removed.group.id)).status()).toBe(404);
  expect((await request.get('/api/groups/' + retained.group.id)).status()).toBe(200);
  expect((await request.delete(url)).status()).toBe(404);
});
