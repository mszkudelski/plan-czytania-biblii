import { test, expect } from '@playwright/test';
import { createPlan, inputPlan, saveProgress, readGroup, expectSaved, reading, tab } from './helpers.mjs';

// Recovery codes grant access. Keep them out of failure screenshots and logs.
test.use({ screenshot: 'off' });
const credentialsKey = 'plan-czytania-biblii-credentials';
const browserCredentials = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), credentialsKey);
const joinPath = session => '/#join=' + Buffer.from(JSON.stringify({
  groupId: session.group.id, inviteToken: session.credentials.inviteToken,
})).toString('base64url');

test('creating a plan offers a recovery code after the first entry', async ({ page, request }) => {
  const plan = inputPlan('create-ui');
  await page.goto('/');
  await page.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await page.getByLabel('Nazwa grupy').fill(plan.name);
  await page.getByLabel('Twoje imię').fill(plan.ownerName);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e.csv', mimeType: 'text/csv', buffer: Buffer.from('Dzień;Stary Testament;Nowy Testament\nDzień 1;Rdz 1;Mt 1'),
  });
  await page.locator('form').getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
  const credentials = await browserCredentials(page);
  const session = { group: { id: credentials.groupId }, credentials };
  const group = await readGroup(request, session);
  expect(group.name).toBe(plan.name);
  expect(group.members).toHaveLength(1);
  expect(group.members[0].isAdmin).toBe(true);
  test.info().annotations.push({ type: 'test-plan', description: group.id });
  await page.getByRole('button', { name: 'Zapisz kod odzyskiwania', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Utwórz kod odzyskiwania', exact: true })).toBeEnabled();
  await expect(page.locator('.access-hint')).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
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
    await page.getByRole('button', { name: 'Później', exact: true }).click();
    await tab(page, 'Grupa').click();
    await expect(page.locator('.member-row')).toHaveCount(2);
    await expect(page.locator('.member-row').filter({ hasText: 'Ty' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Zaproś', exact: true })).toHaveCount(0);
    await page.reload();
    expect((await browserCredentials(page)).memberId).toBe(credentials.memberId);
  });

  test('saved recovery code restores access after logout and survives reload at width ' + width, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    // page.request shares its real cookie with the browser; no injected session.
    const owner = await createPlan(page.request, 'recover-ui-' + width);
    await saveProgress(request, owner, 's0');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
    await tab(page, 'Ustawienia').click();
    const panel = page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true });
    await panel.getByRole('button', { name: 'Utwórz kod odzyskiwania', exact: true }).click();
    const output = panel.getByLabel('Twój kod odzyskiwania');
    await expect(output).toBeVisible();
    const code = await output.textContent();
    expect(/^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){7}$/.test(code)).toBe(true);
    expect(await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), code)).toBe(false);
    expect(await panel.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    await panel.getByRole('button', { name: 'Ukryj kod', exact: true }).click();
    await expect(output).toHaveCount(0);
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await expect(page.locator('.logout-confirm')).toContainText('Samo imię nie przywróci dostępu');
    await page.locator('.logout-confirm').getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect((await browserCredentials(page)).memberId).toBe(owner.credentials.memberId);
    await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
    await page.getByRole('button', { name: 'Wyloguj z tego urządzenia', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true })).toBeVisible();
    expect(await browserCredentials(page)).toBeNull();
    expect((await page.request.get('/api/session')).status()).toBe(401);
    await page.getByRole('button', { name: 'Odzyskaj dostęp do mojego planu', exact: true }).click();
    await page.getByLabel('Kod odzyskiwania', { exact: true }).fill('ABCD-EFGH');
    await expect(page.getByRole('button', { name: 'Odzyskaj dostęp', exact: true })).toBeDisabled();
    await page.getByLabel('Kod odzyskiwania', { exact: true }).fill('2'.repeat(32));
    await page.getByRole('button', { name: 'Odzyskaj dostęp', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('nieprawidłowy');
    await page.getByLabel('Kod odzyskiwania', { exact: true }).fill(code.toLowerCase().replaceAll('-', ' '));
    await page.getByRole('button', { name: 'Odzyskaj dostęp', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
    const recovered = await browserCredentials(page);
    expect(recovered.memberId).toBe(owner.credentials.memberId);
    expect(recovered.token === owner.credentials.token).toBe(false);
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
    expect((await browserCredentials(page)).token === recovered.token).toBe(true);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
    expect((await browserCredentials(page)).token === recovered.token).toBe(true);
    await reading(page, 'Mt 1').click();
    await expectSaved(request, owner, ['s0', 's1']);
    await tab(page, 'Ustawienia').click();
    await expect(panel.getByRole('button', { name: 'Utwórz nowy kod odzyskiwania', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Utwórz nowy kod odzyskiwania', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Poprzedni kod przestanie działać');
    await panel.getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect((await page.request.post('/api/session/recovery-code/redeem', { data: { code } })).status()).toBe(201);
  });
}

test('an invitation offers recovery and pairing without silently creating a profile', async ({ page, request }) => {
  const owner = await createPlan(request, 'invite-recover');
  const response = await request.post('/api/session/recovery-code', { data: owner.credentials });
  expect(response.status()).toBe(201);
  const { code } = await response.json();
  await page.goto(joinPath(owner));
  await page.getByRole('button', { name: 'Odzyskaj dostęp kodem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Odzyskaj mój dostęp', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mam dostęp na innym urządzeniu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Połącz inne urządzenie', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wróć do wyboru', exact: true }).click();
  await page.getByRole('button', { name: 'Odzyskaj dostęp kodem', exact: true }).click();
  await page.getByLabel('Kod odzyskiwania', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Odzyskaj dostęp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dzisiaj', exact: true })).toBeVisible();
  expect((await browserCredentials(page)).memberId).toBe(owner.credentials.memberId);
  expect((await readGroup(request, owner)).members).toHaveLength(1);
  expect(new URL(page.url()).hash).toBe('');
});

test('replacing a recovery code requires confirmation and hides it after leaving settings', async ({ page, request }) => {
  const owner = await createPlan(page.request, 'recovery-rotate-ui');
  await page.goto('/');
  await tab(page, 'Ustawienia').click();
  const panel = page.getByRole('region', { name: 'Odzyskiwanie dostępu', exact: true });
  await panel.getByRole('button', { name: 'Utwórz kod odzyskiwania', exact: true }).click();
  await expect(panel.getByLabel('Twój kod odzyskiwania')).toBeVisible();
  const oldCode = await panel.getByLabel('Twój kod odzyskiwania').textContent();
  await panel.getByRole('button', { name: 'Utwórz nowy kod odzyskiwania', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Dostęp na połączonych urządzeniach zostanie zachowany');
  await panel.getByRole('button', { name: 'Zastąp poprzedni kod', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const newCode = await panel.getByLabel('Twój kod odzyskiwania').textContent();
  expect(newCode === oldCode).toBe(false);
  expect((await request.post('/api/session/recovery-code/redeem', { data: { code: oldCode } })).status()).toBe(401);
  expect((await request.post('/api/session/recovery-code/redeem', { data: { code: newCode } })).status()).toBe(201);
  await tab(page, 'Dzisiaj').click();
  await tab(page, 'Ustawienia').click();
  await expect(panel.getByLabel('Twój kod odzyskiwania')).toHaveCount(0);
  await expect(panel).toContainText('Masz już kod odzyskiwania');
  await saveProgress(request, owner, 's0');
  await expectSaved(request, owner, ['s0']);
});
