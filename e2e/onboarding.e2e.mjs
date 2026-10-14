import { test, expect } from '@playwright/test';
import { createECDH, randomBytes } from 'node:crypto';
import { inputPlan, NOW, TODAY, openPlan, reading, tab, expectSaved, saveProgress, expectFloatingPopup } from './helpers.mjs';
test.use({ screenshot: 'off', channel: 'chromium', timezoneId: 'Europe/Warsaw' });
const recovery = page => page.getByRole('complementary', { name: 'Propozycja nadrabiania', exact: true });
const reminder = page => page.getByRole('complementary', { name: 'Propozycja przypomnienia', exact: true });
const install = page => page.locator('.install-app-card');

async function createPlan(request, suffix) {
  const plan = inputPlan(suffix); plan.name = 'E2E · Nowy Testament';
  const response = await request.post('/api/groups', { data: plan }); expect(response.status()).toBe(201);
  const session = await response.json(); test.info().annotations.push({ type: 'test-plan', description: session.group.id });
  return session;
}

async function mobile(page, standalone = false) {
  await page.setViewportSize({ width: 390, height: 640 });
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'prompt',
    origin: new URL(process.env.E2E_BASE_URL).origin, browserContextId: targetInfo.browserContextId });
  await page.addInitScript(installed => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1' });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
    window.permissionRequests = 0;
    const original = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (...args) => { window.permissionRequests++; return original(...args); };
  }, standalone);
  return { cdp, browserContextId: targetInfo.browserContextId };
}
async function join(page, session) {
  await page.clock.install({ time: NOW });
  const payload = Buffer.from(JSON.stringify({ groupId: session.group.id, inviteToken: session.credentials.inviteToken })).toString('base64url');
  await page.goto('/#join=' + payload);
  await page.getByLabel('Twoje imię', { exact: true }).fill('E2E Nowy Uczestnik');
  await page.getByRole('button', { name: 'Dołącz jako nowa osoba', exact: true }).click();
  await expect(page.getByRole('heading', { name: session.group.name, exact: true })).toBeVisible();
  const credentials = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-czytania-biblii-credentials')));
  return { group: session.group, credentials };
}
async function finishReading(page, request, session) {
  await reading(page, 'Rdz 1').click(); await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
}
async function screenshot(page, name) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const popup = page.locator('.install-app-card, .recovery-notice').filter({ visible: true });
  if (await popup.count()) await expectFloatingPopup(page, popup);
  await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

for (const late of [false, true]) {
  test('new participant ' + (late ? 'joining late' : 'starting with the group') + ' reads first and gets only installation on the first visit', async ({ page, request }) => {
    await mobile(page);
    let owner;
    if (late) owner = await createPlan(request, 'onboarding-late');
    else {
      const plan = inputPlan('onboarding-together'); plan.name = 'E2E · Nowy Testament'; plan.startDate = TODAY;
      plan.planDays = plan.planDays.map((day, i) => ({ ...day, date: new Date(NOW.getTime() + i * 86400000).toISOString().slice(0, 10) }));
      const response = await request.post('/api/groups', { data: plan }); expect(response.status()).toBe(201); owner = await response.json();
    }
    const session = await join(page, owner);
    await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden(); await expect(reminder(page)).toBeHidden();
    await screenshot(page, 'onboarding-first-reading-' + (late ? 'late' : 'together'));
    if (late) {
      await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000));
      await page.reload();
      await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
    }
    await finishReading(page, request, session);
    await expect(install(page)).toBeVisible(); await expect(recovery(page)).toBeHidden();
    await screenshot(page, 'onboarding-install-' + (late ? 'late' : 'together'));
    await page.setViewportSize({ width: 320, height: 568 });
    await expectFloatingPopup(page, install(page));
    await page.setViewportSize({ width: 390, height: 640 });
    await install(page).getByRole('button', { name: 'Pokaż jak', exact: true }).click();
    // Native instructions are manually opened; no other banner competes with them.
    await expect(page.locator('.install-instructions')).toBeVisible(); await expect(recovery(page)).toBeHidden();
    if (late) await screenshot(page, 'onboarding-install-instructions');
    if (late) {
      await page.locator('.install-instructions').getByRole('button', { name: 'Zamknij', exact: true }).click();
      await install(page).getByRole('button', { name: 'Nie teraz', exact: true }).click();
    } else {
      await page.locator('.install-instructions').getByRole('button', { name: 'Gotowe', exact: true }).click();
    }
    await expect(install(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
    await page.reload(); await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
    if (late) {
      await page.clock.setSystemTime(new Date(NOW.getTime() + 62 * 60000));
      await page.reload(); await expect(recovery(page)).toBeVisible(); await expect(install(page)).toBeHidden();
      await screenshot(page, 'onboarding-catchup-next-visit');
    }
    expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  });
}

