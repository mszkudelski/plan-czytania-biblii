import { test, expect } from './fixtures.mjs';
import {
  enableRecovery, expectWeek, createPlan, createParallelPlan, openPlan, saveProgress, expectSaved, readGroup, reading,
  extraReading, browseReading, tab, recoveryKey, TODAY, NOW, holdNextProgress, progressPath,
} from './helpers.mjs';

test('standard reading is optimistic, saves to backend and survives reload', async ({ page, request }) => {
  const analyticsRequests = [];
  page.on('request', req => { if (new URL(req.url()).hostname.endsWith('posthog.com')) analyticsRequests.push(req.url()); });
  const session = await createPlan(request, 'standard');
  await openPlan(page, session);
  const held = await holdNextProgress(page, session);
  try {
    await reading(page, 'Rdz 1').click();
    await held.started;
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(reading(page, 'Rdz 1')).toBeEnabled();
    await expectSaved(request, session, []);
  } finally { held.release(); }
  await expectSaved(request, session, ['s0']);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, []);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  // Even reported JS errors/rejected promises in a synthetic browser must not
  // load PostHog or send exceptions. These dispatched events do not crash reading.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('E2E error tracking exclusion'),
      message: 'E2E error tracking exclusion' }));
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(), reason: new Error('E2E rejected promise exclusion'),
    }));
  });
  // Synthetic test activity on immutable deploys must never reach analytics.
  expect(analyticsRequests).toEqual([]);
});

test('rapid toggles and an independent click persist the final intent', async ({ page, request }) => {
  const session = await createPlan(request, 'rapid');
  await openPlan(page, session);
  const held = await holdNextProgress(page, session);
  try {
    await reading(page, 'Rdz 1').click();
    await held.started;
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  } finally { held.release(); }
  await expectSaved(request, session, ['s1']);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
});

test('backend rejection rolls back only the failed click and allows retry', async ({ page, request }) => {
  const session = await createPlan(request, 'rollback');
  await openPlan(page, session);
  // Only this isolated test's first write has an invalid token; the 401 comes from the real backend.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    const data = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...data, token: 'invalid' }) });
  }, { times: 1 });
  try {
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-busy', 'true');
  } finally { release(); }
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s1']);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recovery starts at personal progress and adds only one extra row', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery');
  await saveProgress(request, session, 's0');
  await openPlan(page, session);
  await expect(page.getByRole('button', { name: 'Nadrabianie', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Chcesz włączyć nadrabianie?' })).not.toBeVisible();
  await enableRecovery(page);
  await expect(page.locator('.simple-readings button')).toHaveCount(3);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Mt 1').click();
  await expect(extraReading(page)).toBeEnabled();
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.simple-readings button')).toHaveCount(3);
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Wyłącz nadrabianie' }).click();
  await expect(extraReading(page)).toHaveCount(0);
});

test('reload after backend commit preserves the extra while its response is pending', async ({ page, request }) => {
  const session = await createPlan(request, 'extra-reload-response');
  await saveProgress(request, session, 's0');
  await saveProgress(request, session, 's1');
  // Keep the daily portion at d0 even though its base is already completed.
  await openPlan(page, session, {
    [recoveryKey(session)]: TODAY,
    [recoveryKey(session) + ':ordered:' + TODAY + ':day']: 'd0',
  });
  await expect(extraReading(page)).toContainText('Rdz 2');
  let release;
  let committed;
  const gate = new Promise(resolve => { release = resolve; });
  const saved = new Promise(resolve => { committed = resolve; });
  await page.route('**' + progressPath(session), async route => {
    const response = await route.fetch();
    committed(response.status());
    await gate;
    try { await route.fulfill({ response }); } catch {
      // The old page's request may already have been cancelled by reload.
    }
  }, { times: 1 });
  try {
    await extraReading(page).click();
    expect(await saved).toBe(200);
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await page.reload();
    await expect(extraReading(page)).toContainText('Rdz 2');
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  } finally { release(); }
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1', 's2']);
});

test('extra waits for the standard writes and rolls back if the base fails', async ({ page, request }) => {
  const session = await createPlan(request, 'base-failure');
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0']);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
  }, { times: 1 });
  try {
    await reading(page, 'Mt 1').click();
    await extraReading(page).click();
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(extraReading(page)).toHaveAttribute('aria-busy', 'true');
    await expectSaved(request, session, ['s0']);
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toBeDisabled();
  await expectSaved(request, session, ['s0']);
});

