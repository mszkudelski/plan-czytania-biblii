import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock("@netlify/blobs", () => ({ getStore: ({ name }: { name: string }) => ({
  get: async (key: string, options?: { type?: string }) => {
    const value = memory.get(`${name}/${key}`);
    return value === undefined ? null : options?.type === "json" ? JSON.parse(value) : value;
  },
  set: async (key: string, value: string, options?: { onlyIfNew?: boolean }) => {
    const fullKey = `${name}/${key}`;
    if (options?.onlyIfNew && memory.has(fullKey)) return { modified: false };
    memory.set(fullKey, value); return { modified: true };
  },
  list: async ({ prefix }: { prefix: string }) => ({ blobs: [...memory.keys()]
    .filter(key => key.startsWith(`${name}/${prefix}`)).map(key => ({ key: key.slice(name.length + 1) })) }),
}) }));
import handler from "../functions/api.mts";
import type { Credentials, Group } from "../../src/types";
const frequency = { kind: "daily", days: [] };
const days = (labels: string[]) => labels.map((label, index) => ({ id: `d${index}`, index,
  date: "2026-10-19", title: "Dzień", segments: [{ id: `s${index}`, label, section: "Fragment" }] }));
async function call(path: string, data?: unknown) {
  return handler(new Request(`https://example.com/api${path}`, data === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  }), {} as Context);
}
async function fixture() {
  const response = await call("/groups", { name: "Unit plan", ownerName: "Adam", startDate: "2026-10-19",
    frequency, planDays: days(["Rdz 1", "Mt 1", "Ps 1"]) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ group: Group; credentials: Credentials }>;
}
beforeEach(() => {
  memory.clear();
  // In-memory requests can finish in the same millisecond. Give sequential
  // writes distinct timestamps, the ordering resolution of the progress log.
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now++);
});
afterEach(() => vi.restoreAllMocks());
it("validates join choice and persists isolated personal start without inventing progress", async () => {
  const session = await fixture(); const base = `/groups/${session.group.id}`;
  // Make dates relative to the server clock to exercise the real join calculation.
  const planDays = days(["Rdz 1", "Rdz 2", "Rdz 3"]).map((day, index) => ({ ...day,
    date: new Date(Date.now() + (index - 1) * 86400000).toISOString().slice(0, 10) }));
  expect((await call(base + "/plan", { ...session.credentials, planDays, startDate: planDays[0].date, frequency, expectedRevision: "" })).status).toBe(200);
  expect((await call(base + "/join", { name: "Nowa", inviteToken: session.credentials.inviteToken, readingStart: "bad" })).status).toBe(400);
  expect((await call(base + "/join", { name: "Nowa", inviteToken: session.credentials.inviteToken, readingStart: "group", timeZone: "bad" })).status).toBe(400);
  const join = async (readingStart: string) => {
    const response = await call(base + "/join", { name: "Nowa", inviteToken: session.credentials.inviteToken, readingStart });
    expect(response.status).toBe(201); return response.json() as Promise<{ group: Group; credentials: Credentials }>;
  };
  const first = await join("beginning"), second = await join("group");
  const member = second.group.members.find(m => m.id === second.credentials.memberId)!;
  expect(member.readingStart?.skippedSegmentIds).toHaveLength(1);
  expect(member.readingStart?.autoRecoveryAt).toBeUndefined();
  expect(first.group.members.find(m => m.id === first.credentials.memberId)?.readingStart?.autoRecoveryAt).toBeTruthy();
  expect(second.group.progress[second.credentials.memberId]).toEqual({});
  expect(second.group.planDays).toEqual(first.group.planDays);
  expect((await call(base + "/include-skipped", { ...second.credentials, token: "wrong" })).status).toBe(401);
  expect((await call(base + "/include-skipped", { ...second.credentials, groupId: "other" })).status).toBe(401);
  const segmentId = second.group.planDays[1].segments[0].id;
  expect((await call(base + "/progress", { ...second.credentials, segmentId, completed: true })).status).toBe(200);
  const returned = await call(base + "/include-skipped", second.credentials); expect(returned.status).toBe(200);
  const group = await returned.json() as Group;
  expect(group.members.find(m => m.id === second.credentials.memberId)?.readingStart?.skippedSegmentIds).toEqual([]);
  expect(group.progress[second.credentials.memberId][segmentId]).toBeTruthy();
  expect(group.progress[session.credentials.memberId]).toEqual({});
  expect(group.members.find(m => m.id === first.credentials.memberId)?.readingStart?.autoRecoveryAt).toBeTruthy();
});