test('manual installation is available before reading and opens from settings after dismissal', async ({ page, request }) => {
  await mobile(page);
  const owner = await createPlan(request, 'onboarding-manual-install');
  const session = await join(page, owner);
  await tab(page, 'Ustawienia').click();
  await screenshot(page, 'onboarding-install-settings');
  await page.getByRole('button', { name: 'Dodaj aplikację do ekranu głównego', exact: true }).click();
  await expect(page.locator('.install-instructions')).toBeVisible();
  await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
  await page.locator('.install-instructions').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await tab(page, 'Czytaj').click();
  await finishReading(page, request, session);
  await expect(install(page)).toBeVisible();
  await install(page).getByRole('button', { name: 'Nie teraz', exact: true }).click();
  await tab(page, 'Ustawienia').click();
  await page.getByRole('button', { name: 'Dodaj aplikację do ekranu głównego', exact: true }).click();
  await expect(page.locator('.install-instructions')).toBeVisible();

});

test('a desktop participant who returns before reading still finishes a reading before any catch-up proposal', async ({ page, request }) => {
  const owner = await createPlan(request, 'onboarding-unfinished-return');
  const session = await join(page, owner);
  await expect(recovery(page)).toBeHidden();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000)); await page.reload();
  await expect(recovery(page)).toBeHidden();
  await finishReading(page, request, session);
  await expect.poll(() => page.evaluate(credentials => Boolean(JSON.parse(localStorage.getItem(
    'reading-onboarding:' + credentials.groupId + ':' + credentials.memberId) ?? 'null')?.completedVisit), session.credentials)).toBe(true);
  await expect(recovery(page)).toBeHidden();
  await page.reload(); await expect(recovery(page)).toBeHidden();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 62 * 60000)); await page.reload();
  await expect(recovery(page)).toBeVisible();
});

