import { test, expect } from '@playwright/test';
import {
  createPlan, openPlan, saveProgress, expectSaved, readGroup, reading,
  extraReading, tab, recoveryKey, TODAY, NOW, holdNextProgress, progressPath,
} from './helpers.mjs';

test('standard reading is optimistic, saves to backend and survives reload', async ({ page, request }) => {
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
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true })).toBeVisible();
  await expect(page.locator('details.recovery-details')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true }).click();
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
  await page.getByRole('button', { name: 'Wyłącz plan nadrabiania' }).click();
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
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
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
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
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
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
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
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
    await tab(page, 'Plan').click();
    await tab(page, 'Dzisiaj').click();
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, ['s0', 's1']);
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
});

test('partial extra chapter persists locally; tomorrow resumes remaining chapters', async ({ page, request }) => {
  const session = await createPlan(request, 'partial-chapter', true);
  await openPlan(page, session);
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']); // No whole segment completed yet.
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await page.clock.setSystemTime(new Date(NOW.getTime() + 86400000));
  await page.reload();
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 4');
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
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

test('completed plan has no future recovery extra', async ({ page, request }) => {
  const session = await createPlan(request, 'complete');
  for (const segment of session.group.planDays.flatMap(day => day.segments)) {
    await saveProgress(request, session, segment.id);
  }
  await openPlan(page, session, { [recoveryKey(session)]: TODAY });
  await expect(page.getByRole('heading', { name: 'Plan ukończony' })).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await expect(page.locator('.day-switcher')).toBeVisible();
  await page.getByRole('button', { name: 'Poprzedni dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 5')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.day-strip button').last().click();
  await expect(reading(page, 'Rdz 6')).toHaveAttribute('aria-pressed', 'true');
  await expect(extraReading(page)).toHaveCount(0);
});

test('recovery advances at midnight without reloading the page', async ({ page, request }) => {
  const session = await createPlan(request, 'midnight', true);
  await openPlan(page, session);
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward('12:00:01');
  await expect(reading(page, 'Rdz 3')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 4');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
});

test('enabling recovery preserves day navigation and returns to the current portion', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery-navigation');
  await openPlan(page, session);
  const switcher = page.locator('.day-switcher');
  const dates = switcher.locator('.day-strip button');
  await expect(switcher).toBeVisible();
  await dates.nth(4).click();
  await expect(reading(page, 'Rdz 6')).toBeVisible();

  // Enabling recovery still starts at personal progress, even when browsing ahead.
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
  await expect(switcher).toBeVisible();
  await expect(dates).toHaveCount(5);
  await expect(dates.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(page.getByRole('button', { name: 'Poprzedni dzień', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 2')).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await reading(page, 'Rdz 2').click();
  await expectSaved(request, session, ['s2']);

  await page.getByRole('button', { name: 'Poprzedni dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(reading(page, 'Mt 1')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 4');
  await expect(extraReading(page)).toBeDisabled();

  // Clicking a date also works and does not move the saved daily recovery anchor.
  await dates.nth(4).click();
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Następny dzień', exact: true })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey(session) + ':ordered:' + TODAY + ':day')).toBe('d0');
  await page.getByRole('button', { name: 'Wyłącz plan nadrabiania' }).click();
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await expect(switcher).toBeVisible();
  await expectSaved(request, session, ['s2']);
  expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
});

test('recovery navigation respects partial chapters and reload returns to today', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await createPlan(request, 'recovery-navigation-partial', true);
  await openPlan(page, session);
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 3')).toBeVisible();
  await expect(extraReading(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Poprzedni dzień', exact: true }).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.day-strip button').nth(4).click();
  await expect(reading(page, 'Rdz 6')).toBeVisible();
  await page.reload();
  await expect(page.locator('.day-switcher')).toBeVisible();
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
  await expect(page.locator('.simple-day header b')).toHaveText('2/2');
  await expect(page.locator('.day-strip button').nth(0)).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 2').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.day-strip button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('.day-strip button').nth(0).click();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
});

test('completed recovery portion keeps its one extra and advances only through day navigation', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery-completed-day');
  await openPlan(page, session);
  await page.getByRole('button', { name: 'Włącz plan nadrabiania' }).click();
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expect(extraReading(page)).toBeEnabled();
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.simple-day header b')).toHaveText('3/3');
  await expect(page.locator('.day-strip button').nth(0)).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  // This day was completed by the extra chapter; browsing still follows plan order.
  await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(extraReading(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s0', 's1', 's2', 's3']);
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.day-strip button').nth(2)).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.day-strip button').nth(0).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey(session) + ':ordered:' + TODAY + ':day')).toBe('d0');
});
