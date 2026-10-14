import { test, expect } from './fixtures.mjs';
import { createPlan, inputPlan, NOW, TODAY, openPlan, readGroup, saveProgress, expectSaved, reading, extraReading, tab, expectFloatingPopup } from './helpers.mjs';
const path = session => '/api/groups/' + session.group.id + '/recovery-prompt';
async function preference(request, session, action = 'read', overrides = {}) {
  const response = await request.post(path(session), { data: { ...session.credentials, action, ...overrides } });
  expect(response.status()).toBe(200);
  return response.json();
}

for (const width of [1280, 390]) {
  test('notice overlaps the short mobile screen, details are independent and enable preserves actual progress at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: width === 390 ? 640 : 900 });
    const session = await createPlan(request, 'prompt-layout-' + width);
    await openPlan(page, session);
    const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania', exact: true });
    await expect(notice).toBeVisible();
    await expectFloatingPopup(page, notice);
    const primary = await notice.getByRole('button', { name: 'Włącz', exact: true }).evaluate(button => getComputedStyle(button).backgroundColor);
    const secondary = await notice.getByRole('button', { name: 'Pokaż szczegóły', exact: true }).evaluate(button => getComputedStyle(button).backgroundColor);
    expect(secondary).toBe('rgba(0, 0, 0, 0)');
    expect(primary).not.toBe(secondary);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '0');
    if (width === 390) {
      const banner = await notice.boundingBox(), navigation = await page.locator('.mobile-tabs').boundingBox(), days = await page.locator('.reading-navigation').boundingBox();
      expect(banner.y + banner.height).toBeLessThanOrEqual(navigation.y + 1);
      expect(banner.y).toBeLessThan(days.y + days.height);
      expect(banner.height).toBeLessThan(640 / 3);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await test.info().attach('reading-notice-' + width, { body: await page.screenshot(), contentType: 'image/png' });
    await notice.getByRole('button', { name: 'Pokaż szczegóły', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Chcesz włączyć nadrabianie?', exact: true });
    await expect(dialog).toBeVisible();
    await expect(notice).not.toBeVisible();
    await expect(dialog.locator('.recovery-example')).toHaveCount(1);
    await expect(dialog.locator('.recovery-example-reading strong')).toHaveText('+ Rdz 2');
    await test.info().attach('reading-details-' + width, { body: await page.screenshot(), contentType: 'image/png' });
    await expect(extraReading(page)).toHaveCount(0);
    await expectSaved(request, session, []);
    await dialog.getByRole('button', { name: 'Włącz', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(extraReading(page)).toContainText('Rdz 2');
    await expect(extraReading(page)).toBeDisabled();
    await expectSaved(request, session, []);
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    const currentDate = page.locator('.reading-date[aria-pressed="true"]');
    await expect(currentDate).toHaveAttribute('data-day-id', 'recovery:' + TODAY);
    await expect(currentDate).toHaveAttribute('data-complete', 'false');
    await extraReading(page).click();
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await expect(currentDate).toHaveAttribute('data-complete', 'true');
    await extraReading(page).click();
    await expectSaved(request, session, ['s0', 's1']);
    await expect(currentDate).toHaveAttribute('data-complete', 'false');
  });

  test('not now persists for a week and never survives a fresh browser while manual recovery remains available at width ' + width, async ({ page, request, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'prompt-choice-' + width);
    await openPlan(page, session);
    const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Nie teraz', exact: true }).click();
    await expect(notice).not.toBeVisible();
    await expect.poll(async () => (await preference(request, session)).snoozedUntil).not.toBeNull();
    const snoozed = await preference(request, session);
    expect(snoozed.disabled).toBe(false);
    expect(Date.parse(snoozed.snoozedUntil)).toBeGreaterThan(NOW.getTime());
    await page.reload();
    await page.getByRole('button', { name: 'Nadrabianie', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Chcesz włączyć nadrabianie?' });
    await expect(notice).not.toBeVisible();
    await dialog.getByRole('button', { name: 'Nie pokazuj więcej', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => preference(request, session)).toEqual({ disabled: true, snoozedUntil: null });
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width, height: 900 }, timezoneId: 'UTC', serviceWorkers: 'block' });
    try {
      const fresh = await context.newPage();
      await openPlan(fresh, session);
      await fresh.getByRole('button', { name: 'Nadrabianie', exact: true }).click();
      await expect(fresh.getByRole('complementary', { name: 'Propozycja nadrabiania' })).not.toBeVisible();
      await fresh.getByRole('dialog').getByRole('button', { name: 'Włącz', exact: true }).click();
      await expect(extraReading(fresh)).toBeVisible();
      await expectSaved(request, session, []);
      await expect.poll(() => preference(request, session)).toEqual({ disabled: true, snoozedUntil: null });
    } finally { await context.close(); }
  });
}

test('snoozed suggestion returns after a week and a rejected choice is retryable', async ({ page, request }) => {
  const session = await createPlan(request, 'prompt-expiry-rejection');
  await preference(request, session, 'later');
  await openPlan(page, session);
  await page.clock.setSystemTime(new Date(NOW.getTime() + 8 * 86400000));
  await page.reload();
  const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
  await expect(notice).toBeVisible();
  await page.route('**' + path(session), async route => {
    const data = route.request().postDataJSON();
    if (data.action === 'later') await route.continue({ postData: JSON.stringify({ ...data, token: 'E2E invalid token' }) });
    else await route.continue();
  });
  await notice.getByRole('button', { name: 'Nie teraz', exact: true }).click();
  await expect(notice.getByRole('alert')).toHaveText('Nie udało się zapisać wyboru. Spróbuj ponownie.');
  await expect(notice).toBeVisible();
  await page.unroute('**' + path(session));
  await notice.getByRole('button', { name: 'Nie teraz', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expectSaved(request, session, []);
});

test('three overdue readings and a three-times-weekly plan do not trigger the proposal prematurely', async ({ page, request }) => {
  const plan = inputPlan('prompt-threshold');
  plan.planDays = plan.planDays.slice(0, 3);
  const created = await request.post('/api/groups', { data: plan });
  expect(created.status()).toBe(201);
  const session = await created.json();
  await openPlan(page, session);
  await page.getByRole('button', { name: 'Nadrabianie', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Propozycja nadrabiania' })).not.toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Nie teraz', exact: true }).click();
  const weeklyPlan = inputPlan('prompt-cadence');
  weeklyPlan.frequency = { kind: 'custom', days: [1, 3, 5] };
  const monday = new Date(NOW); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  weeklyPlan.startDate = monday.toISOString().slice(0, 10);
  weeklyPlan.planDays = weeklyPlan.planDays.slice(0, 3).map((day, index) => ({ ...day, date: new Date(monday.getTime() + index * 2 * 86400000).toISOString().slice(0, 10) }));
  const weeklyCreated = await request.post('/api/groups', { data: weeklyPlan }); expect(weeklyCreated.status()).toBe(201);
  const weekly = await weeklyCreated.json();
  const other = await page.context().newPage();
  await openPlan(other, weekly);
  await expect(other.getByTestId('reading-balance')).toHaveText('Na bieżąco');
  await tab(other, 'Plan').click();
  await expect(other.getByTestId('weekly-readings')).toHaveText('0 z 3 czytań');
  await tab(other, 'Czytaj').click();
  await expect(other.getByRole('complementary', { name: 'Propozycja nadrabiania' })).not.toBeVisible();
  await other.close();
});

test('direct activation from the notice survives reload without writing reading progress', async ({ page, request }) => {
  const session = await createPlan(request, 'prompt-direct-enable');
  await openPlan(page, session);
  const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
  await notice.getByRole('button', { name: 'Włącz', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expectSaved(request, session, []);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true })).toBeVisible();
  await expect(notice).not.toBeVisible();
  await expectSaved(request, session, []);
});

test('a stale cached backlog never prompts before fresh session progress has loaded', async ({ page, request }) => {
  const session = await createPlan(request, 'prompt-stale-cache');
  const ids = session.group.planDays.flatMap(day => day.segments).map(segment => segment.id);
  for (const id of ids) await saveProgress(request, session, id);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/session', async route => {
    started(); await gate; await route.continue();
  }, { times: 1 });
  const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
  try {
    await openPlan(page, session, {
      ['plan-czytania-biblii-group-' + session.group.id]: JSON.stringify({ group: session.group, savedAt: NOW.toISOString() }),
    });
    await captured;
    await expect(page.getByTestId('overdue-readings')).toHaveText('5');
    await expect(notice).not.toBeVisible();
    await expectSaved(request, session, ids);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Plan ukończony', exact: true })).toBeVisible();
  await expect(notice).not.toBeVisible();
  await expectSaved(request, session, ids);
});

test('prompt preferences are private, authenticated, per member and per plan and preserve concurrent progress', async ({ request }) => {
  const session = await createPlan(request, 'prompt-api-scope');
  const join = await request.post('/api/groups/' + session.group.id + '/join', { data: { name: 'E2E second', inviteToken: session.credentials.inviteToken } });
  expect(join.status()).toBe(201);
  const second = await join.json();
  const responses = await Promise.all([
    request.post(path(session), { data: { ...session.credentials, action: 'never' } }),
    request.post('/api/groups/' + session.group.id + '/progress', { data: { ...session.credentials, segmentId: 's0', completed: true } }),
  ]);
  for (const response of responses) expect(response.status()).toBe(200);
  expect(await preference(request, session, 'stop')).toEqual({ disabled: true, snoozedUntil: null });
  expect(await preference(request, second)).toEqual({ disabled: false, snoozedUntil: null });
  for (const action of ['read', 'never']) {
    const denied = await request.post(path(session), { data: { ...session.credentials, memberId: second.credentials.memberId, action } });
    expect(denied.status()).toBe(401);
  }
  const invalid = await request.post(path(session), { data: { ...session.credentials, action: 'surprise' } }); expect(invalid.status()).toBe(400);
  const publicGroup = await readGroup(request, session);
  for (const member of publicGroup.members) expect(member).not.toHaveProperty('recoveryPrompt');
  await expectSaved(request, session, ['s0']);
  const other = await createPlan(request, 'prompt-other-plan');
  const crossGroup = await request.post(path(other), { data: { ...session.credentials, action: 'never' } }); expect(crossGroup.status()).toBe(401);
  expect(await preference(request, other)).toEqual({ disabled: false, snoozedUntil: null });
});

 test('stopping recovery snoozes for 24 hours across reloads', async ({ page, request }) => {
  const session = await createPlan(request, 'prompt-stop');
  await openPlan(page, session);
  const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
  await notice.getByRole('button', { name: 'Włącz', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(page.getByRole('status')).not.toBeVisible();
  await expect.poll(async () => (await preference(request, session)).snoozedUntil).not.toBeNull();
  const saved = await preference(request, session);
  expect(Date.parse(saved.snoozedUntil) - Date.now()).toBeGreaterThan(23 * 3600000);
  expect(Date.parse(saved.snoozedUntil) - Date.now()).toBeLessThanOrEqual(24 * 3600000);
  await page.reload();
  await expect(notice).not.toBeVisible();
  await page.clock.setSystemTime(new Date(Date.parse(saved.snoozedUntil) + 1));
  await page.reload();
  await expect(notice).toBeVisible();
 });

 test('not now hides immediately while the real save is pending', async ({ page, request }) => {
  const session = await createPlan(request, 'prompt-optimistic');
  await openPlan(page, session);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + path(session), async route => {
    if (route.request().postDataJSON().action === 'later') await gate;
    await route.continue();
  });
  const notice = page.getByRole('complementary', { name: 'Propozycja nadrabiania' });
  try {
    await notice.getByRole('button', { name: 'Nie teraz', exact: true }).click();
    await expect(notice).not.toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Zapisuję wybór…');
  } finally { release(); }
  await expect(page.getByRole('status')).not.toBeVisible();
  await expect.poll(async () => (await preference(request, session)).snoozedUntil).not.toBeNull();
 });
