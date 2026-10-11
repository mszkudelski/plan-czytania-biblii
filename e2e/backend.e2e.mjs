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
  // Repeat actual races; a single execution did not reliably expose lost writes.
  for (let round = 0; round < 6; round++) {
    const completed = round % 2 === 0;
    await Promise.all([
      saveProgress(request, owner, 's0', completed),
      saveProgress(request, owner, 's1', completed),
      saveProgress(request, member, 's2', completed),
    ]);
    await expectSaved(request, owner, completed ? ['s0', 's1'] : []);
    await expectSaved(request, member, completed ? ['s2'] : []);
  }
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
  const sameAsOwner = await join('  tester   e2e  ');
  expect(again.credentials.memberId).not.toBe(anna.credentials.memberId);
  expect(sameAsOwner.credentials.memberId).not.toBe(owner.credentials.memberId);
  expect(sameAsOwner.group.members.find(member => member.id === sameAsOwner.credentials.memberId).isAdmin).toBe(false);
  expect((await readGroup(request, owner)).members).toHaveLength(4);
  await saveProgress(request, anna, 's1');
  await expectSaved(request, again, []);
  await saveProgress(request, again, 's2');
  await expectSaved(request, anna, ['s1']);
  await expectSaved(request, again, ['s2']);
  await expectSaved(request, owner, []);
  expect((await request.post(base + '/invite', { data: sameAsOwner.credentials })).status()).toBe(403);
  expect((await request.post(progressPath(owner), { data: {
    ...sameAsOwner.credentials, memberId: owner.credentials.memberId, segmentId: 's0', completed: true,
  } })).status()).toBe(401);
  expect((await request.post(base + '/invite', { data: anna.credentials })).status()).toBe(403);
  expect((await request.delete(base + '/members/' + owner.credentials.memberId, { data: anna.credentials })).status()).toBe(403);
  expect((await request.delete(base + '/members/' + owner.credentials.memberId, { data: owner.credentials })).status()).toBe(409);
  expect((await request.delete(base + '/members/' + anna.credentials.memberId, { data: owner.credentials })).status()).toBe(200);
  expect((await request.post(progressPath(anna), { data: { ...anna.credentials, segmentId: 's0', completed: true } })).status()).toBe(401);
  const group = await readGroup(request, owner);
  expect(group.members).toHaveLength(3);
  expect(group.progress[anna.credentials.memberId]).toBeUndefined();
  await expectSaved(request, again, ['s2']);
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

test('recovery restores the same profile, role, progress and cookie without revoking existing devices', async ({ request, playwright, baseURL }) => {
  const owner = await createPlan(request, 'access-recovery');
  await saveProgress(request, owner, 's0');
  const path = '/api/session/recovery-code';
  const status = await request.post(path + '/status', { data: owner.credentials });
  expect(status.status()).toBe(200);
  expect(await status.json()).toEqual({ hasCode: false });
  const issued = await request.post(path, { data: owner.credentials });
  expect(issued.status()).toBe(201);
  expect(issued.headers()['cache-control']).toBe('no-store');
  const { code } = await issued.json();
  expect(/^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){7}$/.test(code)).toBe(true);
  expect(await (await request.post(path + '/status', { data: owner.credentials })).json()).toEqual({ hasCode: true });
  const publicGroup = JSON.stringify(await readGroup(request, owner));
  for (const secret of [code, code.replaceAll('-', ''), 'codeHash', 'tokenHash']) expect(publicGroup.includes(secret)).toBe(false);
  const device = await playwright.request.newContext({ baseURL });
  try {
    expect((await device.get('/api/session')).status()).toBe(401);
    const response = await device.post(path + '/redeem', { data: { code: code.toLowerCase().replaceAll('-', ' ') } });
    expect(response.status()).toBe(201);
    const recovered = await response.json();
    expect(recovered.credentials.memberId).toBe(owner.credentials.memberId);
    expect(recovered.credentials.token === owner.credentials.token).toBe(false);
    expect(recovered.group.members).toEqual(owner.group.members);
    expect(recovered.group.progress[owner.credentials.memberId].s0).toBeTruthy();
    const cookie = response.headers()['set-cookie'];
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax']) expect(cookie.includes(attribute)).toBe(true);
    const restored = await device.get('/api/session');
    expect(restored.status()).toBe(200);
    expect((await restored.json()).credentials.memberId).toBe(owner.credentials.memberId);
    // Recovery stays usable until explicitly replaced; transfer is single use.
    expect((await device.post(path + '/redeem', { data: { code } })).status()).toBe(201);
    await saveProgress(request, owner, 's1');
    await saveProgress(device, recovered, 's2');
    await expectSaved(request, owner, ['s0', 's1', 's2']);
    expect((await device.post('/api/groups/' + owner.group.id + '/invite', { data: recovered.credentials })).status()).toBe(200);
    expect((await readGroup(request, owner)).members).toHaveLength(1);
  } finally { await device.dispose(); }
});

test('recovery rejects invalid access, replaces only its own code and cannot restore removed members', async ({ request }) => {
  const owner = await createPlan(request, 'access-recovery-rotation');
  const base = '/api/groups/' + owner.group.id;
  const joined = await request.post(base + '/join', { data: { name: 'Anna E2E', inviteToken: owner.credentials.inviteToken } });
  expect(joined.status()).toBe(201);
  const member = await joined.json();
  const path = '/api/session/recovery-code';
  for (const suffix of ['', '/status']) {
    expect((await request.post(path + suffix, { data: { ...member.credentials, token: 'invalid' } })).status()).toBe(401);
    expect((await request.post(path + suffix, { data: null })).status()).toBe(401);
  }
  for (const data of [null, {}, { code: 'ABCD-EFGH' }, { code: '0'.repeat(32) }, { code: '2'.repeat(33) }]) {
    expect((await request.post(path + '/redeem', { data })).status()).toBe(400);
  }
  expect((await request.post(path + '/redeem', { data: { code: '2'.repeat(32) } })).status()).toBe(401);
  const issue = async credentials => {
    const response = await request.post(path, { data: credentials });
    expect(response.status()).toBe(201);
    return (await response.json()).code;
  };
  const memberCode = await issue(member.credentials);
  const firstCode = await issue(owner.credentials);
  const response = await request.post(path + '/redeem', { data: { code: firstCode } });
  expect(response.status()).toBe(201);
  const device = await response.json();
  const newCode = await issue(device.credentials);
  expect((await request.post(path + '/redeem', { data: { code: firstCode } })).status()).toBe(401);
  expect((await request.post(path + '/redeem', { data: { code: newCode } })).status()).toBe(201);
  const memberRecovered = await request.post(path + '/redeem', { data: { code: memberCode } });
  expect(memberRecovered.status()).toBe(201);
  const memberDevice = await memberRecovered.json();
  expect(memberDevice.credentials.memberId).toBe(member.credentials.memberId);
  expect(memberDevice.group.members.find(person => person.id === member.credentials.memberId).isAdmin).toBe(false);
  await saveProgress(request, owner, 's0');
  await saveProgress(request, device, 's1');
  await expectSaved(request, owner, ['s0', 's1']);
  expect((await request.delete(base + '/members/' + member.credentials.memberId, { data: owner.credentials })).status()).toBe(200);
  expect((await request.post(path + '/redeem', { data: { code: memberCode } })).status()).toBe(401);
  expect((await request.post(progressPath(memberDevice), { data: { ...memberDevice.credentials, segmentId: 's0', completed: true } })).status()).toBe(401);
});

