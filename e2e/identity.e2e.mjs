import { test, expect } from '@playwright/test';
import { createPlan, inputPlan, saveProgress, readGroup, expectSaved, reading, tab } from './helpers.mjs';

// Access links and legacy recovery codes grant access; keep them out of reports.
test.use({ screenshot: 'off' });
const credentialsKey = 'plan-czytania-biblii-credentials';
const browserCredentials = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), credentialsKey);
const joinPath = session => '/#join=' + Buffer.from(JSON.stringify({
  groupId: session.group.id, inviteToken: session.credentials.inviteToken,
})).toString('base64url');

async function noPersonalCodeOptions(page) {
  await expect(page.getByText(/osobisty kod/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /kod odzyskiwania|poprzedni kod|ukryj kod/i })).toHaveCount(0);
  await expect(page.getByLabel('Kod odzyskiwania', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Twój kod odzyskiwania', { exact: true })).toHaveCount(0);
}
function personalCodeRequests(page) {
  const paths = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/session/recovery-code')) paths.push(path);
  });
  return paths;
}
async function join(request, owner) {
  const response = await request.post(`/api/groups/${owner.group.id}/join`, {
    data: { name: 'Anna E2E', inviteToken: owner.credentials.inviteToken },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function access(request, owner, memberId, credentials = owner.credentials) {
  const response = await request.post(`/api/groups/${owner.group.id}/members/${memberId}/access`, {
    data: credentials,
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test('creating a plan explains group recovery without personal-code options or requests', async ({ page, request }) => {
  const codeRequests = personalCodeRequests(page);
  const plan = inputPlan('create-ui');
  await page.goto('/');
  await page.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await page.getByLabel('Nazwa grupy').fill(plan.name);
  await page.getByLabel('Twoje imię').fill(plan.ownerName);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e.csv', mimeType: 'text/csv', buffer: Buffer.from('Dzień;Stary Testament;Nowy Testament\nDzień 1;Rdz 1;Mt 1'),
  });
  await page.locator('form').getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
  const credentials = await browserCredentials(page);
  const session = { group: { id: credentials.groupId }, credentials };
  const group = await readGroup(request, session);
  expect(group.name).toBe(plan.name);
  expect(group.members).toHaveLength(1);
  expect(group.members[0].isAdmin).toBe(true);
  test.info().annotations.push({ type: 'test-plan', description: group.id });
  await tab(page, 'Grupa').click();
  await expect(page.locator('.group-access-help')).toContainText('Jesteś jedynym administratorem');
  await tab(page, 'Ustawienia').click();
  await expect(page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true })).toContainText('Nadaj rolę administratora');
  await expect(page.getByRole('button', { name: 'Utwórz kod połączenia', exact: true })).toBeEnabled();
  await noPersonalCodeOptions(page);
  await expect(page.locator('.access-hint')).toHaveCount(0);
  expect(codeRequests).toEqual([]);
});

for (const width of [1280, 390]) {
  test('joining a duplicate name creates a separate profile at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await createPlan(request, 'duplicate-ui-' + width);
    await saveProgress(request, owner, 's1');
    await page.goto(joinPath(owner));
    await expect(page.getByRole('heading', { name: 'Dołącz do planu', exact: true })).toBeVisible();
    await expect(page.locator('.setup-box')).toContainText(owner.group.name);
    await page.getByLabel('Twoje imię').fill('  tester   e2e  ');
    await expect(page.locator('.name-match-notice')).toContainText('Dołączenie utworzy osobny profil');
    await page.getByRole('button', { name: 'Dołącz jako nowa osoba', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
    const credentials = await browserCredentials(page);
    expect(credentials.memberId).not.toBe(owner.credentials.memberId);
    const member = { group: owner.group, credentials };
    const group = await readGroup(request, member);
    expect(group.members).toHaveLength(2);
    expect(group.members.find(person => person.id === credentials.memberId).isAdmin).toBe(false);
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
    await reading(page, 'Rdz 1').click();
    await expectSaved(request, member, ['s0']);
    await expectSaved(request, owner, ['s1']);
    await tab(page, 'Grupa').click();
    await expect(page.locator('.member-row')).toHaveCount(2);
    await expect(page.locator('.member-row').filter({ hasText: 'Ty' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Zaproś', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Zarządzaj profilem/ })).toHaveCount(0);
    await expect(page.locator('.group-access-help')).toContainText('Poproś administratora');
    await page.reload();
    expect((await browserCredentials(page)).memberId).toBe(credentials.memberId);
  });

  test('group recovery restores access after logout and survives reload at width ' + width, async ({ page, request }) => {
    const codeRequests = personalCodeRequests(page);
    await page.setViewportSize({ width, height: 900 });
    // page.request shares its real cookie with the browser; no injected session.
    const owner = await createPlan(page.request, 'recover-ui-' + width);
    const second = await join(request, owner);
    expect((await request.post(`/api/groups/${owner.group.id}/members/${second.credentials.memberId}/role`, {
      data: { ...owner.credentials, isAdmin: true },
    })).status()).toBe(200);
    const { code } = await access(request, owner, owner.credentials.memberId, second.credentials);
    await saveProgress(request, owner, 's0');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
    await tab(page, 'Ustawienia').click();
    const panel = page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true });
    await expect(panel).toContainText('Anna E2E');
    await noPersonalCodeOptions(page);
    expect(await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), code)).toBe(false);
    expect(await panel.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await expect(page.locator('.logout-confirm')).toContainText('Samo imię nie przywróci dostępu');
    await noPersonalCodeOptions(page);
    await page.locator('.logout-confirm').getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect((await browserCredentials(page)).memberId).toBe(owner.credentials.memberId);
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await page.getByRole('button', { name: 'Wyloguj z tego urządzenia', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true })).toBeVisible();
    expect(await browserCredentials(page)).toBeNull();
    expect((await page.request.get('/api/session')).status()).toBe(401);
    await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
    await noPersonalCodeOptions(page);
    await page.getByRole('button', { name: 'Mam link lub kod od administratora', exact: true }).click();
    await page.getByLabel('Link lub kod dostępu', { exact: true }).fill('ABCD');
    await expect(page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true })).toBeDisabled();
    await page.getByLabel('Link lub kod dostępu', { exact: true }).fill('2'.repeat(32));
    await expect(page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true })).toBeDisabled();
    await page.getByLabel('Link lub kod dostępu', { exact: true }).fill('2222-2222');
    await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('nieprawidłowy');
    await page.getByLabel('Link lub kod dostępu', { exact: true }).fill(code.toLowerCase().replaceAll('-', ' '));
    await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
    const recovered = await browserCredentials(page);
    expect(recovered.memberId).toBe(owner.credentials.memberId);
    expect(recovered.token === owner.credentials.token).toBe(false);
    expect((await readGroup(request, owner)).members).toHaveLength(2);
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
    expect((await browserCredentials(page)).token === recovered.token).toBe(true);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
    expect((await browserCredentials(page)).token === recovered.token).toBe(true);
    await reading(page, 'Mt 1').click();
    await expectSaved(request, owner, ['s0', 's1']);
    await tab(page, 'Ustawienia').click();
    await expect(panel).toContainText('Anna E2E');
    await noPersonalCodeOptions(page);
    expect(codeRequests).toEqual([]);
  });
}

