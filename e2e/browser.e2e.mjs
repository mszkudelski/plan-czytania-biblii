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
