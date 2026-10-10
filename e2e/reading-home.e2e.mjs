import { test, expect } from '@playwright/test';
import { createPlan, inputPlan, NOW, openPlan, saveProgress, readGroup, expectSaved, reading, extraReading } from './helpers.mjs';

const date = offset => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
async function timeline(request, suffix, offsets, startOffset = offsets[0]) {
  const plan = inputPlan(suffix);
  plan.startDate = date(startOffset);
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
  test('reading is first, completion survives reload and continuing is optional at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-portion-' + width);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Twoje czytanie na dziś', exact: true })).toBeVisible();
    await expect(page.locator('.reading-context')).toContainText('Kontynuujesz dzień 1 planu, zaplanowany');
    await expect(page.getByLabel('Postęp bieżącej porcji', { exact: true })).toHaveText('0 z 2 fragmentów');
    expect(await page.evaluate(() => document.querySelector('.reading-focus').getBoundingClientRect().top < document.querySelector('.reading-overview').getBoundingClientRect().top)).toBe(true);
    await fitsViewport(page);
    await reading(page, 'Rdz 1').click();
    await expect(page.getByLabel('Postęp bieżącej porcji', { exact: true })).toHaveText('1 z 2 fragmentów');
    await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
    await expect(page.locator('.portion-complete')).toContainText('Dzisiejsza porcja gotowa');
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Przejdź do kolejnego czytania', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.portion-complete')).toContainText('Dzisiejsza porcja gotowa');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Postęp bieżącej porcji', { exact: true })).toHaveText('2 z 2 fragmentów');
    await page.getByRole('button', { name: 'Przejdź do kolejnego czytania', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'false');
    await expectSaved(request, session, ['s0', 's1']);
    await fitsViewport(page);
  });

  test('past debt, calendar today and reading ahead stay separate at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-summary-' + width, [-1, 0, 1]);
    for (const id of ['t0a', 't1a', 't2a', 't2b']) await saveProgress(request, session, id);
    await openPlan(page, session);
    await expect(page.getByTestId('overdue-days')).toHaveText('1 dzień');
    await expect(page.getByTestId('calendar-today')).toHaveText('1 z 2');
    await expect(page.getByTestId('reading-ahead')).toContainText('2 fragmenty');
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '66.5');
    await expect(page.locator('.reading-context')).toContainText('Kontynuujesz dzień 1 planu');
    await expectSaved(request, session, ['t0a', 't1a', 't2a', 't2b']);
    await fitsViewport(page);
  });

  test('a future plan starts with a clear state and an optional preview at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-before-start-' + width, [2, 3]);
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Plan jeszcze się nie rozpoczął', exact: true })).toBeVisible();
    await expect(page.locator('.simple-readings')).toHaveCount(0);
    await page.getByRole('button', { name: 'Zobacz pierwsze czytanie', exact: true }).click();
    await expect(reading(page, 'Rdz 1')).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Podgląd kolejnego czytania', exact: true })).toBeVisible();
    await expectSaved(request, session, []);
    await page.getByRole('button', { name: 'Zaznacz czytanie z wyprzedzeniem', exact: true }).click();
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, session, ['t0a']);
    await fitsViewport(page);
  });

  test('a rest day offers upcoming reading without assigning it to today at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await timeline(request, 'home-rest-' + width, [-2, 2]);
    await saveProgress(request, session, 't0a');
    await saveProgress(request, session, 't0b');
    await openPlan(page, session);
    await expect(page.getByRole('heading', { name: 'Dzisiaj dzień wolny', exact: true })).toBeVisible();
    await expect(page.getByTestId('calendar-today')).toHaveText('Dzień wolny');
    await expect(page.locator('.simple-readings')).toHaveCount(0);
    await page.getByRole('button', { name: 'Zobacz najbliższe czytanie', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toBeDisabled();
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
    await expect(page.getByRole('progressbar', { name: 'Postęp całego planu', exact: true })).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Poprzedni dzień', exact: true }).click();
    await expect(reading(page, 'Rdz 2')).toHaveAttribute('aria-pressed', 'true');
    await expectSaved(request, session, ids);
    await fitsViewport(page);
  });

  test('catch-up has a preview and estimate, while future reading requires a separate action at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const session = await createPlan(request, 'home-catchup-preview-' + width);
    await openPlan(page, session);
    const panel = page.getByRole('region', { name: 'Plan nadrabiania', exact: true });
    await expect(panel).toContainText('Zachowasz zwykłą porcję i dodasz jeden rozdział dziennie. Plan grupy pozostanie taki sam.');
    await panel.getByText('Podgląd najbliższych dni', { exact: true }).click();
    await expect(panel.locator('.recovery-preview li')).toHaveCount(3);
    await expect(panel.locator('.recovery-estimate')).toContainText('2 dni czytania');
    await expectSaved(request, session, []);
    await panel.getByRole('button', { name: 'Włącz plan nadrabiania', exact: true }).click();
    await expect(extraReading(page)).toContainText('Rdz 2');
    await page.getByRole('button', { name: 'Następny dzień', exact: true }).click();
    await expect(reading(page, 'Rdz 4')).toBeDisabled();
    await expect(extraReading(page)).toBeDisabled();
    await expectSaved(request, session, []);
    await page.getByRole('button', { name: 'Zaznacz czytanie z wyprzedzeniem', exact: true }).click();
    await reading(page, 'Rdz 4').click();
    await expectSaved(request, session, ['s3']);
    expect((await readGroup(request, session)).planDays).toEqual(session.group.planDays);
    await page.getByRole('button', { name: 'Wróć do podglądu', exact: true }).click();
    await expect(reading(page, 'Rdz 4')).toBeDisabled();
    await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'true');
    await fitsViewport(page);
  });
}
