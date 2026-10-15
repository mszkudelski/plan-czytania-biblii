import { test, expect } from './fixtures.mjs';
import { enableRecovery, expectWeek, createPlan, inputPlan, NOW, openPlan, saveProgress, readGroup, expectSaved, reading, extraReading, browseReading, tab } from './helpers.mjs';

const date = offset => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
const restHint = 'Dziś dzień wolny w planie. Możesz czytać dalej we własnym tempie.';
async function timeline(request, suffix, offsets, startOffset = offsets[0], weekly = false) {
  const plan = inputPlan(suffix);
  plan.startDate = date(startOffset);
  if (weekly) plan.frequency = { kind: 'custom', days: [1, 3, 5] };
  plan.planDays = offsets.map((offset, index) => ({
    id: `t${index}`, index, date: date(offset), title: `Dzień ${index + 1}`,
    segments: [
      { id: `t${index}a`, label: `Rdz ${index + 1}`, section: 'Stary Testament' },
      { id: `t${index}b`, label: `Mt ${index + 1}`, section: 'Nowy Testament' },
    ],
  }));
  const response = await request.post('/api/groups', { data: plan });
  expect(response.status()).toBe(201);
  const session = await response.json();
  expect(session.group.name).toMatch(/^E2E /);
  test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  return session;
}
async function fitsViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1280, 390]) {
  test('return arrows point to the personal position and never write progress at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-return-' + width);
    for (const id of ['s0', 's1', 's2']) await saveProgress(request, session, id);
    await openPlan(page, session);
    const jump = page.getByRole('button', { name: 'Wróć do swojego miejsca', exact: true });
    const nav = page.getByRole('navigation', { name: 'Przeglądaj czytania', exact: true });
    await expect(reading(page, 'Rdz 4')).toBeVisible();
    await expect(jump).toHaveCount(0);
    await browseReading(page, 4);
    await expect(jump).toBeVisible();
    const style = await jump.evaluate(button => {
      const computed = getComputedStyle(button), box = button.getBoundingClientRect();
      return { background: computed.backgroundColor, border: computed.borderTopWidth, width: box.width, height: box.height };
    });
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    expect(style.border).toBe('0px');
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    await expect(jump.locator('svg path')).toHaveAttribute('d', 'm11 17-5-5 5-5m7 10-5-5 5-5');
    await jump.click();
    await expect(nav).toHaveAttribute('data-selected-index', '2');
    await expect(jump).toHaveCount(0);
    await browseReading(page, 0);
    await expect(jump.locator('svg path')).toHaveAttribute('d', 'm6 17 5-5-5-5m7 10 5-5-5-5');
    await jump.click();
    await expect(reading(page, 'Rdz 4')).toBeVisible();
    await expect(jump).toHaveCount(0);
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await fitsViewport(page);
  });

  test('overdue status takes precedence over future completed days at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const monday = -((NOW.getUTCDay() + 6) % 7);
    const session = await timeline(request, 'home-week-' + width,
      [monday - 7, monday - 5, monday - 3, monday, monday + 2, monday + 4, monday + 7, monday + 9], monday - 7, true);
    const saved = [];
    await openPlan(page, session);
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await expectWeek(page, '0 z 3 czytań');
    for (let i = 3; i <= 5; i++) {
      await browseReading(page, i);
      await reading(page, 'Rdz ' + (i + 1)).click();
      await expectWeek(page, (i - 3) + ' z 3 czytań');
      await reading(page, 'Mt ' + (i + 1)).click();
      saved.push('t' + i + 'a', 't' + i + 'b');
      await expectSaved(request, session, saved);
      await expectWeek(page, (i - 2) + ' z 3 czytań');
    }
    await tab(page, 'Plan').click();
    await expect(page.getByRole('region', { name: 'Postęp tygodnia', exact: true })).toContainText('Tydzień ukończony');
    await tab(page, 'Czytaj').click();
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await browseReading(page, 6);
    await reading(page, 'Rdz 7').click();
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await reading(page, 'Mt 7').click();
    saved.push('t6a', 't6b');
    await expectSaved(request, session, saved);
    await expect(page.getByTestId('ahead-readings')).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('reading-balance')).not.toContainText('Do przodu');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await expectWeek(page, '3 z 3 czytań');
    await page.reload();
    await expect(page.getByTestId('ahead-readings')).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('reading-balance')).not.toContainText('Do przodu');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await expectWeek(page, '3 z 3 czytań');
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await page.clock.setSystemTime(new Date(NOW.getTime() + (7 + monday) * 86400000));
    await page.reload();
    await expect(page.getByTestId('reading-balance')).toContainText('Zaległość');
    await expect(page.getByTestId('overdue-readings')).toHaveText('3');
    await expectWeek(page, '1 z 2 czytań');
    await fitsViewport(page);
  });

  test('reading is first, completion survives reload and continuing is optional at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-portion-' + width);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: session.group.name, exact: true })).toBeVisible();
    await expect(page.locator('.reading-context, .day-strip, .reading-overview')).toHaveCount(0);
    await expect(page.getByLabel('Postęp wybranego czytania', { exact: true })).toHaveText('0/2');
    expect(await page.evaluate(() => document.querySelector('.reading-summary').getBoundingClientRect().top < document.querySelector('.reading-focus').getBoundingClientRect().top)).toBe(true);
    await fitsViewport(page);
    await reading(page, 'Rdz 1').click();
    await expect(page.getByLabel('Postęp wybranego czytania', { exact: true })).toHaveText('1/2');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
    await expect(page.locator('.reading-finished')).toContainText('Przeczytane');
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Następne', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.reading-finished')).toContainText('Przeczytane');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.reading-finished')).toHaveText('Przeczytane');
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
    await expectSaved(request, session, ['s0', 's1']);
    await fitsViewport(page);
  });

  test('finishing overdue reading updates the week, survives reload and reverses on uncheck at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const monday = -((NOW.getUTCDay() + 6) % 7);
    const session = await timeline(request, 'home-overdue-week-' + width, [monday - 7, monday, monday + 2, monday + 4], monday - 7, true);
    await openPlan(page, session);
    const day = page.locator('.reading-date[data-day-id="t0"]');
    await expect(day).toHaveAttribute('data-complete', 'false');
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, ['t0a']);
    await expect(day).toHaveAttribute('data-complete', 'false');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a', 't0b']);
    await expect(day).toHaveAttribute('data-complete', 'true');
    await expectWeek(page, '1 z 3 czytań');
    await page.reload();
    await expect(day).toHaveAttribute('data-complete', 'true');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a']);
    await expect(day).toHaveAttribute('data-complete', 'false');
    await expectWeek(page, '0 z 3 czytań');
    await fitsViewport(page);
  });

  test('past debt, calendar today and reading ahead stay separate at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-summary-' + width, [-1, 0, 1]);
    for (const id of ['t0a', 't1a', 't2a', 't2b']) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByTestId('overdue-readings')).toHaveText('1');
    await expect(page.getByTestId('reading-balance')).toContainText('1dzień');
    await expect(page.getByTestId('ahead-readings')).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).not.toContainText('Do przodu');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a', 't0b', 't1a', 't2a', 't2b']);
    await expect(page.getByTestId('overdue-readings')).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).toContainText('Do przodu');
    await expect(page.getByTestId('ahead-readings')).toHaveText('1');
    await expect(page.getByTestId('reading-balance')).toContainText('1dzień');
    await tab(page, 'Plan').click();
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '66.5');
    await tab(page, 'Czytaj').click();
    await expectSaved(request, session, ['t0a', 't0b', 't1a', 't2a', 't2b']);
    await fitsViewport(page);
  });

  test('a future plan shows editable reading immediately at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-before-start-' + width, [2, 3]);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Plan jeszcze się nie rozpoczął', exact: true })).toBeVisible();
    await expect(page.getByText(restHint, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zobacz pierwsze czytanie', exact: true })).toHaveCount(0);
    await expect(reading(page, 'Rdz 1')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Zaznacz czytanie z wyprzedzeniem', exact: true })).toHaveCount(0);
    await expectSaved(request, session, []);
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, ['t0a']);
    await page.reload();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(reading(page, 'Rdz 1')).toBeEnabled();
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, []);
    await fitsViewport(page);
  });

  test('a rest day offers upcoming reading without assigning it to today at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-rest-' + width, [-2, 2]);
    await saveProgress(request, session, 't0a');
    await saveProgress(request, session, 't0b');
    await openPlan(page, session);
    await expect(page.getByTestId('reading-balance')).toHaveText('Na bieżąco');
    await expect(page.locator('.simple-day > .reading-rest-hint')).toHaveText(restHint);
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(2));
    await expect(reading(page, 'Rdz 2')).toBeEnabled();
    await expectSaved(request, session, ['t0a', 't0b']);
    await expect(page.getByRole('button', { name: 'Czytaj naprzód', exact: true })).toHaveCount(0);
    await reading(page, 'Rdz 2').click();
    await expectSaved(request, session, ['t0a', 't0b', 't1a']);
    await page.reload();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.simple-day > .reading-rest-hint')).toHaveText(restHint);
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await fitsViewport(page);
  });

  test('a rest-day hint keeps the earlier unread day open without a separate backlog screen at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-rest-unread-' + width, [-2, 2]);
    await openPlan(page, session);
    await expect(page.locator('.simple-day > .reading-rest-hint')).toHaveText(restHint);
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(-2));
    await expect(reading(page, 'Rdz 1')).toBeEnabled();
    await expect(reading(page, 'Rdz 2')).toHaveCount(0);
    await expectSaved(request, session, []);
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, ['t0a']);
    await page.reload();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.simple-day > .reading-rest-hint')).toHaveText(restHint);
    await fitsViewport(page);
  });

  test('a finished standard plan is clear and still allows browsing completed days at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-finished-' + width, [-2, -1, 0]);
    const ids = session.group.planDays.flatMap(day => day.segments).map(segment => segment.id);
    for (const id of ids) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Plan ukończony', exact: true })).toBeVisible();
    await expect(page.getByText(restHint, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).toHaveText('Na bieżąco');
    await tab(page, 'Plan').click();
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '100');
    await tab(page, 'Czytaj').click();
    await expect(page.getByRole('button', { name: 'Nadrabianie', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
    await expectSaved(request, session, ids);
    await fitsViewport(page);
  });

  test('catch-up turns itself off after debt is cleared even when the member is far ahead at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-catchup-reconcile-' + width, [-2, -1, 0, 1, 2, 3, 4, 5, 6]);
    const future = Array.from({ length: 6 }, (_, index) => [`t${index + 3}a`, `t${index + 3}b`]).flat();
    for (const id of ['t0a', 't0b', 't1a', ...future]) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByTestId('overdue-readings')).toHaveText('1');
    await page.evaluate(({ groupId, memberId }) => {
      const recoveryKey = `reading-recovery:${groupId}:${memberId}`;
      localStorage.setItem(recoveryKey, 'enabled');
      localStorage.setItem(`${recoveryKey}:chapters`, JSON.stringify({ t1b: 1 }));
    }, { groupId: session.group.id, memberId: session.credentials.memberId });
    await page.reload();
    await expectSaved(request, session, ['t0a', 't0b', 't1a', 't1b', ...future]);
    await expect(page.getByTestId('overdue-readings')).toHaveCount(0);
    await expect(page.getByTestId('reading-balance')).toContainText('Do przodu');
    await expect(page.getByTestId('ahead-readings')).toHaveText('6');
    await expect(page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true })).toHaveCount(0);
    expect(await page.evaluate(({ groupId, memberId }) =>
      localStorage.getItem(`reading-recovery:${groupId}:${memberId}`),
    { groupId: session.group.id, memberId: session.credentials.memberId })).toBeNull();
    await fitsViewport(page);
  });

  test('catch-up ends immediately after the final overdue reading despite a frozen extra at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-catchup-frozen-extra-' + width, [-1, 0, 1, 2]);
    await openPlan(page, session);
    await enableRecovery(page);
    await expect(extraReading(page)).toContainText('Rdz 2');
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a', 't0b']);
    const key = 'reading-recovery:' + session.group.id + ':' + session.credentials.memberId;
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    await expect(page.getByTestId('reading-balance')).toHaveText('Na bieżąco');
    await expect(page.locator('.reading-recovery-link')).toHaveCount(0);
    await expect(extraReading(page)).toHaveCount(0);
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('.reading-recovery-link')).toHaveCount(0);
    await expect(extraReading(page)).toHaveCount(0);
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
    await expectSaved(request, session, ['t0a', 't0b']);
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await fitsViewport(page);
  });

  test('catch-up re-dates the first unread day to today and only navigates forward at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-catchup-forward-' + width, [-4, -3, -2, -1, 0]);
    for (const id of ['t0a', 't0b', 't1a', 't1b']) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByTestId('overdue-readings')).toHaveText('2');
    await enableRecovery(page);
    await expect(page.getByTestId('reading-balance')).toHaveText('Do nadrobienia2dni');
    await expect(page.getByTestId('overdue-readings')).toHaveCount(0);
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(0));
    await expect(reading(page, 'Rdz 3')).toBeVisible();
    await expect(reading(page, 'Mt 3')).toBeVisible();
    await expect(extraReading(page)).toContainText('Rdz 4');
    await expect(page.locator('.reading-date[data-day-id="t0"]')).toBeVisible();
    await expect(page.locator('.reading-date[data-day-id="t1"]')).toBeVisible();
    await expect(page.locator('.reading-date[data-day-id="t2"], .reading-date[data-day-id="t3"]')).toHaveCount(0);
    await expect(page.locator('.reading-date[data-day-id^="recovery:"]')).not.toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Poprzednie', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(-3));
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Wróć do swojego miejsca', exact: true }).click();
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(0));
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', date(1));
    await expectSaved(request, session, ['t0a', 't0b', 't1a', 't1b']);
    await fitsViewport(page);
  });

  test('the final catch-up check stays in recovery until saved and survives backend rejection at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-catchup-last-save-' + width, [-1, 0, 1]);
    await saveProgress(request, session, 't0a');
    await openPlan(page, session);
    await enableRecovery(page);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/groups/' + session.group.id + '/progress', async route => {
      await gate;
      await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'E2E invalid token' }) });
    }, { times: 1 });
    try {
      await reading(page, 'Mt 1').click();
      await expect(page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true })).toBeVisible();
      await expect(page.getByTestId('reading-balance')).toHaveText('Zapisuję postęp…');
      await expectSaved(request, session, ['t0a']);
    } finally { release(); }
    await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true })).toBeVisible();
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a', 't0b']);
    await expect(page.locator('.reading-recovery-link')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.reading-recovery-link')).toHaveCount(0);
  });

  test('completed catch-up rows are not duplicated as adjacent history days at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-catchup-history-duplicate-' + width);
    await openPlan(page, session);
    await enableRecovery(page);
    await expect(page.getByTestId('reading-balance')).toContainText('Do nadrobienia');
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
    await expect(page.locator('.reading-date[data-day-id="d0"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Poprzednie', exact: true })).toBeDisabled();
    await extraReading(page).click();
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await expect(page.locator('.reading-date[data-day-id="d0"], .reading-date[data-day-id="d1"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.reading-date[data-day-id="d0"], .reading-date[data-day-id="d1"]')).toHaveCount(0);
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(reading(page, 'Rdz 4')).toBeVisible();
    await expect(reading(page, 'Rdz 1')).toHaveCount(0);
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await fitsViewport(page);
  });

  test('catch-up shows one brief example and future reading is immediately editable at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-catchup-preview-' + width);
    await openPlan(page, session);
    await page.getByRole('button', { name: 'Nadrabianie', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Chcesz włączyć nadrabianie?', exact: true });
    await expect(panel).toContainText('Do zwykłego czytania dodamy jeden rozdział dziennie.');
    await expect(panel.locator('.recovery-example')).toHaveCount(1);
    await expect(panel.locator('.recovery-example-reading strong')).toHaveText('+ Rdz 2');
    await expectSaved(request, session, []);
    await panel.getByRole('button', { name: 'Włącz', exact: true }).click();
    await expect(extraReading(page)).toContainText('Rdz 2');
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(reading(page, 'Rdz 4')).toBeEnabled();
    await expect(extraReading(page)).toBeDisabled();
    await expectSaved(request, session, []);
    await reading(page, 'Rdz 4').click();
    await expectSaved(request, session, ['s3']);
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await expect(page.getByRole('button', { name: 'Wróć do podglądu', exact: true })).toHaveCount(0);
    await expect(reading(page, 'Rdz 4')).toBeEnabled();
    await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
    await fitsViewport(page);
  });
}
