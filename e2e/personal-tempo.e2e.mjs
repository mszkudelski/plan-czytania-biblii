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

test('repeated pre-start choices retain the Wednesday boundary and chapter completion dates survive replay', async ({ request }) => {
  const input = inputPlan('tempo-boundary-and-dates');
  const start = new Date(futureMonday() + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() + 2);
  input.startDate = iso(start);
  input.planDays = [{ id: 'd0', index: 0, date: input.startDate, title: 'Pierwszy tydzień',
    segments: [{ id: 's0', section: 'Tekst', label: 'Rdz 1–12' }] }];
  const created = await request.post('/api/groups', { data: input }); expect(created.status()).toBe(201);
  const session = await created.json(); test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  for (const expectedVersion of [0, 1]) {
    const response = await request.post(`/api/groups/${session.group.id}/personal-tempo`, {
      data: { ...session.credentials, days: [1,3,5], expectedVersion, expectedPlanRevision: '', timeZone: 'UTC' },
    });
    expect(response.status()).toBe(200);
    const group = await readGroup(request, session);
    expect(group.members[0].personalTempo.changes).toEqual([{ days: [1,3,5], effectiveFrom: input.startDate }]);
    expect(group.planDays).toEqual(session.group.planDays);
  }
  const save = async (completed, indices) => {
    const response = await request.post(`/api/groups/${session.group.id}/progress`, {
      data: { ...session.credentials, segmentId: 's0', completed, indices },
    });
    expect(response.status()).toBe(200);
    return readGroup(request, session);
  };
  const before = Date.now();
  const partial = await save(true, [0,1,2,3,4,5]);
  const dates = partial.chapterCompletedAt[session.credentials.memberId].s0;
  for (const value of Object.values(dates)) {
    expect(Date.parse(value)).toBeGreaterThanOrEqual(before - 60000);
    expect(Date.parse(value)).toBeLessThanOrEqual(Date.now() + 60000);
  }
  expect(partial.progress[session.credentials.memberId].s0).toBeUndefined();
  const repeated = await save(true, [0,1]);
  expect(repeated.chapterCompletedAt[session.credentials.memberId].s0).toEqual(dates);
  const undone = await save(false, [3]);
  expect(undone.chapterCompletedAt[session.credentials.memberId].s0['3']).toBeUndefined();
  expect(undone.chapterCompletedAt[session.credentials.memberId].s0['0']).toBe(dates['0']);
});

test('catch-up navigation follows personal Saturdays instead of the daily group cadence', async ({ page, request }) => {
  const input = inputPlan('tempo-saturday-catchup'); const start = futureMonday();
  const shift = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  input.startDate = start;
  input.planDays = Array.from({ length: 4 }, (_, i) => ({ id: 'd' + i, index: i, date: shift(start, i * 7), title: 'Tydzień ' + i,
    segments: [{ id: 's' + i, section: 'Tekst', label: `Rdz ${i * 12 + 1}–${i * 12 + 12}` }] }));
  const response = await request.post('/api/groups', { data: input }); expect(response.status()).toBe(201);
  const session = await response.json(); test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  const saved = await request.post(`/api/groups/${session.group.id}/personal-tempo`, {
    data: { ...session.credentials, days: [6], expectedVersion: 0, expectedPlanRevision: '', timeZone: 'UTC' },
  }); expect(saved.status()).toBe(200);
  const today = shift(start, 33); // Saturday after all four scheduled portions.
  await page.clock.install({ time: new Date(today + 'T12:00:00Z') });
  await page.addInitScript(({ credentials, today }) => {
    localStorage.setItem('plan-czytania-biblii-credentials', JSON.stringify(credentials));
    // Resume catch-up using its real device preference; group and marks come from the deployed API.
    localStorage.setItem(`reading-recovery:${credentials.groupId}:${credentials.memberId}`, today);
  }, { credentials: session.credentials, today });
  await page.goto('/');
  await expect(page.getByTestId('recovery-remaining-readings')).toHaveText('4');
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', today);
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', shift(today, 7));
  await page.getByRole('button', { name: 'Następne', exact: true }).click();
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', shift(today, 14));
  expect((await readGroup(request, session)).progress).toEqual(session.group.progress);
});
