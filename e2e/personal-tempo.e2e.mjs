import { test, expect } from './fixtures.mjs';
import { inputPlan, readGroup, tab } from './helpers.mjs';
// Never capture credentials or synthetic cleanup capabilities.
test.use({ screenshot: 'off' });
const credentialsKey = 'plan-czytania-biblii-credentials';
const iso = d => d.toISOString().slice(0, 10);
function futureMonday() { const d = new Date(); d.setUTCHours(12,0,0,0); d.setUTCDate(d.getUTCDate() + (8 - d.getUTCDay()) % 7 + 7); return iso(d); }
for (const width of [1280, 390, 320]) {
  test('personal days sync between devices while preserving the group plan at width ' + width, async ({ page, request, browser }) => {
    const input = inputPlan('personal-tempo-' + width); const start = futureMonday();
    input.startDate = start;
    input.planDays = Array.from({ length: 3 }, (_, i) => { const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i * 7); return { id: 'd' + i, index: i, date: iso(d), title: 'Tydzień ' + i,
      segments: [{ id: 's' + i, section: 'Tekst', label: `Rdz ${i * 12 + 1}–${i * 12 + 12}` }] }; });
    const response = await request.post('/api/groups', { data: input }); expect(response.status()).toBe(201);
    const session = await response.json(); test.info().annotations.push({ type: 'test-plan', description: session.group.id });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(({ key, credentials }) => localStorage.setItem(key, JSON.stringify(credentials)), { key: credentialsKey, credentials: session.credentials });
    await page.reload(); await tab(page, 'Ustawienia').click();
    await page.getByRole('button', { name: /Moje dni czytania/ }).click();
    const tempoCard = page.getByRole('region', { name: 'Moje dni czytania' });
    const layout = await tempoCard.evaluate(card => {
      const box = card.getBoundingClientRect();
      const presets = [...card.querySelectorAll('.simple-segmented button')].map(b => b.getBoundingClientRect());
      const days = card.querySelector('.simple-days').getBoundingClientRect();
      return { padding: parseFloat(getComputedStyle(card).paddingLeft),
        presetTops: presets.map(b => b.top),
        contained: presets.every(b => b.left >= box.left && b.right <= box.right && b.bottom <= days.top),
        noOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(layout.padding).toBeGreaterThanOrEqual(16);
    expect(new Set(layout.presetTops).size).toBe(1);
    expect(layout.contained).toBe(true);
    expect(layout.noOverflow).toBe(true);
    await expect(page.getByText('Podgląd czytań', { exact: true }).locator('..')).not.toHaveAttribute('open', '');
    await page.getByRole('button', { name: '3 dni', exact: true }).click();
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Zapisano dni czytania.' })).toBeVisible();
    const current = await readGroup(request, session); const member = current.members.find(m => m.id === session.credentials.memberId);
    expect(member.personalTempo.changes.at(-1).days).toEqual([1,3,5]);
    expect(current.planDays).toEqual(session.group.planDays); expect(current.progress).toEqual(session.group.progress);
    const other = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width, height: 900 }, timezoneId: 'UTC', serviceWorkers: 'block' });
    try {
      const second = await other.newPage(); await second.goto('/');
      await second.evaluate(({ key, credentials }) => localStorage.setItem(key, JSON.stringify(credentials)), { key: credentialsKey, credentials: session.credentials });
      await second.reload(); await tab(second, 'Ustawienia').click();
      await expect(second.getByRole('button', { name: /Moje dni czytania/ })).toContainText('Pn · Śr · Pt');
      await second.getByRole('button', { name: /Moje dni czytania/ }).click();
      await second.getByRole('button', { name: '1 dzień', exact: true }).click();
      await second.getByRole('button', { name: 'Zapisz', exact: true }).click();
      await expect(second.getByRole('status').filter({ hasText: 'Zapisano dni czytania.' })).toBeVisible();
      await page.reload(); await tab(page, 'Ustawienia').click();
      await expect(page.getByRole('button', { name: /Moje dni czytania/ })).toContainText('So');
      const stale = await request.post(`/api/groups/${session.group.id}/personal-tempo`, { data: { ...session.credentials, days: [1,2], expectedVersion: 1, expectedPlanRevision: '', timeZone: 'UTC' } });
      expect(stale.status()).toBe(409);
      await page.getByRole('button', { name: 'Anuluj oczekującą zmianę', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Anulowano oczekującą zmianę.' })).toBeVisible();
      await tab(page, 'Plan').click(); await expect(page.locator('.plan-day-row')).toHaveCount(3);
      await tab(page, 'Grupa').click(); await expect(page.locator('.member-row')).toContainText('Tester E2E');
    } finally { await other.close(); }
  });
}
