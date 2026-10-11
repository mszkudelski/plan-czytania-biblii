import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  records: new Map<string, { data: unknown; etag: string }>(),
  group: vi.fn(), send: vi.fn(), configured: vi.fn(),
}));
vi.mock("../../netlify/functions/api.mjs", () => ({ storedGroup: mocks.group }));
vi.mock("../../netlify/functions/_shared/notifications", () => ({
  pushConfigured: mocks.configured, sendReminder: mocks.send,
  reminderPrefix: (scope: string) => `subscriptions/${scope}/`,
  reminderStore: () => ({
    async *list({ prefix, paginate }: { prefix: string; paginate: boolean }) {
      expect(paginate).toBe(true);
      for (const key of [...mocks.records.keys()].filter(key => key.startsWith(prefix))) yield { blobs: [{ key }] };
    },
    getWithMetadata: async (key: string) => mocks.records.get(key) ?? null,
    set: async (key: string, data: unknown) => {
      if (mocks.records.has(key)) return { modified: false };
      mocks.records.set(key, { data, etag: "claim" });
      return { modified: true };
    },
    delete: async (key: string) => { mocks.records.delete(key); },
  }),
}));
import { dispatchReminders } from "../../netlify/functions/reading-reminders.mjs";
const now = new Date("2026-10-05T06:30:00Z");
const reminder = { enabled: true, time: "08:30", timeZone: "Europe/Warsaw", deviceId: "device", groupId: "group", memberId: "member", origin: "https://plan-czytania.netlify.app", subscription: {} };
const key = "subscriptions/production/device";
beforeEach(() => {
  vi.clearAllMocks(); mocks.records.clear();
  mocks.configured.mockReturnValue(true); mocks.send.mockResolvedValue({});
  mocks.records.set(key, { data: reminder, etag: "saved" });
  mocks.records.set("subscriptions/preview/test", { data: { ...reminder, deviceId: "test" }, etag: "preview" });
  mocks.group.mockResolvedValue({ id: "group", name: "Plan", members: [{ id: "member" }],
    planDays: [{ date: "2026-10-05", segments: [{ id: "a", label: "Rdz 1" }] }], progress: {} });
});
it("sends once per local day and device, follows pages and excludes preview data", async () => {
  await Promise.all([dispatchReminders(now), dispatchReminders(now)]);
  await dispatchReminders(now);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][1].body).toBe("Plan: Rdz 1");
});
it("does not send before the configured time or after disabling", async () => {
  await dispatchReminders(new Date("2026-10-05T06:29:00Z"));
  mocks.records.set(key, { data: { ...reminder, enabled: false }, etag: "disabled" });
  await dispatchReminders(now);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("skips a completed day and removes subscriptions of deleted members", async () => {
  mocks.group.mockResolvedValueOnce({ members: [{ id: "member" }], planDays: [{ date: "2026-10-05", segments: [{ id: "a" }] }], progress: { member: { a: "read" } } });
  await dispatchReminders(now);
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.group.mockResolvedValueOnce({ members: [] });
  await dispatchReminders(now);
  expect(mocks.records.has(key)).toBe(false);
});
it("retries a transient error and removes expired endpoints", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.send.mockRejectedValueOnce({ statusCode: 503 });
  await dispatchReminders(now);
  await dispatchReminders(now);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  mocks.records.delete("deliveries/group/member/device/2026-10-05");
  mocks.send.mockRejectedValueOnce({ statusCode: 410 });
  await dispatchReminders(now);
  expect(mocks.records.has(key)).toBe(false);
  log.mockRestore();
});
it("honors disabling a subscription while the dispatch is reading progress", async () => {
  const original = await mocks.group();
  mocks.group.mockImplementationOnce(async () => { mocks.records.delete(key); return original; });
  await dispatchReminders(now);
  expect(mocks.send).not.toHaveBeenCalled();
});
