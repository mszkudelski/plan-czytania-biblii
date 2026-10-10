import { test, expect } from '@playwright/test';
import { createPlan, saveProgress, readGroup, expectSaved, reading, tab } from './helpers.mjs';

// Links and codes grant access; keep them out of screenshots and logs.
test.use({ screenshot: 'off' });
const accessPath = (owner, memberId) => `/api/groups/${owner.group.id}/members/${memberId}/access`;
const rolePath = (owner, memberId) => `/api/groups/${owner.group.id}/members/${memberId}/role`;
const credentialsKey = 'plan-czytania-biblii-credentials';
const browserCredentials = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), credentialsKey);
async function join(request, owner, name = 'Anna E2E') {
  const response = await request.post(`/api/groups/${owner.group.id}/join`, {
    data: { name, inviteToken: owner.credentials.inviteToken },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function issue(request, owner, memberId, credentials = owner.credentials) {
  const response = await request.post(accessPath(owner, memberId), { data: credentials });
  expect(response.status()).toBe(201);
  const access = await response.json();
  expect(Date.parse(access.expiresAt) - Date.now()).toBeGreaterThan(570000);
  expect(Date.parse(access.expiresAt) - Date.now()).toBeLessThanOrEqual(600000);
  return access;
}
async function role(request, owner, memberId, isAdmin, credentials = owner.credentials) {
  const response = await request.post(rolePath(owner, memberId), { data: { ...credentials, isAdmin } });
  expect(response.status()).toBe(200);
  return response.json();
}

test('admin-issued access restores the exact duplicate-name profile once, including concurrent redemption', async ({ request }) => {
  const owner = await createPlan(request, 'admin-access-exact');
  const first = await join(request, owner, owner.group.members[0].name);
  const second = await join(request, owner, owner.group.members[0].name);
  await saveProgress(request, first, 's0');
  const access = await issue(request, owner, first.credentials.memberId);
  expect((await request.post('/api/session/transfers/redeem', { data: { code: access.code + '-ABCD' } })).status()).toBe(400);
  expect((await request.post('/api/session/transfers/redeem', { data: 'null', headers: { 'content-type': 'application/json' } })).status()).toBe(400);
  const responses = await Promise.all([0, 1].map(() => request.post('/api/session/transfers/redeem', { data: { code: access.code } })));
  expect(responses.filter(response => response.status() === 201)).toHaveLength(1);
  expect(responses.filter(response => [409, 410].includes(response.status()))).toHaveLength(1);
  const success = responses.find(response => response.status() === 201);
  expect(success.headers()['set-cookie']).toMatch(/HttpOnly/);
  expect(success.headers()['set-cookie']).toMatch(/Secure/);
  const recovered = await success.json();
  expect(recovered.credentials.memberId).toBe(first.credentials.memberId);
  expect(recovered.credentials.token === first.credentials.token).toBe(false);
  expect(recovered.credentials.inviteToken).toBeUndefined();
  expect(recovered.group.members).toHaveLength(3);
  expect(recovered.group.members.find(person => person.id === first.credentials.memberId).isAdmin).toBe(false);
  await expectSaved(request, recovered, ['s0']);
  await expectSaved(request, second, []);
  await expectSaved(request, owner, []);
  await saveProgress(request, recovered, 's1');
  await expectSaved(request, first, ['s0', 's1']);
  expect((await request.post('/api/session/transfers/redeem', { data: { code: access.code } })).status()).toBe(410);
  expect((await request.post(`/api/groups/${owner.group.id}/invite`, { data: recovered.credentials })).status()).toBe(403);
});

test('admin access and role endpoints enforce authentication, scope and last administrator', async ({ request }) => {
  const owner = await createPlan(request, 'admin-permissions');
  const member = await join(request, owner);
  for (const path of [accessPath(owner, member.credentials.memberId), rolePath(owner, member.credentials.memberId)]) {
    expect((await request.post(path, { data: { ...member.credentials, isAdmin: true } })).status()).toBe(403);
    expect((await request.post(path, { data: { ...owner.credentials, token: 'invalid', isAdmin: true } })).status()).toBe(403);
    expect((await request.post(path, { data: { ...owner.credentials, groupId: crypto.randomUUID(), isAdmin: true } })).status()).toBe(401);
    expect((await request.post(path.replace(member.credentials.memberId, crypto.randomUUID()), { data: { ...owner.credentials, isAdmin: true } })).status()).toBe(404);
  }
  for (const isAdmin of ['true', null, 1]) {
    expect((await request.post(rolePath(owner, member.credentials.memberId), { data: { ...owner.credentials, isAdmin } })).status()).toBe(400);
  }
  expect((await request.post(rolePath(owner, owner.credentials.memberId), { data: { ...owner.credentials, isAdmin: false } })).status()).toBe(409);
  expect((await readGroup(request, owner)).members.filter(person => person.isAdmin)).toHaveLength(1);
  expect((await request.post('/api/session/recovery-code/status', { data: owner.credentials })).ok()).toBe(true);
});

test('a second administrator restores the original administrator without a saved recovery code', async ({ request }) => {
  const owner = await createPlan(request, 'second-admin-restores');
  const second = await join(request, owner);
  await saveProgress(request, owner, 's0');
  await role(request, owner, second.credentials.memberId, true);
  expect((await request.post('/api/session/recovery-code/status', { data: owner.credentials }).then(response => response.json())).hasCode).toBe(false);
  const access = await issue(request, owner, owner.credentials.memberId, second.credentials);
  const response = await request.post('/api/session/transfers/redeem', { data: { code: access.code } });
  expect(response.status()).toBe(201);
  const recovered = await response.json();
  expect(recovered.credentials.memberId).toBe(owner.credentials.memberId);
  expect(recovered.group.members.find(person => person.id === owner.credentials.memberId).isAdmin).toBe(true);
  await expectSaved(request, recovered, ['s0']);
  const invite = await request.post(`/api/groups/${owner.group.id}/invite`, { data: recovered.credentials });
  expect(invite.status()).toBe(200);
  expect(typeof (await invite.json()).inviteToken === 'string').toBe(true);
  await saveProgress(request, owner, 's1');
  await expectSaved(request, recovered, ['s0', 's1']);
});

test('unused access is rejected after issuer demotion or target removal', async ({ request }) => {
  const owner = await createPlan(request, 'admin-access-revoked');
  const second = await join(request, owner);
  const target = await join(request, owner, 'Piotr E2E');
  await role(request, owner, second.credentials.memberId, true);
  const fromSecond = await issue(request, owner, target.credentials.memberId, second.credentials);
  await role(request, owner, second.credentials.memberId, false);
  expect((await request.post('/api/session/transfers/redeem', { data: { code: fromSecond.code } })).status()).toBe(403);
  const fromOwner = await issue(request, owner, target.credentials.memberId);
  expect((await request.delete(`/api/groups/${owner.group.id}/members/${target.credentials.memberId}`, { data: owner.credentials })).status()).toBe(200);
  expect((await request.post('/api/session/transfers/redeem', { data: { code: fromOwner.code } })).status()).toBe(403);
  expect((await request.post(accessPath(owner, target.credentials.memberId), { data: owner.credentials })).status()).toBe(404);
  expect((await readGroup(request, owner)).members).toHaveLength(2);
});

test('simultaneous demotions retain one administrator and existing member progress', async ({ request }) => {
  const owner = await createPlan(request, 'admin-role-race');
  const second = await join(request, owner);
  await role(request, owner, second.credentials.memberId, true);
  await saveProgress(request, second, 's0');
  const outcomes = await Promise.all([
    request.post(rolePath(owner, owner.credentials.memberId), { data: { ...owner.credentials, isAdmin: false } }),
    request.post(rolePath(owner, second.credentials.memberId), { data: { ...second.credentials, isAdmin: false } }),
  ]);
  expect(outcomes.filter(response => response.status() === 200)).toHaveLength(1);
  expect(outcomes.filter(response => [403, 409].includes(response.status()))).toHaveLength(1);
  const group = await readGroup(request, owner);
  expect(group.members.filter(person => person.isAdmin)).toHaveLength(1);
  expect(group.members).toHaveLength(2);
  await expectSaved(request, second, ['s0']);
});

for (const width of [1280, 390]) {
  test('administrator restores an existing participant using a link at width ' + width, async ({ page, request, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await createPlan(page.request, 'admin-link-ui-' + width);
    const member = await join(request, owner);
    await join(request, owner);
    await saveProgress(request, member, 's0');
    await page.goto('/');
    await tab(page, 'Grupa').click();
    const row = page.locator('.member-row').filter({ hasText: 'Anna E2E' }).filter({ hasText: '16,7% planu' });
    await row.getByRole('button', { name: 'Zarządzaj profilem Anna E2E', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Anna E2E', exact: true });
    await expect(dialog).toContainText('Uczestnik · 16,7% planu');
    await dialog.getByRole('button', { name: 'Utwórz link dostępu', exact: true }).click();
    await expect(dialog.getByRole('img', { name: 'Kod QR do przywrócenia dostępu', exact: true })).toBeVisible();
    const link = await dialog.getByLabel('Link dostępu', { exact: true }).inputValue();
    expect(new URL(link).hash.startsWith('#restore=')).toBe(true);
    expect(await dialog.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    await dialog.getByRole('button', { name: 'Zamknij zarządzanie profilem', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Zarządzaj profilem Anna E2E', exact: true })).toBeFocused();
    const fresh = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    try {
      const device = await fresh.newPage();
      await device.goto(link);
      await expect(device.getByRole('heading', { name: 'Przywróć dostęp do profilu', exact: true })).toBeVisible();
      expect(await browserCredentials(device)).toBeNull();
      await device.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
      await expect(device.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
      const recovered = await browserCredentials(device);
      expect(recovered.memberId).toBe(member.credentials.memberId);
      expect(recovered.token === member.credentials.token).toBe(false);
      await expect(reading(device, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
      await tab(device, 'Grupa').click();
      await expect(device.locator('.member-row')).toHaveCount(3);
      await expect(device.getByRole('button', { name: /Zarządzaj profilem/ })).toHaveCount(0);
      await device.reload();
      await expect(device.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
      expect((await browserCredentials(device)).memberId).toBe(member.credentials.memberId);
      expect(new URL(device.url()).hash).toBe('');
      await reading(device, 'Mt 1').click();
      await expectSaved(request, member, ['s0', 's1']);
    } finally { await fresh.close(); }
    expect((await readGroup(request, owner)).members).toHaveLength(3);
  });

  test('granting a second administrator requires confirmation and enables owner recovery at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await createPlan(page.request, 'admin-role-ui-' + width);
    const second = await join(request, owner);
    await page.goto('/');
    await tab(page, 'Grupa').click();
    await page.getByRole('button', { name: 'Zarządzaj profilem Anna E2E', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Anna E2E', exact: true });
    await dialog.getByRole('button', { name: 'Nadaj rolę administratora', exact: true }).click();
    await expect(dialog).toContainText('Wybierz osobę, której ufasz');
    await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect((await readGroup(request, owner)).members.find(person => person.id === second.credentials.memberId).isAdmin).toBe(false);
    await dialog.getByRole('button', { name: 'Nadaj rolę administratora', exact: true }).click();
    await dialog.getByRole('button', { name: 'Potwierdź nadanie roli', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Odbierz rolę administratora', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Usuń Anna E2E', exact: true })).toHaveCount(0);
    await expect(page.locator('.group-access-help')).not.toContainText('Jesteś jedynym administratorem');
    await tab(page, 'Ustawienia').click();
    await expect(page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true })).toContainText('Anna E2E');
    // The second admin has no personal recovery code; use the same live endpoint as their UI.
    const access = await issue(request, owner, owner.credentials.memberId, second.credentials);
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await page.getByRole('button', { name: 'Wyloguj z tego urządzenia', exact: true }).click();
    await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
    await page.getByRole('button', { name: 'Mam link lub kod od administratora', exact: true }).click();
    await page.getByLabel('Link lub kod dostępu', { exact: true }).fill(new URL('/#restore=' + access.code, page.url()).href);
    await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
    expect((await browserCredentials(page)).memberId).toBe(owner.credentials.memberId);
    await tab(page, 'Grupa').click();
    await expect(page.getByRole('button', { name: 'Zaproś', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zarządzaj profilem Anna E2E', exact: true }).click();
    await dialog.getByRole('button', { name: 'Odbierz rolę administratora', exact: true }).click();
    await dialog.getByRole('button', { name: 'Potwierdź odebranie roli', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Nadaj rolę administratora', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Usuń Anna E2E', exact: true })).toBeVisible();
  });
}

test('access links opened during use require confirmation and invalid links preserve the current profile', async ({ page, request }) => {
  const owner = await createPlan(page.request, 'admin-existing-profile');
  const member = await join(request, owner);
  const access = await issue(request, owner, member.credentials.memberId);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
  const original = await browserCredentials(page);
  // Hash-only navigation exercises opening a link while the app is already running.
  await page.goto('/#restore=2222-2222');
  await expect(page.getByRole('heading', { name: 'Przywróć dostęp do profilu', exact: true })).toBeVisible();
  await expect(page.locator('.setup-box')).toContainText('Masz już otwarty profil');
  expect((await browserCredentials(page)).memberId).toBe(original.memberId);
  await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Poproś administratora o nowy');
  expect((await browserCredentials(page)).token === original.token).toBe(true);
  await page.getByRole('button', { name: 'Wróć do wyboru', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
  await page.goto('/#restore=' + access.code);
  await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
  expect((await browserCredentials(page)).memberId).toBe(member.credentials.memberId);
  expect((await readGroup(request, owner)).members).toHaveLength(2);
});
