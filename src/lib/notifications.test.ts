import { describe, expect, it } from "vitest";
import { validReminderSettings, validPushSubscription, localReminderClock, reminderIsDue, todaysReminder, testReminder } from "./notifications";
import type { Group } from "../types";

const settings = { enabled: true, time: "08:30", timeZone: "Europe/Warsaw" };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
const group: Group = {
  id: "group", name: "Plan", createdAt: "", startDate: "2026-10-05", frequency: { kind: "daily", days: [] },
  members: [{ id: "member", name: "Tester", isAdmin: true, color: "" }],
  planDays: [
    { id: "yesterday", index: 0, date: "2026-10-04", title: "", segments: [{ id: "old", label: "Rdz 1", section: "" }] },
    { id: "today", index: 1, date: "2026-10-05", title: "", segments: [
      { id: "a", label: "Rdz 2", section: "" }, { id: "b", label: "Mt 2", section: "" },
    ] },
  ], progress: { member: { a: "read" } },
};

describe("reading reminders", () => {
  it("validates a real clock and time zone", () => {
    expect(validReminderSettings(settings)).toBe(true);
    for (const time of ["25:00", "12:60", "8:30", "", "08:30:00"]) expect(validReminderSettings({ ...settings, time })).toBe(false);
    expect(validReminderSettings({ ...settings, timeZone: "unknown" })).toBe(false);
    expect(validReminderSettings({ ...settings, enabled: "true" })).toBe(false);
  });
  it("rejects arbitrary push destinations and malformed keys", () => {
    expect(validPushSubscription(subscription)).toBe(true);
    for (const endpoint of ["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.evil.test/a", "https://evil.push.apple.com.evil.test/a", "https://user:pass@fcm.googleapis.com/a", "https://fcm.googleapis.com:8080/a"]) {
      expect(validPushSubscription({ ...subscription, endpoint })).toBe(false);
    }
    expect(validPushSubscription({ ...subscription, keys: { auth: "short", p256dh: "short" } })).toBe(false);
  });
  it("uses local dates around UTC midnight", () => {
    expect(localReminderClock(new Date("2026-10-04T22:30:00Z"), settings.timeZone)).toEqual({ date: "2026-10-05", minute: 30 });
    expect(localReminderClock(new Date("2026-10-05T00:00:00Z"), "UTC").minute).toBe(0);
  });
  it("runs at the configured local time in summer and winter with a bounded retry window", () => {
    expect(reminderIsDue(settings, new Date("2026-10-05T06:29:00Z"))).toBe(false);
    expect(reminderIsDue(settings, new Date("2026-10-05T06:30:00Z"))).toBe(true);
    expect(reminderIsDue(settings, new Date("2026-10-05T06:44:00Z"))).toBe(true);
    expect(reminderIsDue(settings, new Date("2026-10-05T06:45:00Z"))).toBe(false);
    expect(reminderIsDue(settings, new Date("2026-12-05T07:30:00Z"))).toBe(true);
    expect(reminderIsDue({ ...settings, enabled: false }, new Date("2026-10-05T06:30:00Z"))).toBe(false);
    expect(reminderIsDue({ ...settings, timeZone: "unknown" }, new Date())).toBe(false);
  });
  it("includes only unread fragments scheduled for today, with no reminder on rest days or for removed members", () => {
    const now = new Date("2026-10-05T06:30:00Z");
    expect(todaysReminder(group, "member", now, settings.timeZone)?.body).toBe("Plan: Mt 2");
    expect(todaysReminder({ ...group, progress: { member: { a: "read", b: "read" } } }, "member", now, settings.timeZone)).toBeNull();
    expect(todaysReminder(group, "member", new Date("2026-10-06T06:30:00Z"), settings.timeZone)).toBeNull();
    expect(todaysReminder(group, "removed", now, settings.timeZone)).toBeNull();
  });
  it("formats tests exactly like real reminders, changing only the title suffix and notification tag", () => {
    const now = new Date("2026-10-05T06:30:00Z");
    const real = todaysReminder(group, "member", now, settings.timeZone)!;
    expect(testReminder(group, "member", "device", now, settings.timeZone)).toEqual({
      ...real, title: `${real.title} (test)`, tag: "reading-test-device",
    });
  });
  it("previews actual plan fragments on rest days or after reading without changing progress", () => {
    const completed = { ...group, progress: { member: { old: "read", a: "read", b: "read" } } };
    expect(testReminder(completed, "member", "device", new Date("2026-10-06T06:30:00Z"), settings.timeZone)?.body).toBe("Plan: Rdz 1");
    expect(testReminder(group, "member", "device", new Date("2026-10-06T06:30:00Z"), settings.timeZone)?.body).toBe("Plan: Rdz 1");
    expect(completed.progress.member).toEqual({ old: "read", a: "read", b: "read" });
    expect(testReminder(group, "removed", "device", new Date(), settings.timeZone)).toBeNull();
  });
});
