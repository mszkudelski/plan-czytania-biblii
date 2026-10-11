import { test, expect } from '@playwright/test';
import { createPlan, inputPlan, NOW, openPlan, saveProgress, readGroup, expectSaved, reading, extraReading, browseReading, tab } from './helpers.mjs';

const date = offset => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
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

  test('three-reading week, completion and ahead remain separate at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const monday = -((NOW.getUTCDay() + 6) % 7);
    const session = await timeline(request, 'home-week-' + width,
      [monday - 7, monday - 5, monday - 3, monday, monday + 2, monday + 4, monday + 7, monday + 9], monday - 7, true);
    const saved = [];
    await openPlan(page, session);
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania');
    await expect(page.getByTestId('weekly-readings')).toHaveText('0 z 3 czytań');
    for (let i = 3; i <= 5; i++) {
      await browseReading(page, i);
      await reading(page, 'Rdz ' + (i + 1)).click();
      await expect(page.getByTestId('weekly-readings')).toHaveText((i - 3) + ' z 3 czytań');
      await reading(page, 'Mt ' + (i + 1)).click();
      saved.push('t' + i + 'a', 't' + i + 'b');
      await expectSaved(request, session, saved);
      await expect(page.getByTestId('weekly-readings')).toHaveText((i - 2) + ' z 3 czytań');
    }
    await expect(page.getByRole('region', { name: 'Postęp tygodnia', exact: true })).toContainText('Tydzień ukończony');
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania');
    await browseReading(page, 6);
    await reading(page, 'Rdz 7').click();
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania');
    await reading(page, 'Mt 7').click();
    saved.push('t6a', 't6b');
    await expectSaved(request, session, saved);
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania · +1 czytanie');
    await expect(page.getByTestId('weekly-readings')).toHaveText('3 z 3 czytań');
    await page.reload();
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania · +1 czytanie');
    await expect(page.getByTestId('weekly-readings')).toHaveText('3 z 3 czytań');
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await page.clock.setSystemTime(new Date(NOW.getTime() + (7 + monday) * 86400000));
    await page.reload();
    await expect(page.getByTestId('reading-balance')).toHaveText('−3 czytania');
    await expect(page.getByTestId('weekly-readings')).toHaveText('1 z 2 czytań');
    await fitsViewport(page);
  });

  test('reading is first, completion survives reload and continuing is optional at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-portion-' + width);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: session.group.name, exact: true })).toBeVisible();
    await expect(page.locator('.reading-context, .day-strip, .reading-overview')).toHaveCount(0);
    await expect(page.getByLabel('Postęp wybranego czytania', { exact: true })).toHaveText('0 z 2 fragmentów');
    expect(await page.evaluate(() => document.querySelector('.reading-focus').getBoundingClientRect().top < document.querySelector('.reading-week').getBoundingClientRect().top)).toBe(true);
    await fitsViewport(page);
    await reading(page, 'Rdz 1').click();
    await expect(page.getByLabel('Postęp wybranego czytania', { exact: true })).toHaveText('1 z 2 fragmentów');
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
    const bar = page.getByRole('progressbar', { name: 'Ukończone czytania w tym tygodniu', exact: true });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, ['t0a']);
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a', 't0b']);
    await expect(page.getByTestId('weekly-readings')).toHaveText('1 z 3 czytań');
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('.reading-week-track .done')).toHaveCount(1);
    await page.reload();
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['t0a']);
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(page.locator('.reading-week-track .done')).toHaveCount(0);
    await fitsViewport(page);
  });

  test('past debt, calendar today and reading ahead stay separate at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-summary-' + width, [-1, 0, 1]);
    for (const id of ['t0a', 't1a', 't2a', 't2b']) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByTestId('overdue-readings')).toHaveText('−1 czytanie');
    await expect(page.getByTestId('ahead-readings')).toHaveText('+1 czytanie');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('reading-balance')).toHaveText('−1 czytanie · +1 czytanie');
    await tab(page, 'Plan').click();
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '66.5');
    await tab(page, 'Czytaj').click();
    await expectSaved(request, session, ['t0a', 't1a', 't2a', 't2b']);
    await fitsViewport(page);
  });

  test('a future plan shows editable reading immediately at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-before-start-' + width, [2, 3]);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Plan jeszcze się nie rozpoczął', exact: true })).toBeVisible();
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
    await expect(reading(page, 'Rdz 2')).toBeEnabled();
    await expectSaved(request, session, ['t0a', 't0b']);
    await fitsViewport(page);
  });

  test('a finished standard plan is clear and still allows browsing completed days at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-finished-' + width, [-2, -1, 0]);
    const ids = session.group.planDays.flatMap(day => day.segments).map(segment => segment.id);
    for (const id of ids) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Plan ukończony', exact: true })).toBeVisible();
    await expect(page.getByTestId('reading-balance')).toHaveText('Na bieżąco');
    await tab(page, 'Plan').click();
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '100');
    await tab(page, 'Czytaj').click();
    await expect(page.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Poprzednie', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
    await expectSaved(request, session, ids);
    await fitsViewport(page);
  });

  test('catch-up shows one brief example and future reading is immediately editable at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-catchup-preview-' + width);
    await openPlan(page, session);
    const panel = page.getByRole('region', { name: 'Plan nadrabiania', exact: true });
    await panel.getByText('Przykładowy dzień', { exact: true }).click();
    await expect(panel).toContainText('Zwykłe czytanie + jeden dodatkowy rozdział.');
    await expect(panel.locator('.recovery-preview li')).toHaveCount(1);
    await expect(panel.locator('p')).toHaveCount(1);
    await expect(panel.locator('.recovery-estimate')).toHaveCount(0);
    await expectSaved(request, session, []);
    await panel.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true }).click();
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
