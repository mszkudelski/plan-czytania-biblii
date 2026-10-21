import { beforeEach, expect, it, vi } from "vitest";
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
beforeEach(() => memory.clear());
it("authorizes replacement, validates input and rejects stale previews without modifying the group", async () => {
  const session = await fixture();
  const base = `/groups/${session.group.id}`;
  const response = await call(base + "/join", { name: "Anna", inviteToken: session.credentials.inviteToken });
  const member = await response.json() as { credentials: Credentials };
  const input = { ...session.credentials, startDate: "2026-10-19", frequency, planDays: days(["Rdz 1"]), expectedRevision: "" };
  expect((await call(base + "/plan", { ...input, token: "wrong" })).status).toBe(401);
  expect((await call(base + "/plan", { ...input, ...member.credentials })).status).toBe(403);
  expect((await call(base + "/plan", null)).status).toBe(400);
  expect((await call(base + "/plan", { ...input, groupId: "other" })).status).toBe(401);
  for (const invalid of [ { ...input, planDays: [] }, { ...input, startDate: "2026-02-30" },
    { ...input, frequency: { kind: "custom", days: [] } }, { ...input, planDays: days([""]) }]) {
    expect((await call(base + "/plan", invalid)).status).toBe(400);
  }
  expect((await call(base + "/plan", input)).status).toBe(200);
  expect((await call(base + "/plan", input)).status).toBe(409);
  const group = await (await call(base)).json() as Group;
  expect(group.planVersion).toBe(1);
  expect(group.members).toHaveLength(2);
  expect(group.members[0]).not.toHaveProperty("tokenHashes");
});
it("retains real log writes through reorder, repeated replacement and later check/uncheck", async () => {
  const session = await fixture();
  const base = `/groups/${session.group.id}`;
  const write = async (segmentId: string, completed: boolean) => {
    expect((await call(base + "/progress", { ...session.credentials, segmentId, completed })).status).toBe(200);
  };
  await write("s0", true); await write("s1", true);
  const replace = async (labels: string[], expectedRevision: string) => {
    const response = await call(base + "/plan", { ...session.credentials, startDate: "2026-10-19", frequency,
      planDays: days(labels), expectedRevision });
    expect(response.status).toBe(200);
    return response.json() as Promise<Group>;
  };
  const first = await replace(["Mt 1", "J 1", "Rdz 1"], "");
  expect(Object.keys(first.progress[session.credentials.memberId]).sort()).toEqual(["s0", "s1"]);
  const addedId = first.planDays[1].segments[0].id;
  await write(addedId, true); await write("s0", false);
  expect((await call(base + "/progress", { ...session.credentials, segmentId: "s2", completed: true })).status).toBe(400);
  const second = await replace(["Rdz 1", "J 1", "J 2"], first.planRevision!);
  expect(Object.keys(second.progress[session.credentials.memberId])).toEqual([addedId]);
  expect(second.progressSegmentIds?.slice(0, 4)).toEqual(["s0", "s1", "s2", addedId]);
  const fresh = await (await call(base)).json() as Group;
  expect(fresh.progress).toEqual(second.progress);
});

it("restores the hydrated pre-replacement snapshot, protects it and rejects stale or consumed recovery", async () => {
  const session = await fixture();
  const base = `/groups/${session.group.id}`;
  const joined = await (await call(base + "/join", { name: "Anna", inviteToken: session.credentials.inviteToken })).json() as { credentials: Credentials };
  const write = async (credentials: Credentials, segmentId: string, completed: boolean) => {
    expect((await call(base + "/progress", { ...credentials, segmentId, completed })).status).toBe(200);
  };
  const restore = (data: unknown) => call(base + "/plan/restore", data);
  expect((await restore({ ...session.credentials, expectedRevision: "" })).status).toBe(404);
  await write(session.credentials, "s0", true);
  await write(joined.credentials, "s2", true);
  const before = await (await call(base)).json() as Group;
  const replaced = await (await call(base + "/plan", { ...session.credentials, startDate: "2026-10-20", frequency,
    planDays: days(["Rdz 1", "J 1"]), expectedRevision: "" })).json() as Group;
  expect(replaced).not.toHaveProperty("previousPlan");
  expect(replaced.planRestore).toBeDefined();
  await write(session.credentials, "s0", false);
  await write(joined.credentials, replaced.planDays[1].segments[0].id, true);
  const input = { ...session.credentials, expectedRevision: replaced.planRevision };
  expect((await restore(null)).status).toBe(401);
  expect((await restore({ ...input, groupId: "other" })).status).toBe(401);
  expect((await restore({ ...input, token: "wrong" })).status).toBe(401);
  expect((await restore({ ...input, ...joined.credentials })).status).toBe(403);
  expect((await restore({ ...input, expectedRevision: 2 })).status).toBe(400);
  expect((await restore({ ...input, expectedRevision: "" })).status).toBe(409);
  const responses = await Promise.all([restore({ ...input, previousPlan: { progress: {} } }), restore(input)]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  const response = responses.find(response => response.status === 200)!;
  const restored = await response.json() as Group;
  expect(restored.members).toEqual(before.members);
  expect(restored.planDays.map(day => day.segments[0].label)).toEqual(["Rdz 1", "Mt 1", "Ps 1"]);
  expect(restored.planVersion).toBe(2);
  expect(restored.planRevision).not.toBe(replaced.planRevision);
  expect(restored.planRestore).toBeUndefined();
  expect(restored).not.toHaveProperty("previousPlan");
  const first = restored.planDays[0].segments[0].id;
  const psalm = restored.planDays[2].segments[0].id;
  expect(restored.progress).toEqual({ [session.credentials.memberId]: { [first]: before.progress[session.credentials.memberId].s0 },
    [joined.credentials.memberId]: { [psalm]: before.progress[joined.credentials.memberId].s2 } });
  expect((await restore({ ...input, expectedRevision: restored.planRevision })).status).toBe(404);
  expect((await call(base + "/progress", { ...session.credentials, segmentId: "s0", completed: true })).status).toBe(400);
  expect((await (await call(base)).json() as Group).progress).toEqual(restored.progress);
  await write(session.credentials, first, false);
  expect((await (await call(base)).json() as Group).progress[session.credentials.memberId]).toEqual({});
  await write(session.credentials, first, true);
  expect((await (await call(base)).json() as Group).progress[session.credentials.memberId][first]).toBeDefined();
});

it("enforces seven days on the server and hides expired availability without changing the current plan", async () => {
  const session = await fixture();
  const base = `/groups/${session.group.id}`;
  const response = await call(base + "/plan", { ...session.credentials, startDate: "2026-10-19", frequency,
    planDays: days(["J 1"]), expectedRevision: "" });
  const replaced = await response.json() as Group;
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse(replaced.planRestore!.expiresAt));
  try {
    expect((await call(base + "/plan/restore", { ...session.credentials, expectedRevision: replaced.planRevision })).status).toBe(410);
    const current = await (await call(base)).json() as Group;
    expect(current.planRestore).toBeUndefined();
    expect(current).not.toHaveProperty("previousPlan");
    expect(current.planDays).toEqual(replaced.planDays);
    expect(current.planRevision).toBe(replaced.planRevision);
  } finally { now.mockRestore(); }
});
