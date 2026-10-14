import { test, expect } from '@playwright/test';
import { createPlan, openPlan, tab } from './helpers.mjs';
test.use({ screenshot: 'off' });
for (const width of [1280, 390]) {
  test('administrator can hide recovery help on this device without hiding another profile at width ' + width, async ({ page, request, browser }) => {
    await page.setViewportSize({ width, height: 844 });
    const owner = await createPlan(request, 'dismiss-group-help-' + width);
    const joined = await request.post('/api/groups/' + owner.group.id + '/join', {
      data: { name: 'Anna E2E', inviteToken: owner.credentials.inviteToken },
    });
    expect(joined.status()).toBe(201); const guest = await joined.json();
    await openPlan(page, owner); await tab(page, 'Grupa').click();
    const help = page.locator('.group-access-help');
    await expect(help).toContainText('Grupa pomaga odzyskać dostęp');
    const close = help.getByRole('button', { name: 'Ukryj informację o odzyskiwaniu dostępu', exact: true });
    const box = await close.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    if (width === 390) await test.info().attach('group-help-admin-close', { body: await page.screenshot(), contentType: 'image/png' });
    await close.click(); await expect(help).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zarządzaj profilem Anna E2E' })).toBeVisible();
    if (width === 390) await test.info().attach('group-help-admin-hidden', { body: await page.screenshot(), contentType: 'image/png' });
    await page.reload(); await tab(page, 'Grupa').click(); await expect(help).toHaveCount(0);
    await tab(page, 'Ustawienia').click();
    await expect(page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true })).toBeVisible();
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width, height: 844 }, serviceWorkers: 'block' });
    try {
      const other = await context.newPage(); await openPlan(other, guest); await tab(other, 'Grupa').click();
      await expect(other.locator('.group-access-help')).toHaveCount(0);
      await expect(other.locator('.member-row')).toHaveCount(2);
      await other.reload(); await tab(other, 'Grupa').click();
      await expect(other.locator('.group-access-help')).toHaveCount(0);
      if (width === 390) await test.info().attach('group-help-participant', { body: await other.screenshot(), contentType: 'image/png' });
      const granted = await request.post('/api/groups/' + owner.group.id + '/members/' + guest.credentials.memberId + '/role', {
        data: { ...owner.credentials, isAdmin: true },
      });
      expect(granted.status()).toBe(200);
      await other.reload(); await tab(other, 'Grupa').click();
      await expect(other.getByRole('button', { name: 'Ukryj informację o odzyskiwaniu dostępu', exact: true })).toBeVisible();
    } finally { await context.close(); }
  });
}
