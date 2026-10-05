import { expect, test } from '@playwright/test';
export const NOW = new Date();
NOW.setUTCHours(12, 0, 0, 0);
export const TODAY = NOW.toISOString().slice(0, 10);
const dateBefore = offset => new Date(NOW.getTime() - offset * 86400000).toISOString().slice(0, 10);
export function inputPlan(suffix = 'browser', multiChapter = false) {
  return {
    name: 'E2E ' + (process.env.GITHUB_RUN_ID ?? 'local') + ' ' + suffix + ' ' + crypto.randomUUID().slice(0, 8),
    ownerName: 'Tester E2E',
    startDate: dateBefore(7),
    frequency: { kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6] },
    planDays: [
      { id: 'd0', index: 0, date: dateBefore(7), title: 'Dzień 1', segments: [
        { id: 's0', label: 'Rdz 1', section: 'Stary Testament' },
        { id: 's1', label: 'Mt 1', section: 'Nowy Testament' },
      ] },
      { id: 'd1', index: 1, date: dateBefore(6), title: 'Dzień 2', segments: [
        { id: 's2', label: multiChapter ? 'Rdz 2-3' : 'Rdz 2', section: 'Stary Testament' },
      ] },
      { id: 'd2', index: 2, date: dateBefore(5), title: 'Dzień 3', segments: [
        { id: 's3', label: 'Rdz 4', section: 'Stary Testament' },
      ] },
      { id: 'd3', index: 3, date: dateBefore(4), title: 'Dzień 4', segments: [
        { id: 's4', label: 'Rdz 5', section: 'Stary Testament' },
      ] },
      { id: 'd4', index: 4, date: dateBefore(3), title: 'Dzień 5', segments: [
        { id: 's5', label: 'Rdz 6', section: 'Stary Testament' },
      ] },
    ],
  };
}
export async function createPlan(request, suffix, multiChapter = false) {
  const response = await request.post('/api/groups', { data: inputPlan(suffix, multiChapter) });
  expect(response.status()).toBe(201);
  const session = await response.json();
  expect(session.group.name).toMatch(/^E2E /);
  // Group IDs are public; never attach the credentials to a report.
  test.info().annotations.push({
    type: 'test-plan', description: session.group.id,
  });
  expect(session.group.members).toHaveLength(1);
  return session;
}
export async function createParallelPlan(request, suffix = 'parallel-recovery') {
  const plan = inputPlan(suffix);
  plan.startDate = dateBefore(10);
  plan.planDays = Array.from({ length: 80 }, (_, index) => ({
    id: 'p' + index, index, date: dateBefore(10 - index), title: 'Dzień ' + (index + 1),
    segments: ['Rdz', 'Mt', 'Ps'].map((book, lane) => ({
      id: 'p' + index + 's' + lane, label: book + ' ' + (index + 1), section: 'Czytanie ' + (lane + 1),
    })),
  }));
  const response = await request.post('/api/groups', { data: plan });
  expect(response.status()).toBe(201);
  const session = await response.json();
  test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  return session;
}
export const progressPath = session => '/api/groups/' + session.group.id + '/progress';
export async function saveProgress(request, session, segmentId, completed = true) {
  const response = await request.post(progressPath(session), {
    data: { ...session.credentials, segmentId, completed },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
export async function readGroup(request, session) {
  const response = await request.get('/api/groups/' + session.group.id, { timeout: 30000 });
  expect(response.status()).toBe(200);
  return response.json();
}
export async function expectSaved(request, session, expectedIds) {
  const started = Date.now();
  let readStarted = null;
  let returnedReads = 0;
  let lastSeen = null;
  let maxReadMs = 0;
  try {
    const read = async () => {
      readStarted = Date.now();
      const group = await readGroup(request, session);
      maxReadMs = Math.max(maxReadMs, Date.now() - readStarted);
      readStarted = null;
      returnedReads++;
      lastSeen = Object.keys(group.progress[session.credentials.memberId] ?? {}).sort();
      return lastSeen;
    };
    // Let the first real HTTP read finish within its own request deadline.
    // The persistence assertion keeps its ten-second polling window; a failed
    // HTTP request still fails the test, without retrying or accepting fallback.
    const first = await read();
    let initial = true;
    await expect.poll(async () => {
      if (initial) { initial = false; return first; }
      return read();
    }).toEqual([...expectedIds].sort());
  } catch (error) {
    // Public IDs and segment IDs only; never print the session or request body.
    console.error('Backend progress verification:', JSON.stringify({
      groupId: session.group.id, expected: [...expectedIds].sort(), lastSeen,
      returnedReads, maxReadMs, elapsedMs: Date.now() - started,
      pendingReadMs: readStarted === null ? null : Date.now() - readStarted,
    }));
    throw error;
  }
}
export async function openPlan(page, session, cache = {}) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(({ credentials, cache }) => {
    localStorage.setItem('plan-czytania-biblii-credentials', JSON.stringify(credentials));
    // Seed once; reload must use the application's persisted state.
    if (!sessionStorage.getItem('e2e-cache-seeded')) {
      for (const [key, value] of Object.entries(cache)) localStorage.setItem(key, value);
      sessionStorage.setItem('e2e-cache-seeded', 'yes');
    }
  }, { credentials: session.credentials, cache });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
}
export const reading = (page, label) => page.locator('.simple-readings button').filter({
  has: page.locator('strong', { hasText: new RegExp('^' + label.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + '$') }),
});
export const extraReading = page => page.locator('.simple-readings button.reading-extra');
export const tab = (page, name) => page.locator('nav:visible').getByRole('button', { name, exact: true });
export const recoveryKey = session => 'reading-recovery:' + session.group.id + ':' + session.credentials.memberId;
// Hold a request BEFORE sending it; after release it uses the real backend.
export async function holdNextProgress(page, session) {
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  await page.route('**' + progressPath(session), async route => {
    entered();
    await gate;
    await route.continue();
  }, { times: 1 });
  return { started, release };
}
