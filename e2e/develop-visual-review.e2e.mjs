import { test, expect } from '@playwright/test';
import { inputPlan, openPlan, reading, tab, expectSaved, browseReading } from './helpers.mjs';

// Review images contain only isolated E2E profiles. Access codes and QR are
// never generated or captured in this visual inventory.
test.use({ screenshot: 'off', channel: 'chromium', viewport: { width: 390, height: 844 } });
async function capture(page, name) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await test.info().attach('develop-review-' + name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
async function plan(request) {
  const data = inputPlan('visual-review'); data.name = 'E2E · Plan wspólnoty';
  const response = await request.post('/api/groups', { data }); expect(response.status()).toBe(201);
  const session = await response.json();
  test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  return session;
}

test('visual inventory of reading, recovery, group administration and settings on develop', async ({ page, request }) => {
  const session = await plan(request);
  const joined = await request.post('/api/groups/' + session.group.id + '/join', {
    data: { name: 'Anna E2E', inviteToken: session.credentials.inviteToken },
  });
  expect(joined.status()).toBe(201);
  expect((await request.post('/api/groups/' + session.group.id + '/recovery-prompt', {
    data: { ...session.credentials, action: 'never' },
  })).status()).toBe(200);
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'prompt',
    origin: new URL(process.env.E2E_BASE_URL).origin, browserContextId: targetInfo.browserContextId });
  await openPlan(page, session);
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await capture(page, 'czytanie');
  await reading(page, 'Rdz 1').click(); await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(page.locator('.reading-finished')).toContainText('Przeczytane');
  await capture(page, 'przeczytane');
  await browseReading(page, 3);
  await expect(page.getByRole('button', { name: 'Wróć do swojego miejsca', exact: true })).toBeVisible();
  await capture(page, 'powrot-do-miejsca');
  await page.getByRole('button', { name: 'Wróć do swojego miejsca', exact: true }).click();
  await page.getByRole('button', { name: 'Nadrabianie', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Włącz', exact: true }).click();
  await expect(page.locator('.reading-extra')).toBeVisible();
  await capture(page, 'czytanie-z-nadrabianiem');
  await tab(page, 'Plan').click(); await expect(page.getByRole('region', { name: 'Postęp tygodnia' })).toBeVisible();
  await capture(page, 'plan');
  await tab(page, 'Grupa').click(); await expect(page.locator('.member-row')).toHaveCount(2);
  await capture(page, 'grupa');
  await page.getByRole('button', { name: 'Zarządzaj profilem Anna E2E', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Anna E2E', exact: true });
  await expect(dialog).toBeVisible(); await capture(page, 'zarzadzanie-profilem');
  await dialog.getByRole('button', { name: 'Nadaj rolę administratora', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Potwierdź nadanie roli' })).toBeVisible();
  await capture(page, 'potwierdzenie-roli');
  await dialog.getByRole('button', { name: 'Zamknij zarządzanie profilem' }).click();
  await tab(page, 'Ustawienia').click();
  await expect(page.getByRole('heading', { name: 'O której przypomnieć Ci o czytaniu?' })).toBeVisible();
  await capture(page, 'ustawienia');
  await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
  await expect(page.locator('.logout-confirm')).toBeVisible();
  await page.locator('.logout-confirm').scrollIntoViewIfNeeded();
  await test.info().attach('develop-review-wylogowanie', { body: await page.locator('.logout-confirm').screenshot(), contentType: 'image/png' });
});

test('visual inventory of joining and recovering an existing profile without access secrets', async ({ page, request }) => {
  const session = await plan(request);
  await page.goto('/');
  await capture(page, 'start');
  await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Odzyskaj mój dostęp' })).toBeVisible();
  await capture(page, 'odzyskiwanie');
  await page.getByRole('button', { name: 'Mam link lub kod od administratora' }).click();
  await expect(page.getByRole('heading', { name: 'Przywróć dostęp do profilu' })).toBeVisible();
  await capture(page, 'kod-od-administratora');
  await page.getByRole('button', { name: 'Wróć do wyboru' }).click();
  await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
  await page.getByRole('button', { name: 'Mam dostęp na innym urządzeniu' }).click();
  await expect(page.getByRole('heading', { name: 'Połącz inne urządzenie' })).toBeVisible();
  await capture(page, 'laczenie-urzadzen');
  const invite = Buffer.from(JSON.stringify({ groupId: session.group.id, inviteToken: session.credentials.inviteToken })).toString('base64url');
  await page.goto('/#join=' + invite);
  await expect(page.getByRole('region', { name: 'Plan z zaproszenia' })).toBeVisible();
  await capture(page, 'dolaczanie');
  await page.getByLabel('Twoje imię', { exact: true }).fill(session.group.members[0].name);
  await expect(page.locator('.name-match-notice')).toBeVisible();
  await capture(page, 'istniejace-imie');
});
