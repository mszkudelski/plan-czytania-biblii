import { test, expect } from '@playwright/test';
import { inputPlan, NOW, TODAY, openPlan, reading, tab, expectSaved, saveProgress } from './helpers.mjs';
test.use({ screenshot: 'off', channel: 'chromium' });
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
    await finishReading(page, request, session);
    await expect(install(page)).toBeVisible(); await expect(recovery(page)).toBeHidden();
    await screenshot(page, 'onboarding-install-' + (late ? 'late' : 'together'));
    await install(page).getByRole('button', { name: 'Pokaż jak', exact: true }).click();
    // Native instructions are manually opened; no other banner competes with them.
    await expect(page.locator('.install-instructions')).toBeVisible(); await expect(recovery(page)).toBeHidden();
    await page.locator('.install-instructions').getByRole('button', { name: 'Zamknij', exact: true }).click();
    await install(page).getByRole('button', { name: 'Nie teraz', exact: true }).click();
    await expect(install(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
    await page.reload(); await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
    if (late) {
      await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000));
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

test('first launch from the app icon offers a time picker before catch-up and never requests permission automatically', async ({ page, request }) => {
  await mobile(page, true);
  const session = await createPlan(request, 'onboarding-reminder');
  await saveProgress(request, session, 's0'); await saveProgress(request, session, 's1');
  await page.addInitScript(() => localStorage.setItem('reading-onboarding-install-started', 'true'));
  await openPlan(page, session);
  await expect(reminder(page)).toBeVisible(); await expect(recovery(page)).toBeHidden(); await expect(install(page)).toBeHidden();
  await reminder(page).getByLabel('Godzina przypomnienia', { exact: true }).fill('19:35');
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  await screenshot(page, 'onboarding-reminder');
  await reminder(page).getByRole('button', { name: 'Nie teraz', exact: true }).click();
  await expect(reminder(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
  await page.reload(); await expect(reminder(page)).toBeHidden(); await expect(recovery(page)).toBeHidden();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000)); await page.reload();
  await expect(recovery(page)).toBeVisible(); await expect(reminder(page)).toBeHidden();
});

test('a refused consent preserves the selected time and does not pretend reminders were saved', async ({ page, request }) => {
  const { cdp, browserContextId } = await mobile(page, true);
  const session = await createPlan(request, 'onboarding-consent-failure');
  await saveProgress(request, session, 's0'); await saveProgress(request, session, 's1');
  await openPlan(page, session);
  await expect(reminder(page)).toBeVisible();
  await reminder(page).getByLabel('Godzina przypomnienia', { exact: true }).fill('19:35');
  // Apply an actual browser refusal before the click; the permission request still runs only from that gesture.
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied',
    origin: new URL(process.env.E2E_BASE_URL).origin, browserContextId });
  await reminder(page).getByRole('button', { name: 'Włącz przypomnienia', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.permissionRequests)).toBe(1);
  await expect(reminder(page).getByRole('alert')).toBeVisible();
  await expect(reminder(page).getByLabel('Godzina przypomnienia', { exact: true })).toHaveValue('19:35');
  const deviceId = await page.evaluate(() => localStorage.getItem('reading-notification-device'));
  const response = await request.post('/api/groups/' + session.group.id + '/notifications', { data: { ...session.credentials, deviceId, action: 'read' } });
  expect(response.status()).toBe(200); expect(await response.json()).toBeNull();
  await page.clock.setSystemTime(new Date(NOW.getTime() + 31 * 60000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(reminder(page)).toBeHidden();
  await expect(recovery(page)).toBeVisible();
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
});