test('extra rollback remains correct when leaving and returning to Today during save', async ({ page, request }) => {
  const session = await createPlan(request, 'extra-tab-race');
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
  }, { times: 1 });
  try {
    await extraReading(page).click();
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(extraReading(page)).toHaveAttribute('aria-busy', 'true');
    await tab(page, 'Plan').click();
    await tab(page, 'Czytaj').click();
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, ['s0', 's1']);
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
});

test('partial extra chapter persists on the server; tomorrow resumes remaining chapters', async ({ page, request }) => {
  const session = await createPlan(request, 'partial-chapter', true);
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']); // No whole segment completed yet.
  await expect.poll(async () => (await readGroup(request, session)).chapterProgress?.[session.credentials.memberId]?.s2).toEqual([0]);
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await page.clock.setSystemTime(new Date(NOW.getTime() + 86400000));
  await page.reload();
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s0', 's1', 's2', 's3']);
  await expect(extraReading(page)).toBeEnabled();
});

test('stale recovery anchor and unfinished extra cannot skip earlier progress', async ({ page, request }) => {
  const session = await createPlan(request, 'stale-anchor');
  const key = recoveryKey(session);
  await openPlan(page, session, {
    [key]: TODAY,
    [key + ':ordered:' + TODAY + ':day']: 'd3',
    [key + ':ordered:' + TODAY]: JSON.stringify({
      reading: { segmentId: 's5', originalDate: session.group.planDays[4].date, label: 'Rdz 6', chapterIndex: 0, chapterCount: 1 },
      completed: false,
    }),
  });
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(reading(page, 'Mt 1')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 2');
});

test('normal partial reading keeps its label and date when checked and unchecked', async ({ page, request }) => {
  const session = await createPlan(request, 'partial-stable-label', true);
  for (const id of ['s0', 's1']) await saveProgress(request, session, id);
  await openPlan(page, session, { [recoveryKey(session) + ':chapters']: JSON.stringify({ s2: 1 }) });
  const selectedDate = await page.locator('.reading-card-head time').getAttribute('dateTime');
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', selectedDate);
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', selectedDate);
});

test('invalid and null recovery cache do not break reading', async ({ page, request }) => {
  const session = await createPlan(request, 'bad-cache');
  const key = recoveryKey(session);
  await openPlan(page, session, {
    [key]: TODAY,
    [key + ':chapters']: 'null',
    [key + ':ordered:' + TODAY]: '{broken json',
  });
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 2');
});

test('saved forecast rows keep their assigned date after reload and ordinary unchecks do not reappear', async ({ page, request }) => {
  const session = await createPlan(request, 'forecast-reload-uncheck');
  await openPlan(page, session); await enableRecovery(page);
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  const assignedDate = await page.locator('.reading-card-head time').getAttribute('dateTime');
  await reading(page, 'Rdz 4').click(); await expectSaved(request, session, ['s3']);
  await page.reload();
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', assignedDate);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true }).click();
  await reading(page, 'Rdz 4').click(); await expectSaved(request, session, []);
  await page.reload(); await browseReading(page, 2);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, []);
});

test('recovery waits for real session progress before freezing a stale cached portion', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery-stale-portion');
  for (const id of ['s0', 's1', 's2']) await saveProgress(request, session, id);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/session', async route => { started(); await gate; await route.continue(); }, { times: 1 });
  try {
    await openPlan(page, session, {
      [recoveryKey(session)]: TODAY,
      ['plan-czytania-biblii-group-' + session.group.id]: JSON.stringify({ group: session.group, savedAt: NOW.toISOString() }),
    });
    await captured;
    expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey(session) + ':ordered:' + TODAY + ':portion-v3')).toBeNull();
  } finally { release(); }
  await expect(reading(page, 'Rdz 4')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expectSaved(request, session, ['s0', 's1', 's2']);
});

