import { test, expect } from './fixtures.mjs';
import { createPlan, openPlan, enableRecovery, reading, extraReading, expectSaved, readGroup, holdNextProgress, progressPath } from './helpers.mjs';

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
    await other.reload(); await expect(reading(other, 'Rdz 2-3')).toBeVisible();
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
