import { beforeEach, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import type { Credentials, Group } from "../../src/types";

const state = vi.hoisted(() => ({ memory: new Map<string, string>(), failAnalytics: false }));
vi.mock("@netlify/blobs", () => ({ getStore: ({ name }: { name: string }) => ({
  get: async (key: string, options?: { type?: string }) => {
    if (state.failAnalytics && key.startsWith("analytics-plan-v1/")) throw new Error("Analytics storage unavailable");
    const value = state.memory.get(`${name}/${key}`);
    return value === undefined ? null : options?.type === "json" ? JSON.parse(value) : value;
  },
  set: async (key: string, value: string, options?: { onlyIfNew?: boolean }) => {
    const full = `${name}/${key}`;
    if (options?.onlyIfNew && state.memory.has(full)) return { modified: false };
    state.memory.set(full, value); return { modified: true };
  },
  list: async ({ prefix }: { prefix: string }) => ({ blobs: [...state.memory.keys()]
    .filter(key => key.startsWith(`${name}/${prefix}`)).map(key => ({ key: key.slice(name.length + 1) })) }),
}) }));
import handler from "../functions/api.mts";
import { BASIC_PLAN_CSV } from "../../src/lib/basic-plan";
import { parsePlanCsv } from "../../src/lib/csv";
import { buildSchedule } from "../../src/lib/schedule";
const frequency = { kind: "daily" as const, days: [0, 1, 2, 3, 4, 5, 6] };
const planDays = buildSchedule(parsePlanCsv("Dzień;Czytanie\n1;Rdz 1"), "2026-10-28", frequency);
async function call(path: string, data?: unknown) {
  return handler(new Request(`https://example.com/api${path}`, data === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  }), {} as Context);
}
async function create(extra = {}) {
  const response = await call("/groups", { name: "Private name", ownerName: "Private person", startDate: "2026-10-28",
    frequency, planDays, ...extra });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ group: Group; credentials: Credentials }>;
}
beforeEach(() => { state.memory.clear(); state.failAnalytics = false; });

it("generates an independent random analytics identity and classifies the actual schedule", async () => {
  const first = await create({ analyticsPlanId: "forged", planTemplate: "mcheyne_365" });
  const second = await create();
  expect(first.group.analyticsPlanId).toMatch(/^[a-f0-9-]{36}$/);
  expect(first.group.analyticsPlanId).not.toBe(first.group.id);
  expect(first.group.analyticsPlanId).not.toBe(second.group.analyticsPlanId);
  expect(first.group.planTemplate).toBe("custom_csv");
  expect(first.group.analyticsDisabled).toBe(false);
  const basic = await create({ planDays: buildSchedule(parsePlanCsv(BASIC_PLAN_CSV), "2026-10-28", frequency) });
  expect(basic.group.planTemplate).toBe("mcheyne_365");
  const read = await (await call(`/groups/${first.group.id}`)).json() as Group;
  const saved = await (await call(`/groups/${first.group.id}/progress`, {
    ...first.credentials, segmentId: first.group.planDays[0].segments[0].id, completed: true,
  })).json() as Group;
  expect(read.analyticsPlanId).toBe(first.group.analyticsPlanId);
  expect(saved.analyticsPlanId).toBe(first.group.analyticsPlanId);
});

it("assigns one legacy identity under concurrent reads without rewriting the baseline or progress", async () => {
  const created = await create();
  const key = `plan-czytania-biblii-groups/group-${created.group.id}`;
  const legacy = JSON.parse(state.memory.get(key)!);
  delete legacy.analyticsPlanId; delete legacy.planTemplate;
  const baseline = JSON.stringify(legacy);
  state.memory.set(key, baseline);
  const reads = await Promise.all(Array.from({ length: 4 }, async () =>
    (await (await call(`/groups/${legacy.id}`)).json()) as Group));
  expect(new Set(reads.map(group => group.analyticsPlanId)).size).toBe(1);
  expect(reads[0].analyticsPlanId).toMatch(/^[a-f0-9-]{36}$/);
  expect(reads[0].planTemplate).toBeUndefined();
  expect(reads[0].progress).toEqual(legacy.progress);
  expect(state.memory.get(key)).toBe(baseline);
  expect([...state.memory.keys()].filter(key => key.includes("analytics-plan-v1/"))).toHaveLength(1);
});

it("keeps legacy reading and writes available when analytics metadata cannot be read", async () => {
  const created = await create();
  const key = `plan-czytania-biblii-groups/group-${created.group.id}`;
  const legacy = JSON.parse(state.memory.get(key)!);
  delete legacy.analyticsPlanId;
  state.memory.set(key, JSON.stringify(legacy));
  state.failAnalytics = true;
  const response = await call(`/groups/${legacy.id}`);
  expect(response.status).toBe(200);
  expect((await response.json() as Group).analyticsPlanId).toBeUndefined();
  const saved = await call(`/groups/${legacy.id}/progress`, {
    ...created.credentials, segmentId: planDays[0].segments[0].id, completed: true,
  });
  expect(saved.status).toBe(200);
  expect((await saved.json() as Group).progress[created.credentials.memberId][planDays[0].segments[0].id]).toBeTruthy();
});