test('completed plan has no future recovery extra', async ({ page, request }) => {
  const session = await createPlan(request, 'complete');
  for (const segment of session.group.planDays.flatMap(day => day.segments)) {
    await saveProgress(request, session, segment.id);
  }
  await openPlan(page, session, { [recoveryKey(session)]: TODAY });
  await expect(page.getByRole('heading', { name: 'Plan ukończony' })).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await expect(page.locator('.reading-navigation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Poprzednie', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Następne', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
  await expect(reading(page, 'Rdz 5')).toHaveAttribute('aria-pressed', 'true');
  await browseReading(page, 'last');
  await expect(reading(page, 'Rdz 6')).toHaveAttribute('aria-pressed', 'true');
  await expect(extraReading(page)).toHaveCount(0);
});

test('recovery advances at midnight without reloading the page', async ({ page, request }) => {
  const session = await createPlan(request, 'midnight', true);
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await readGroup(request, session)).chapterProgress?.[session.credentials.memberId]?.s2).toEqual([0]);
  await page.clock.fastForward('12:00:01');
  await expect(reading(page, 'Rdz 3')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
});

test('future recovery days assume prior extras without saving assumed progress', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery-forecast');
  await openPlan(page, session);
  const switcher = page.locator('.reading-navigation');
  await browseReading(page, 'last');
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await enableRecovery(page);
  const dates = switcher;
  await expect(dates).toHaveAttribute('data-reading-count', '3');
  await expect(dates).toHaveAttribute('data-selected-index', '0');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(page.getByRole('button', { name: 'Poprzednie', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toBeDisabled();
  await expect(reading(page, 'Rdz 2')).toHaveCount(0);
  await browseReading(page, 'last');
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Następne', exact: true })).toBeDisabled();
  await expectSaved(request, session, []);
  expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);

  // Reading ahead is immediately available; browsing must not mark preceding days.
  await browseReading(page, 1);
  await expect(reading(page, 'Rdz 4')).toBeEnabled();
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s3']);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
  await extraReading(page).click();
  await expectSaved(request, session, ['s3', 's4']);
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await browseReading(page, 0);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey(session) + ':ordered:' + TODAY + ':day')).toBe('d0');

  await browseReading(page, 'last');
  await page.getByRole('button', { name: 'Wyłącz nadrabianie' }).click();
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await expect(switcher).toHaveAttribute('data-reading-count', '5');
  await expectSaved(request, session, ['s3', 's4']);
  await page.reload();
  await expectSaved(request, session, ['s3', 's4']);
});

test('failed rapid future toggles do not restore an earlier optimistic chapter', async ({ page, request }) => {
  const session = await createPlan(request, 'future-rapid-rejection');
  await openPlan(page, session);
  await enableRecovery(page);
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  let rejected = 0;
  page.on("response", response => {
    if (new URL(response.url()).pathname === progressPath(session) && response.status() === 401) rejected++;
  });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
  }, { times: 2 });
  try {
    await reading(page, 'Rdz 4').click();
    await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
    await reading(page, 'Rdz 4').click();
    await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => rejected).toBe(2);
  await expect.poll(async () => (await readGroup(request, session)).chapterProgress?.[session.credentials.memberId]?.s3 ?? []).toEqual([]);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, []);
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s3']);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
  await browseReading(page, 0);
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, ['s3']);
});

test('future partial ranges can be checked without completing assumed earlier chapters', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await createPlan(request, 'recovery-forecast-partial', true);
  await openPlan(page, session);
  await enableRecovery(page);
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expect(reading(page, 'Rdz 3')).toBeEnabled();
  await reading(page, 'Rdz 3').click();
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, []); // Rdz 2 was assumed, never actually checked.
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s3']);
  await expect(extraReading(page)).toBeEnabled();
  await extraReading(page).click();
  await expectSaved(request, session, ['s3', 's4']);

  await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1', 's2', 's3', 's4']);
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1', 's2', 's3', 's4']);
});

