import { test, expect } from './fixtures.mjs';
import { inputPlan, NOW, tab, reading, readGroup, expectSaved } from './helpers.mjs';
// Join URLs contain invitation credentials. Do not retain failure screenshots.
test.use({ screenshot: 'off' });
for (const width of [1280, 390]) for (const choice of ['beginning', 'group']) {
  test(`late join ${choice} persists personal schedule at width ${width}`, async ({ page, request, browser }) => {
    const data = inputPlan('late-join-' + choice);
    data.planDays = Array.from({ length: 15 }, (_, index) => ({ id: 'd' + index, index, title: '',
      date: new Date(NOW.getTime() + (index - 7) * 86400000).toISOString().slice(0, 10),
      segments: [{ id: 's' + index, label: `Rdz ${index + 1}`, section: 'Biblia' }],
    }));
    const created = await request.post('/api/groups', { data }); expect(created.status()).toBe(201);
    const owner = await created.json(); test.info().annotations.push({ type: 'test-plan', description: owner.group.id });
    await page.setViewportSize({ width, height: 900 }); await page.clock.install({ time: NOW });
    const invite = Buffer.from(JSON.stringify({ groupId: owner.group.id, inviteToken: owner.credentials.inviteToken })).toString('base64url');
    await page.goto('/#join=' + invite);
    await expect(page.getByRole('radio', { name: 'Od początku', exact: true })).toBeChecked();
    if (choice === 'group') await page.getByRole('radio', { name: 'Od miejsca grupy', exact: true }).check();
    await page.getByLabel('Twoje imię', { exact: true }).fill('E2E Nowa Osoba');
    await page.getByRole('button', { name: 'Dołącz jako nowa osoba', exact: true }).click();
    await expect(page.getByRole('heading', { name: owner.group.name, exact: true })).toBeVisible();
    const credentials = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-czytania-biblii-credentials')));
    const session = { group: owner.group, credentials };
    await expectSaved(request, session, []);
    const stop = page.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true });
    if (choice === 'beginning') { await expect(stop).toBeVisible(); await expect(page.locator('.reading-extra')).toBeVisible(); await expect(reading(page, 'Rdz 1')).toBeVisible(); }
    else { await expect(stop).toBeHidden(); await expect(page.locator('.reading-extra')).toBeHidden(); await expect(reading(page, 'Rdz 8')).toBeVisible(); }
    await page.reload();
    await expect(reading(page, choice === 'beginning' ? 'Rdz 1' : 'Rdz 8')).toBeVisible();
    await test.info().attach(`late-join-${choice}-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    const actual = await readGroup(request, session);
    expect(actual.planDays).toEqual(owner.group.planDays); expect(actual.progress[owner.credentials.memberId]).toEqual({});
    expect(actual.members.find(m => m.id === credentials.memberId).readingStart.skippedSegmentIds).toHaveLength(choice === 'group' ? 7 : 0);
    // A fresh device uses the stored member choice; it receives no local schedule seed.
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    try {
      const device = await context.newPage(); await device.clock.install({ time: NOW });
      await device.addInitScript(value => localStorage.setItem('plan-czytania-biblii-credentials', JSON.stringify(value)), credentials);
      await device.goto('/');
      await expect(reading(device, choice === 'beginning' ? 'Rdz 1' : 'Rdz 8')).toBeVisible();
      await expect(device.getByRole('button', { name: 'Wyłącz nadrabianie', exact: true }))[choice === 'beginning' ? 'toBeVisible' : 'toBeHidden']();
    } finally { await context.close(); }
    if (choice === 'group') {
      await reading(page, 'Rdz 8').click(); await expectSaved(request, session, ['s7']);
      await tab(page, 'Plan').click(); await expect(page.locator('[data-day-id="d0"]')).toContainText('Pominięte');
      expect(await page.locator('[data-day-id="d0"] b').evaluate(status => {
        const row = status.closest('button').getBoundingClientRect(), label = status.getBoundingClientRect();
        return label.right <= row.right && status.scrollWidth <= status.clientWidth;
      })).toBe(true);
      await page.locator('[data-day-id="d0"]').click(); await expect(reading(page, 'Rdz 1')).toBeVisible();
      await expectSaved(request, session, ['s7']);
      await page.getByRole('button', { name: 'Wróć do swojego miejsca', exact: true }).click(); await expect(reading(page, 'Rdz 9')).toBeVisible();
      await tab(page, 'Plan').click(); await page.getByRole('button', { name: 'Włącz pominięte czytania', exact: true }).click();
      await page.getByRole('button', { name: 'Anuluj', exact: true }).click(); await expect(page.locator('[data-day-id="d0"]')).toContainText('Pominięte');
      await page.getByRole('button', { name: 'Włącz pominięte czytania', exact: true }).click();
      await page.getByRole('button', { name: 'Potwierdź powrót do początku', exact: true }).click();
      await expect(page.locator('[data-day-id="d0"]')).not.toContainText('Pominięte');
      await tab(page, 'Czytaj').click(); await expect(reading(page, 'Rdz 1')).toBeVisible();
      await page.reload(); await expect(reading(page, 'Rdz 1')).toBeVisible(); await expectSaved(request, session, ['s7']);
    } else {
      await stop.click(); await page.reload(); await expect(stop).toBeHidden(); await expectSaved(request, session, []);
    }
  });
}
