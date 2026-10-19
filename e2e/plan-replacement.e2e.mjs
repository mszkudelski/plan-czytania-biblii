import { test, expect } from './fixtures.mjs';
import { createPlan, saveProgress, readGroup, expectSaved, openPlan, tab, reading, TODAY } from './helpers.mjs';

const path = session => `/api/groups/${session.group.id}/plan`;
function input(session, labels, expectedRevision = '') {
  return { ...session.credentials, startDate: TODAY, frequency: { kind: 'daily', days: [] }, expectedRevision,
    planDays: labels.map((label, index) => ({ id: 'new-day-' + index, index, date: TODAY, title: 'Nowy dzień',
      segments: [{ id: 'new-segment-' + index, label, section: 'Czytanie' }] })),
  };
}

test('replacement keeps all members, occurrence timestamps and log identity through repeated reorders', async ({ request }) => {
  const owner = await createPlan(request, 'replace-api');
  const joined = await request.post(`/api/groups/${owner.group.id}/join`, {
    data: { name: 'Anna E2E', inviteToken: owner.credentials.inviteToken },
  });
  expect(joined.status()).toBe(201);
  const member = await joined.json();
  await saveProgress(request, owner, 's0');
  await saveProgress(request, member, 's1');
  const before = await readGroup(request, owner);
  const data = input(owner, ['Mt 1', 'J 1', 'Rdz 1']);
  expect((await request.post(path(owner), { data: { ...data, ...member.credentials } })).status()).toBe(403);
  expect((await request.post(path(owner), { data: { ...data, token: 'invalid' } })).status()).toBe(401);
  expect((await request.post(path(owner), { data: { ...data, planDays: [] } })).status()).toBe(400);
  const response = await request.post(path(owner), { data });
  expect(response.status()).toBe(200);
  const first = await response.json();
  expect(first.members).toEqual(before.members);
  expect(first.progress).toEqual(before.progress);
  expect(first.planDays.map(day => day.segments[0].id)).toEqual(['s1', expect.any(String), 's0']);
  const added = first.planDays[1].segments[0].id;
  expect(added).not.toBe('s0');
  await saveProgress(request, member, added);
  await saveProgress(request, owner, 's0', false);
  expect((await request.post(path(owner), { data })).status()).toBe(409);
  const secondResponse = await request.post(path(owner), { data: input(owner, ['Rdz 1', 'J 1'], first.planRevision) });
  expect(secondResponse.status()).toBe(200);
  const second = await secondResponse.json();
  expect(second.planVersion).toBe(2);
  expect(second.planDays[1].segments[0].id).toBe(added);
  await expectSaved(request, member, [added]);
  await expectSaved(request, owner, []);
  expect((await request.post(`/api/groups/${owner.group.id}/progress`, { data: {
    ...member.credentials, segmentId: 's1', completed: true,
  } })).status()).toBe(400);
  const invite = await request.post(`/api/groups/${owner.group.id}/invite`, { data: owner.credentials });
  expect(invite.status()).toBe(200);
});

test('administrator previews lost marks, imports CSV, retains progress after reload and opens the first unread day', async ({ page, request }) => {
  const owner = await createPlan(request, 'replace-ui');
  await saveProgress(request, owner, 's0');
  await saveProgress(request, owner, 's2');
  await openPlan(page, owner);
  await tab(page, 'Ustawienia').click();
  await page.getByRole('button', { name: 'Podmień plan', exact: true }).click();
  await page.getByLabel('Nowy plan CSV').setInputFiles({ name: 'nowy.csv', mimeType: 'text/csv',
    buffer: Buffer.from('tytuł,czytanie\nPierwszy,Rdz 1\nDrugi,J 1\nTrzeci,Mt 1\n'),
  });
  await page.getByLabel('Data rozpoczęcia').fill(TODAY);
  const preview = page.getByLabel('Podgląd zachowanego postępu');
  await expect(preview).toContainText('Dopasowane fragmenty: 2 z 3.');
  await expect(preview.getByRole('row').filter({ hasText: 'Tester E2E' }).getByRole('cell')).toHaveText(['Tester E2E', '1', '1']);
  await expect(preview.getByRole('alert')).toContainText('Nie zostaną przeniesione');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === path(owner));
  await page.getByRole('button', { name: 'Podmień plan dla całej grupy', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Plan został podmieniony' })).toBeVisible();
  await expectSaved(request, owner, ['s0']);
  await tab(page, 'Czytaj').click();
  await expect(reading(page, 'J 1')).toBeVisible();
  await page.reload();
  await expect(reading(page, 'J 1')).toBeVisible();
  await tab(page, 'Plan').click();
  await expect(page.locator('.simple-content')).toContainText('Rdz 1');
});

test('a participant cannot see the replacement action', async ({ page, request }) => {
  const owner = await createPlan(request, 'replace-participant');
  const joined = await request.post(`/api/groups/${owner.group.id}/join`, { data: {
    name: 'Anna E2E', inviteToken: owner.credentials.inviteToken,
  } });
  expect(joined.status()).toBe(201);
  await openPlan(page, await joined.json());
  await tab(page, 'Ustawienia').click();
  await expect(page.getByRole('button', { name: 'Podmień plan', exact: true })).toHaveCount(0);
});