test('an invitation offers recovery and pairing without silently creating a profile', async ({ page, request }) => {
  const owner = await createPlan(request, 'invite-recover');
  const member = await join(request, owner);
  await saveProgress(request, member, 's0');
  const { code } = await access(request, owner, member.credentials.memberId);
  await page.goto(joinPath(owner));
  await page.getByRole('button', { name: 'Odzyskaj mój dostęp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Odzyskaj mój dostęp', exact: true })).toBeVisible();
  await noPersonalCodeOptions(page);
  await page.getByRole('button', { name: 'Mam dostęp na innym urządzeniu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Połącz inne urządzenie', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wróć do wyboru', exact: true }).click();
  await page.getByRole('button', { name: 'Odzyskaj mój dostęp', exact: true }).click();
  await page.getByRole('button', { name: 'Mam link lub kod od administratora', exact: true }).click();
  await page.getByLabel('Link lub kod dostępu', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Przywróć mój dostęp', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^E2E /, exact: false })).toBeVisible();
  expect((await browserCredentials(page)).memberId).toBe(member.credentials.memberId);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, member, ['s0']);
  expect((await readGroup(request, owner)).members).toHaveLength(2);
  expect(new URL(page.url()).hash).toBe('');
});

test('existing personal codes stay hidden across settings, reload and logout', async ({ page, request }) => {
  const codeRequests = personalCodeRequests(page);
  const owner = await createPlan(page.request, 'recovery-rotate-ui');
  const response = await request.post('/api/session/recovery-code', { data: owner.credentials });
  expect(response.status()).toBe(201);
  const { code } = await response.json();
  await page.goto('/');
  await tab(page, 'Ustawienia').click();
  const panel = page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true });
  await expect(panel).toContainText('Jesteś jedynym administratorem');
  await noPersonalCodeOptions(page);
  await tab(page, 'Czytaj').click();
  await tab(page, 'Ustawienia').click();
  await noPersonalCodeOptions(page);
  await page.reload();
  await tab(page, 'Ustawienia').click();
  await noPersonalCodeOptions(page);
  expect(await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), code)).toBe(false);
  await saveProgress(request, owner, 's0');
  await expectSaved(request, owner, ['s0']);
  await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
  await noPersonalCodeOptions(page);
  await page.getByRole('button', { name: 'Wyloguj z tego urządzenia', exact: true }).click();
  await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
  await noPersonalCodeOptions(page);
  await expect(page.getByRole('button', { name: 'Mam link lub kod od administratora', exact: true })).toBeVisible();
  expect(codeRequests).toEqual([]);
  // Hiding the UI must not invalidate legacy data or existing device tokens.
  expect((await request.post('/api/session/recovery-code/redeem', { data: { code } })).status()).toBe(201);
  await expectSaved(request, owner, ['s0']);
});