test('projected navigation respects partial chapters and reload returns to today', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await createPlan(request, 'recovery-navigation-partial', true);
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 3')).toBeVisible();
  await expect(reading(page, 'Rdz 4')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 5');
  await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');

  await browseReading(page, 'last');
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await page.reload();
  await expect(page.locator('.reading-navigation')).toBeVisible();
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']);
});

test('standard completed day stays visible until the next day is selected', async ({ page, request }) => {
  const session = await createPlan(request, 'standard-completed-day');
  await openPlan(page, session);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-finished')).toHaveText('Przeczytane');
  await expect(page.locator('.reading-navigation')).toHaveAttribute('data-selected-index', '0');

  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 2').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-navigation')).toHaveAttribute('data-selected-index', '1');
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');

  await browseReading(page, 0);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
});

test('completed recovery portion keeps its one extra and advances only through day navigation', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery-completed-day');
  const monday = new Date(NOW);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const scheduledThisWeek = session.group.planDays.filter(day => day.date >= monday.toISOString().slice(0, 10)).length;
  const weeklyGoal = scheduledThisWeek || session.group.planDays.length;
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectWeek(page, `${Math.min(1, weeklyGoal)} z ${weeklyGoal} czytań`);
  await expect(extraReading(page)).toBeEnabled();
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expectWeek(page, `${Math.min(2, weeklyGoal)} z ${weeklyGoal} czytań`);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-finished')).toHaveText('Przeczytane');
  await expect(page.locator('.reading-navigation')).toHaveAttribute('data-selected-index', '0');

  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 5');
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s0', 's1', 's2', 's3']);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-navigation')).toHaveAttribute('data-selected-index', '1');

  await browseReading(page, 0);
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey(session) + ':ordered:' + TODAY + ':day')).toBe('d0');
});

test('ten days behind with three streams catches up after thirty extras, without preview writes', async ({ page, request }) => {
  const session = await createParallelPlan(request);
  await openPlan(page, session);
  await enableRecovery(page);
  await expect(page.locator('.simple-readings button')).toHaveCount(4);
  await expect(extraReading(page)).toContainText('Rdz 2');
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(extraReading(page)).toContainText('Mt 3');
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(extraReading(page)).toContainText('Ps 4');
  for (let index = 2; index < 29; index++) {
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
  }
  await expect(extraReading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(extraReading(page)).toHaveCount(0);
  await expect(page.locator('.simple-readings button')).toHaveCount(3);
  for (const book of ['Rdz', 'Mt', 'Ps']) {
    await expect(reading(page, book + ' 41')).toHaveAttribute('aria-pressed', 'false');
  }
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(extraReading(page)).toHaveCount(0);
  await expectSaved(request, session, []);
  expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
});

test('real daily writes rotate recovery across all streams and keep the full normal quota', async ({ page, request }) => {
  const session = await createParallelPlan(request, 'parallel-real-days');
  await openPlan(page, session);
  await enableRecovery(page);
  const expected = [];
  for (let day = 0; day < 3; day++) {
    const base = day === 0
      ? [['Rdz 1', 'p0s0'], ['Mt 1', 'p0s1'], ['Ps 1', 'p0s2']]
      : day === 1
      ? [['Rdz 3', 'p2s0'], ['Mt 2', 'p1s1'], ['Ps 2', 'p1s2']]
      : [['Rdz 4', 'p3s0'], ['Mt 4', 'p3s1'], ['Ps 3', 'p2s2']];
    const extra = [['Rdz 2', 'p1s0'], ['Mt 3', 'p2s1'], ['Ps 4', 'p3s2']][day];
    await expect(page.locator('.simple-readings button')).toHaveCount(4);
    await expect(extraReading(page)).toContainText(extra[0]);
    await expect(extraReading(page)).toBeDisabled();
    for (const [label, id] of base) {
      await reading(page, label).click(); expected.push(id);
    }
    await expect(extraReading(page)).toBeEnabled();
    await extraReading(page).click(); expected.push(extra[1]);
    await expectSaved(request, session, expected);
    await page.reload();
    await expect(page.locator('.simple-readings button')).toHaveCount(4);
    for (const [label] of base) await expect(reading(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expect(extraReading(page)).toContainText(extra[0]);
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
    await page.clock.setSystemTime(new Date(NOW.getTime() + (day + 1) * 86400000));
    await page.reload();
  }
  await expect(extraReading(page)).toContainText('Rdz 6');
  await expect(reading(page, 'Rdz 5')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 5')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Ps 5')).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, expected);
});

test('manual refresh cannot erase a progress write confirmed after its request started', async ({ page, request }) => {
  const session = await createPlan(request, 'manual-refresh-race');
  await openPlan(page, session);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0']);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/session', async route => {
    const response = await route.fetch();
    started(response.status());
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true }).click();
    expect(await captured).toBe(200);
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true })).toBeEnabled();
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-finished')).toContainText('Przeczytane');
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']);
});