test('first launch from the app icon offers reminders without a time picker and never requests permission automatically', async ({ page, request }) => {
  await mobile(page, true);
  const session = await createPlan(request, 'onboarding-reminder');
  await saveProgress(request, session, 's0'); await saveProgress(request, session, 's1');
  await page.addInitScript(() => localStorage.setItem('reading-onboarding-install-started', 'true'));
  await openPlan(page, session);
  await expect(reminder(page)).toBeVisible(); await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
  await expect(reminder(page).locator('input[type="time"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  await screenshot(page, 'onboarding-reminder');
  await page.setViewportSize({ width: 320, height: 568 });
  await expectFloatingPopup(page, reminder(page));
  await page.setViewportSize({ width: 390, height: 640 });
  await reminder(page).getByRole('button', { name: 'Nie teraz', exact: true }).click();
  await expect(reminder(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
  await page.reload(); await expect(reminder(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000)); await page.reload();
  await expect(recovery(page)).toBeVisible(); await expect(reminder(page)).toBeHidden();
});

test('a refused consent keeps the proposal without a time picker and does not pretend reminders were saved', async ({ page, request }) => {
  const { cdp, browserContextId } = await mobile(page, true);
  const session = await createPlan(request, 'onboarding-consent-failure');
  await saveProgress(request, session, 's0'); await saveProgress(request, session, 's1');
  await openPlan(page, session);
  await expect(reminder(page)).toBeVisible();
  await expect(reminder(page).locator('input[type="time"]')).toHaveCount(0);
  // Apply an actual browser refusal before the click; the permission request still runs only from that gesture.
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied',
    origin: new URL(process.env.E2E_BASE_URL).origin, browserContextId });
  await reminder(page).getByRole('button', { name: 'Włącz przypomnienia', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.permissionRequests)).toBe(1);
  await expect(reminder(page).getByRole('alert')).toHaveText('Powiadomienia są zablokowane. Włącz je dla tej aplikacji w ustawieniach urządzenia.');
  await expect(page.getByRole('complementary', { name: 'Potwierdzenie przypomnienia' })).toBeHidden();
  const deviceId = await page.evaluate(() => localStorage.getItem('reading-notification-device'));
  const response = await request.post('/api/groups/' + session.group.id + '/notifications', { data: { ...session.credentials, deviceId, action: 'read' } });
  expect(response.status()).toBe(200); expect(await response.json()).toBeNull();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(reminder(page)).toBeHidden();
  await expect(recovery(page)).toBeVisible();
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
});

test.describe('onboarding reminder subscription', () => {
test.use({ serviceWorkers: 'allow' });
test('enabling from onboarding saves 8:00 and explains that the hour can be changed in settings', async ({ page, request }) => {
  const { cdp, browserContextId } = await mobile(page, true);
  const session = await createPlan(request, 'onboarding-default-hour');
  await saveProgress(request, session, 's0'); await saveProgress(request, session, 's1');
  const curve = createECDH('prime256v1'); curve.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + crypto.randomUUID(),
    keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  // Only the external push transport is synthetic. Permission, service worker,
  // app requests and persistence all use the real browser and deployed backend.
  await page.addInitScript(value => {
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async () => ({ toJSON: () => value });
  }, subscription);
  await openPlan(page, session);
  await expect(reminder(page)).toBeVisible();
  await expect(reminder(page).locator('input')).toHaveCount(0);
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'granted',
    origin: new URL(process.env.E2E_BASE_URL).origin, browserContextId });
  const deviceId = await page.evaluate(() => localStorage.getItem('reading-notification-device'));
  const path = '/api/groups/' + session.group.id + '/notifications';
  try {
    await reminder(page).getByRole('button', { name: 'Włącz przypomnienia', exact: true }).click();
    const confirmation = page.getByRole('complementary', { name: 'Potwierdzenie przypomnienia' });
    await expect(confirmation.getByRole('status')).toContainText('Godzina przypomnienia: 8:00. Możesz ją zmienić w Ustawieniach.');
    await expect(confirmation).toContainText('Wersja testowa nie wysyła codziennych przypomnień.');
    await expect(reminder(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
    expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
    const response = await request.post(path, { data: { ...session.credentials, deviceId, action: 'read' } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, time: '08:00', timeZone: 'Europe/Warsaw' });
    await screenshot(page, 'onboarding-reminder-saved');
    await page.clock.runFor(5100);
    await expect(confirmation).toBeHidden();
    await page.reload(); await expect(reminder(page)).toBeHidden();
    await tab(page, 'Ustawienia').click();
    const panel = page.getByRole('region', { name: 'Powiadomienia o czytaniu' });
    await panel.getByText('Zmień godzinę', { exact: true }).click();
    await expect(panel.getByLabel('Godzina przypomnienia')).toBeVisible();
    await expect(panel.getByLabel('Godzina przypomnienia')).toHaveValue('08:00');
    await test.info().attach('onboarding-reminder-settings', { body: await panel.screenshot(), contentType: 'image/png' });
  } finally {
    expect((await request.post(path, { data: { ...session.credentials, deviceId, action: 'disable' } })).status()).toBe(200);
  }
});
});
