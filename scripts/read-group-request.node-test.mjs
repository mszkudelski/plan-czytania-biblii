import test from 'node:test';
import assert from 'node:assert/strict';
import { readGroupRequest } from '../e2e/read-group-request.mjs';

test('a successful or HTTP-error group response is returned once without retry or transformation', async () => {
  for (const status of [200, 401, 404, 500]) {
    const response = { status };
    let count = 0;
    assert.equal(await readGroupRequest({ get: async () => { count++; return response; } }, '/group'), response);
    assert.equal(count, 1);
  }
});

test('a stalled group GET retries within the same total 30s transport budget', async () => {
  let elapsed = 0;
  const calls = [];
  const response = { status: 200 };
  const request = { get: async (path, options) => {
    calls.push({ path, ...options });
    if (calls.length === 1) {
      elapsed = 10000;
      throw Object.assign(new Error('network read stalled'), { name: 'TimeoutError' });
    }
    return response;
  } };
  assert.equal(await readGroupRequest(request, '/group', () => elapsed), response);
  assert.deepEqual(calls, [
    { path: '/group', timeout: 10000, maxRetries: 2 },
    { path: '/group', timeout: 20000, maxRetries: 2 },
  ]);
});

test('remaining transport time is respected and no third request follows another failure', async () => {
  let elapsed = 0;
  const timeouts = [];
  const error = new Error('ECONNRESET');
  await assert.rejects(readGroupRequest({ get: async (_path, options) => {
    timeouts.push(options.timeout); elapsed = 29000; throw error;
  } }, '/group', () => elapsed), value => value === error);
  assert.deepEqual(timeouts, [10000, 1000]);
});

test('non-transport failures and exhausted budgets are not retried', async () => {
  for (const expired of [false, true]) {
    let count = 0;
    let elapsed = 0;
    const error = Object.assign(new Error('failed'), { name: expired ? 'TimeoutError' : 'TypeError' });
    await assert.rejects(readGroupRequest({ get: async () => {
      count++; elapsed = expired ? 30000 : 1; throw error;
    } }, '/group', () => elapsed), value => value === error);
    assert.equal(count, 1);
  }
});