test('cached startup stays visible and protects newer progress from its initial stale response', async ({ page, request }) => {
  const session = await createPlan(request, 'cached-startup-race');
  await openPlan(page, session);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0']);
  // An independent backend GET can see the write before its response reaches
  // this browser. This scenario needs a confirmed cache before the reload;
  // reload while a committed write response is pending is covered separately.
  await expect.poll(() => page.evaluate(({ groupId, memberId }) => {
    const cached = JSON.parse(localStorage.getItem('plan-czytania-biblii-group-' + groupId) ?? 'null');
    return Boolean(cached?.group?.progress?.[memberId]?.s0);
  }, { groupId: session.group.id, memberId: session.credentials.memberId })).toBe(true);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/session', async route => {
    const response = await route.fetch();
    started(response.status());
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.reload();
    expect(await captured).toBe(200);
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true })).toBeEnabled();
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']);
});

test('failed refresh shows the last real cached plan and can reconnect', async ({ page, request }) => {
  const session = await createPlan(request, 'cache-reconnect');
  await openPlan(page, session);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0']);
  // The scenario starts from a confirmed cached response, not an in-flight save.
  await expect.poll(() => page.evaluate(({ groupId, memberId }) => {
    const cached = JSON.parse(localStorage.getItem('plan-czytania-biblii-group-' + groupId) ?? 'null');
    return Boolean(cached?.group?.progress?.[memberId]?.s0);
  }, { groupId: session.group.id, memberId: session.credentials.memberId })).toBe(true);
  // Simulate a network failure, never a successful API response.
  await page.route('**/api/session', route => route.abort(), { times: 1 });
  await page.reload();
  await expect(page.getByRole('status', { name: 'Stan połączenia', exact: true })).toContainText('Brak połączenia');
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true })).toBeEnabled();
  await expect(page.getByRole('status', { name: 'Stan połączenia', exact: true })).toHaveCount(0);
  await expectSaved(request, session, ['s0']);
});

test('unchecking a cached extra before session refresh persists the explicit uncheck', async ({ page, request }) => {
  const session = await createPlan(request, 'cached-extra-uncheck');
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect.poll(() => page.evaluate(({ key, memberId }) =>
    Boolean(JSON.parse(localStorage.getItem(key) ?? 'null')?.group.progress[memberId]?.s2),
    { key: 'plan-czytania-biblii-group-' + session.group.id, memberId: session.credentials.memberId },
  )).toBe(true);
  await page.evaluate(({ key, memberId }) => {
    const cached = JSON.parse(localStorage.getItem(key));
    // Recreate an older real cache snapshot; backend still has the saved extra.
    delete cached.group.progress[memberId].s2;
    localStorage.setItem(key, JSON.stringify(cached));
  }, { key: 'plan-czytania-biblii-group-' + session.group.id, memberId: session.credentials.memberId });
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/session', async route => {
    const response = await route.fetch();
    started(response.status());
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.reload();
    expect(await captured).toBe(200);
    expect(await page.evaluate(({ key, memberId }) =>
      Boolean(JSON.parse(localStorage.getItem(key)).group.progress[memberId].s2),
      { key: 'plan-czytania-biblii-group-' + session.group.id, memberId: session.credentials.memberId },
    )).toBe(false);
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
    await extraReading(page).click();
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expectSaved(request, session, ['s0', 's1']);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Odśwież plan i dane użytkownika', exact: true })).toBeEnabled();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, ['s0', 's1']);
});
