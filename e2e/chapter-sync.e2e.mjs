import { test, expect } from './fixtures.mjs';
import { createPlan, inputPlan, openPlan, enableRecovery, reading, extraReading, expectSaved, readGroup, holdNextProgress, progressPath, tab } from './helpers.mjs';

for (const width of [1280, 390]) {
  test(`new mixed chapter and verse readings save individual checks across reload (${width}px)`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const plan = inputPlan('mixed-chapters');
    plan.planDays[0].segments = [{ id: 's0', label: '1 Kor 1–3; J 3,16–18; 4:1-5', section: 'Biblia' }];
    const response = await request.post('/api/groups', { data: plan });
    expect(response.status()).toBe(201);
    const session = await response.json();
    test.info().annotations.push({ type: 'test-plan', description: session.group.id });
    await openPlan(page, session);
    await expect(reading(page, plan.planDays[0].segments[0].label)).toBeVisible();
    await enableRecovery(page);
    await expect(page.getByLabel('Widok czytania', { exact: true })).toHaveCount(0);
    await expect(reading(page, '1 Kor 1')).toBeVisible();
    await expect(reading(page, '1 Kor 2')).toBeVisible();
    await expect(reading(page, 'J 3,16–18')).toBeVisible();
    await expectSaved(request, session, []);
    await page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true }).click();
    await expect(page.getByLabel('Widok czytania', { exact: true })).toHaveValue('fragments');
    await expect(reading(page, plan.planDays[0].segments[0].label)).toBeVisible();
    await page.getByLabel('Widok czytania', { exact: true }).selectOption('chapters');
    const labels = ['1 Kor 1', '1 Kor 2', '1 Kor 3', 'J 3,16–18', 'J 4:1-5'];
    for (const label of labels) await expect(reading(page, label)).toHaveAttribute('aria-pressed', 'false');
    const chapters = async () => (await readGroup(request, session)).chapterProgress?.[session.credentials.memberId]?.s0;
    await reading(page, '1 Kor 2').click();
    await expect.poll(chapters).toEqual([1]);
    await expectSaved(request, session, []);
    await page.reload();
    await expect(page.getByLabel('Widok czytania', { exact: true })).toHaveValue('chapters');
    // Opening the original day in Plan includes both checked and unread parts.
    await tab(page, 'Plan').click();
    await page.locator('.plan-day-row[data-day-id="d0"]').click();
    await expect(reading(page, '1 Kor 2')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Widok czytania', { exact: true }).selectOption('fragments');
    await expect(reading(page, plan.planDays[0].segments[0].label)).toContainText('Przeczytano 1 z 5 części');
    await expect.poll(chapters).toEqual([1]);
    await page.getByLabel('Widok czytania', { exact: true }).selectOption('chapters');
    for (const label of labels.filter(label => label !== '1 Kor 2')) {
      await expect(reading(page, label)).toHaveAttribute('aria-pressed', 'false');
      await reading(page, label).click();
    }
    await expect.poll(chapters).toEqual([0, 1, 2, 3, 4]);
    await expectSaved(request, session, ['s0']);
    await reading(page, 'J 3,16–18').click();
    await expect.poll(chapters).toEqual([0, 1, 2, 4]);
    await expectSaved(request, session, []);
  });
}

test('partial chapters synchronize between two devices of one profile, including unchecks and a failed save', async ({ page, request, browser }) => {
  const session = await createPlan(request, 'two-device-chapters', true);
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 390, height: 844 }, timezoneId: 'UTC', serviceWorkers: 'block' });
  try {
    const other = await context.newPage();
    await openPlan(page, session); await enableRecovery(page);
    await reading(page, 'Rdz 1').click(); await reading(page, 'Mt 1').click();
    await expectSaved(request, session, ['s0', 's1']);
    const held = await holdNextProgress(page, session);
    try {
      await extraReading(page).click(); await held.started;
      await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
    } finally { held.release(); }
    const chapters = async () => (await readGroup(request, session)).chapterProgress?.[session.credentials.memberId]?.s2;
    await expect.poll(chapters).toEqual([0]);
    await expectSaved(request, session, ['s0', 's1']);
    await openPlan(other, session);
    await expect(reading(other, 'Rdz 3')).toBeVisible();
    await extraReading(page).click(); await expect.poll(chapters).toEqual([]);
    await other.reload();
    await expect(reading(other, 'Rdz 2-3')).toHaveAttribute('aria-pressed', 'false');
    // Real API rejection of this plan's operation, never a mocked response.
    await page.route('**' + progressPath(session), async route => {
      await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
    }, { times: 1 });
    await extraReading(page).click();
    await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(chapters).toEqual([]);
    await extraReading(page).click(); await expect.poll(chapters).toEqual([0]);
    await other.reload(); await expect(reading(other, 'Rdz 3')).toBeVisible();
    await expectSaved(request, session, ['s0', 's1']);
    const changes = await Promise.all([
      page.request.post(progressPath(session), { data: { ...session.credentials, segmentId: 's2', completed: false, indices: [0] } }),
      other.request.post(progressPath(session), { data: { ...session.credentials, segmentId: 's2', completed: true, indices: [1] } }),
    ]);
    for (const response of changes) expect(response.status()).toBe(200);
    await expect.poll(chapters).toEqual([1]);
    await other.reload(); await expect(reading(other, 'Rdz 2')).toBeVisible();
    await page.reload(); await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expectSaved(request, session, ['s0', 's1']);
    for (const [device, name] of [[page, 'desktop-partial-chapters'], [other, 'mobile-partial-chapters']]) {
      await test.info().attach(name, { body: await device.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  } finally { await context.close(); }
});
