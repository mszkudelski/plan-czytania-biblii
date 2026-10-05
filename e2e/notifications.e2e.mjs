import { test, expect } from '@playwright/test';
import { createECDH, randomBytes } from 'node:crypto';
import { createPlan, openPlan, tab, readGroup } from './helpers.mjs';

function testSubscription() {
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  // Synthetic subscription persisted by the real API, excluded from production cron.
  // Tests never send to this endpoint.
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + crypto.randomUUID(),
    keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
const path = session => '/api/groups/' + session.group.id + '/notifications';
const body = (session, deviceId, action, extra = {}) => ({ ...session.credentials, deviceId, action, ...extra });
const settings = { enabled: true, time: '19:35', timeZone: 'Europe/Warsaw' };

test('notifications persist personal settings and reject invalid inputs without exposing subscriptions', async ({ request }) => {
  const session = await createPlan(request, 'notifications-api');
  const deviceId = crypto.randomUUID();
  const subscription = testSubscription();
  const configuration = await request.get('/api/notifications/config');
  expect(configuration.status()).toBe(200);
  const config = await configuration.json();
  expect(config.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
  expect(config.scheduled).toBe(false);
  expect((await request.post(path(session), { data: { ...body(session, deviceId, 'save'), token: 'invalid', settings, subscription } })).status()).toBe(401);
  for (const invalid of [
    { settings: { ...settings, time: '24:00' }, subscription },
    { settings: { ...settings, timeZone: 'invalid' }, subscription },
    { settings, subscription: { ...subscription, endpoint: 'https://127.0.0.1/internal' } },
    { settings, subscription: { ...subscription, keys: { p256dh: 'bad', auth: 'bad' } } },
  ]) expect((await request.post(path(session), { data: body(session, deviceId, 'save', invalid) })).status()).toBe(400);
  try {
    const saved = await request.post(path(session), { data: body(session, deviceId, 'save', { settings, subscription }) });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual(settings);
    expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toEqual(settings);
    expect(await (await request.post(path(session), { data: body(session, crypto.randomUUID(), 'read') })).json()).toBeNull();
    const joined = await request.post('/api/groups/' + session.group.id + '/join', {
      data: { name: 'Notification Guest E2E', inviteToken: session.credentials.inviteToken },
    });
    expect(joined.status()).toBe(201);
    const guest = await joined.json();
    expect(await (await request.post(path(session), { data: body(guest, deviceId, 'read') })).json()).toBeNull();
    await request.post(path(session), { data: body(guest, deviceId, 'disable') });
    expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toEqual(settings);
    const changed = { ...settings, time: '06:10' };
    expect((await request.post(path(session), { data: body(session, deviceId, 'save', { settings: changed, subscription }) })).status()).toBe(200);
    expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toEqual(changed);
    const group = await readGroup(request, session);
    expect(JSON.stringify(group)).not.toContain(subscription.endpoint);
    expect(group.progress[session.credentials.memberId]).toEqual({});
  } finally {
    expect((await request.post(path(session), { data: body(session, deviceId, 'disable') })).status()).toBe(200);
  }
  expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toBeNull();
  expect((await request.post(path(session), { data: body(session, deviceId, 'test') })).status()).toBe(409);
});

test('notification settings reload the saved hour and disable through the deployed API', async ({ page, request }) => {
  const session = await createPlan(request, 'notifications-browser');
  const deviceId = crypto.randomUUID();
  await page.addInitScript(id => localStorage.setItem('reading-notification-device', id), deviceId);
  expect((await request.post(path(session), { data: body(session, deviceId, 'save', { settings, subscription: testSubscription() }) })).status()).toBe(200);
  try {
    await openPlan(page, session);
    await tab(page, 'Ustawienia').click();
    const panel = page.getByRole('region', { name: 'Powiadomienia o czytaniu' });
    await expect(panel.getByLabel('Godzina przypomnienia')).toHaveValue('19:35');
    await expect(panel).toContainText('Europe/Warsaw');
    await expect(panel).toContainText('włączone na tym urządzeniu');
    await expect(panel).toContainText('Wersja testowa');
    await page.reload();
    await tab(page, 'Ustawienia').click();
    await expect(panel.getByLabel('Godzina przypomnienia')).toHaveValue('19:35');
    await panel.getByRole('button', { name: 'Wyłącz przypomnienia', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('wyłączone');
    expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toBeNull();
    await page.reload();
    await tab(page, 'Ustawienia').click();
    await expect(panel).toContainText('Status: wyłączone');
  } finally { await request.post(path(session), { data: body(session, deviceId, 'disable') }); }
});

test('blocked notification permission is explained without changing settings', async ({ page, request }) => {
  const session = await createPlan(request, 'notifications-denied');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: new URL(process.env.E2E_BASE_URL).origin });
  await openPlan(page, session);
  await tab(page, 'Ustawienia').click();
  const panel = page.getByRole('region', { name: 'Powiadomienia o czytaniu' });
  await expect(panel).toContainText('Powiadomienia są zablokowane');
  await expect(panel.getByRole('button', { name: 'Włącz przypomnienia', exact: true })).toBeDisabled();
  await expect(panel).toContainText('Status: wyłączone');
});

test('logout disables only this device reminder', async ({ page, request }) => {
  const session = await createPlan(request, 'notifications-logout');
  const deviceId = crypto.randomUUID();
  const otherDevice = crypto.randomUUID();
  await page.addInitScript(id => localStorage.setItem('reading-notification-device', id), deviceId);
  for (const id of [deviceId, otherDevice]) {
    expect((await request.post(path(session), { data: body(session, id, 'save', { settings, subscription: testSubscription() }) })).status()).toBe(200);
  }
  try {
    await openPlan(page, session);
    await tab(page, 'Ustawienia').click();
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('plan-czytania-biblii-credentials'))).toBeNull();
    expect(await (await request.post(path(session), { data: body(session, deviceId, 'read') })).json()).toBeNull();
    expect(await (await request.post(path(session), { data: body(session, otherDevice, 'read') })).json()).toEqual(settings);
  } finally {
    for (const id of [deviceId, otherDevice]) await request.post(path(session), { data: body(session, id, 'disable') });
  }
});

test('mobile iOS explains installation and keeps the notification panel within the viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1' });
  });
  const session = await createPlan(request, 'notifications-ios');
  await openPlan(page, session);
  await tab(page, 'Ustawienia').click();
  const panel = page.getByRole('region', { name: 'Powiadomienia o czytaniu' });
  await expect(panel).toContainText('ekranu początkowego');
  await expect(panel.getByRole('button', { name: 'Włącz przypomnienia', exact: true })).toBeDisabled();
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.width).toBeLessThanOrEqual(size.viewport);
});
