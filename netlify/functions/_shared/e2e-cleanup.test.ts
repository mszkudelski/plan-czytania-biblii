import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ stores: new Map<string, Map<string, unknown>>(), failKey: "" }));
vi.mock("@netlify/blobs", () => ({ getStore: ({ name }: { name: string }) => {
  if (!state.stores.has(name)) state.stores.set(name, new Map());
  const data = state.stores.get(name)!;
  return {
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: unknown) => { data.set(key, value); return { modified: true }; },
    setJSON: async (key: string, value: unknown) => { data.set(key, value); },
    delete: async (key: string) => { if (key === state.failKey) throw new Error("interrupted"); data.delete(key); },
    list: ({ prefix }: { prefix: string }) => (async function* () {
      const keys = [...data.keys()].filter(key => key.startsWith(prefix));
      // Multiple pages expose implementations that forget pagination.
      for (let i = 0; i < keys.length; i += 2) yield { blobs: keys.slice(i, i + 2).map(key => ({ key })) };
    })(),
  };
} }));
import { cleanupE2e, e2eRunHash, registerE2eGroup, trackE2eResource } from "./e2e-cleanup";
import api from "../api.mts";
import type { Context } from "@netlify/functions";
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const request = (token = "a".repeat(64)) => new Request("https://example.test/api/e2e/cleanup", { headers: { "x-reading-e2e-run": token } });
const groupStore = () => state.stores.get("plan-czytania-biblii-groups")!;
beforeEach(() => { state.stores.clear(); state.failKey = ""; state.stores.set("plan-czytania-biblii-groups", new Map()); });
it("rejects missing capability and never deletes unregistered real groups, even named E2E", async () => {
  groupStore().set(`group-${id}`, { name: "E2E real user plan" });
  expect((await cleanupE2e(request("bad"), id)).status).toBe(401);
  expect((await cleanupE2e(request(), id)).status).toBe(404);
  expect(groupStore().has(`group-${id}`)).toBe(true);
});
it("only deletes this run's group, paginated progress, revisions and tracked secondary records", async () => {
  const hash = (await e2eRunHash(request()))!;
  await registerE2eGroup(hash, id);
  await registerE2eGroup((await e2eRunHash(request("b".repeat(64))))!, otherId);
  groupStore().set(`group-${id}`, {}); groupStore().set(`group-${otherId}`, {});
  for (let i = 0; i < 5; i++) { groupStore().set(`progress-v1/${id}/${i}`, {}); groupStore().set(`group-state-v1/${id}/${i}`, {}); }
  groupStore().set(`progress-v1/${otherId}/0`, {});
  await trackE2eResource(id, "plan-czytania-biblii-groups", "session-transfer-test");
  groupStore().set("session-transfer-test", {});
  expect((await cleanupE2e(request("b".repeat(64)), id)).status).toBe(404);
  expect(await (await cleanupE2e(request())).json()).toEqual({ groups: [id] });
  expect((await cleanupE2e(request(), id)).status).toBe(200);
  expect([...groupStore().keys()].sort()).toEqual([`group-${otherId}`, `progress-v1/${otherId}/0`].sort());
  expect(await (await cleanupE2e(request())).json()).toEqual({ groups: [] });
  expect((await cleanupE2e(request(), id)).status).toBe(404);
});
it("retains journal on deletion failure and resumes idempotently", async () => {
  await registerE2eGroup((await e2eRunHash(request()))!, id);
  groupStore().set(`group-${id}`, {});
  state.failKey = `group-${id}`;
  await expect(cleanupE2e(request(), id)).rejects.toThrow("interrupted");
  expect(await (await cleanupE2e(request())).json()).toEqual({ groups: [id] });
  state.failKey = "";
  expect((await cleanupE2e(request(), id)).status).toBe(200);
});
it("API registers only newly created marked E2E plans and does not expose cleanup hashes", async () => {
  const input = { name: "E2E lifecycle", ownerName: "Tester", startDate: "2026-10-14", frequency: { kind: "daily", days: [0] },
    planDays: [{ id: "d0", index: 0, date: "2026-10-14", title: "Day", segments: [{ id: "s0", label: "Rdz 1", section: "ST" }] }] };
  const create = (marked: boolean, name = input.name) => api(new Request("https://example.test/api/groups", {
    method: "POST", headers: marked ? { "x-reading-e2e-run": "a".repeat(64) } : {}, body: JSON.stringify({ ...input, name }),
  }), { deploy: { context: "production" } } as Context);
  const real = await create(false);
  expect(real.status).toBe(201);
  const realId = (await real.json() as { group: { id: string } }).group.id;
  expect((await cleanupE2e(request(), realId)).status).toBe(404);
  expect((await create(true, "Real user plan")).status).toBe(400);
  const test = await create(true);
  expect(test.status).toBe(201);
  const group = (await test.json() as { group: { id: string; e2eRunHash?: string } }).group;
  expect(group.e2eRunHash).toBeUndefined();
  expect((await cleanupE2e(request(), group.id)).status).toBe(200);
  expect(groupStore().has(`group-${realId}`)).toBe(true);
});
