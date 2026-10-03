import { test, expect } from '@playwright/test';
import { createPlan, inputPlan, saveProgress, readGroup, expectSaved, progressPath } from './helpers.mjs';

test('rejects invalid plans and missing groups', async ({ request }) => {
  const bad = inputPlan('invalid');
  bad.planDays[0].segments = [];
  expect((await request.post('/api/groups', { data: bad })).status()).toBe(400);
  expect((await request.get('/api/groups/' + crypto.randomUUID())).status()).toBe(404);
});

test('real persistence, idempotence, invalid credentials and invalid segment', async ({ request }) => {
  const session = await createPlan(request, 'persistence');
  const publicGroup = await readGroup(request, session);
  const serialized = JSON.stringify(publicGroup);
  for (const field of ['tokenHash', 'tokenHashes', 'inviteTokenHash']) expect(serialized.includes(field)).toBe(false);
  expect(serialized.includes(session.credentials.token)).toBe(false);
  expect(serialized.includes(session.credentials.inviteToken)).toBe(false);
  expect((await request.post(progressPath(session), { data: {
    ...session.credentials, token: 'invalid', segmentId: 's0', completed: true,
  } })).status()).toBe(401);
  expect((await request.post(progressPath(session), { data: {
    ...session.credentials, segmentId: 'not-in-plan', completed: true,
  } })).status()).toBe(400);
  expect((await request.post(progressPath(session), { data: {
    ...session.credentials, segmentId: 's0', completed: 'true',
  } })).status()).toBe(400);
  await expectSaved(request, session, []);
  await saveProgress(request, session, 's0');
  await saveProgress(request, session, 's0');
  await expectSaved(request, session, ['s0']);
  await saveProgress(request, session, 's0', false);
  await saveProgress(request, session, 's0', false);
  await expectSaved(request, session, []);
});

test('concurrent writes preserve both members and different segments', async ({ request }) => {
  const owner = await createPlan(request, 'concurrency');
  const join = await request.post('/api/groups/' + owner.group.id + '/join', {
    data: { name: 'Anna E2E', inviteToken: owner.credentials.inviteToken },
  });
  expect(join.status()).toBe(201);
  const member = await join.json();
  // The writes really race through the Blobs compare-and-swap path.
  await Promise.all([
    saveProgress(request, owner, 's0'),
    saveProgress(request, owner, 's1'),
    saveProgress(request, member, 's2'),
  ]);
  await expectSaved(request, owner, ['s0', 's1']);
  await expectSaved(request, member, ['s2']);
});

test('join, duplicate names, permissions and removed member access', async ({ request }) => {
  const owner = await createPlan(request, 'members');
  const base = '/api/groups/' + owner.group.id;
  expect((await request.post(base + '/join', { data: { name: 'Anna', inviteToken: 'invalid' } })).status()).toBe(401);
  const join = async name => {
    const response = await request.post(base + '/join', { data: { name, inviteToken: owner.credentials.inviteToken } });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const anna = await join('Anna E2E');
  const again = await join('  anna   e2e  ');
  expect(again.credentials.memberId).toBe(anna.credentials.memberId);
  expect((await readGroup(request, owner)).members).toHaveLength(2);
  await saveProgress(request, anna, 's1');
  await expectSaved(request, again, ['s1']);
  expect((await request.post(base + '/invite', { data: anna.credentials })).status()).toBe(403);
  expect((await request.delete(base + '/members/' + owner.credentials.memberId, { data: anna.credentials })).status()).toBe(403);
  expect((await request.delete(base + '/members/' + owner.credentials.memberId, { data: owner.credentials })).status()).toBe(409);
  expect((await request.delete(base + '/members/' + anna.credentials.memberId, { data: owner.credentials })).status()).toBe(200);
  expect((await request.post(progressPath(anna), { data: { ...anna.credentials, segmentId: 's0', completed: true } })).status()).toBe(401);
  const group = await readGroup(request, owner);
  expect(group.members).toHaveLength(1);
  expect(group.progress[anna.credentials.memberId]).toBeUndefined();
});

test('secure session cookie restores and clears access', async ({ request }) => {
  const session = await createPlan(request, 'cookie');
  const response = await request.post('/api/session', { data: session.credentials });
  expect(response.status()).toBe(200);
  const cookie = response.headers()['set-cookie'];
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax']) expect(cookie.includes(attribute)).toBe(true);
  const restored = await request.get('/api/session');
  expect(restored.status()).toBe(200);
  expect((await restored.json()).credentials.memberId).toBe(session.credentials.memberId);
  expect((await request.delete('/api/session')).status()).toBe(200);
  expect((await request.get('/api/session')).status()).toBe(401);
});

test('transfer code is single use; both devices retain valid access', async ({ request, playwright, baseURL }) => {
  const session = await createPlan(request, 'transfer');
  const issued = await request.post('/api/session/transfers', { data: session.credentials });
  expect(issued.status()).toBe(201);
  const transfer = await issued.json();
  const device = await playwright.request.newContext({ baseURL });
  try {
    const redeemed = await device.post('/api/session/transfers/redeem', { data: { code: transfer.code } });
    expect(redeemed.status()).toBe(201);
    const second = await redeemed.json();
    expect(second.credentials.memberId).toBe(session.credentials.memberId);
    expect(second.credentials.token === session.credentials.token).toBe(false);
    expect((await device.post('/api/session/transfers/redeem', { data: { code: transfer.code } })).status()).toBe(410);
    await saveProgress(request, session, 's0');
    await saveProgress(device, second, 's1');
    await expectSaved(request, session, ['s0', 's1']);
  } finally { await device.dispose(); }
});
