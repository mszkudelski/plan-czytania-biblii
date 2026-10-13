import { describe, expect, it } from "vitest";
import { continueVisit, DEFAULT_DEVICE_PREFERENCE, devicePromptAllowed, hasCompletedReading, nextPrompt, parseDevicePreference, parseVisit, postponeDevicePrompt, VISIT_GAP, WEEK } from "./onboarding";
import type { Group } from "../types";
const NOW = Date.parse("2026-10-13T06:00:00Z");
const visit = { id: "first", lastActivity: NOW, offered: [] as ("install" | "reminder" | "recovery")[] };
describe("onboarding visits and prompt priority", () => {
  it("keeps refreshes and ordinary activity in one visit with the consumed prompt", () => {
    const current = { ...visit, offered: ["install" as const] };
    expect(continueVisit(current, NOW + VISIT_GAP - 1, "other")).toEqual({ ...current, lastActivity: NOW + VISIT_GAP - 1 });
    expect(nextPrompt({ recovery: true }, current)).toBeNull();
  });
  it("starts a new visit after 30 minutes or a clock rollback", () => {
    expect(continueVisit(visit, NOW + VISIT_GAP, "new").id).toBe("new");
    expect(continueVisit(visit, NOW - 1, "new").offered).toEqual([]);
  });
  it("prioritizes installation, reminders and then catch-up", () => {
    expect(nextPrompt({ install: true, reminder: true, recovery: true }, visit)).toBe("install");
    expect(nextPrompt({ install: false, reminder: true, recovery: true }, visit)).toBe("reminder");
    expect(nextPrompt({ install: false, reminder: false, recovery: true }, visit)).toBe("recovery");
  });
  it("waits for reminder settings instead of letting recovery win a server-response race", () => {
    expect(nextPrompt({ install: false, reminder: null, recovery: true }, visit)).toBeNull();
  });
  it("only allows the reminder continuation of a user-initiated installation", () => {
    const claimed = { ...visit, offered: ["install" as const] };
    expect(nextPrompt({ reminder: true, recovery: true }, claimed, false)).toBeNull();
    expect(nextPrompt({ reminder: true, recovery: true }, claimed, true)).toBe("reminder");
    expect(nextPrompt({ reminder: true }, { ...claimed, offered: ["install", "reminder"] }, true)).toBeNull();
    expect(nextPrompt({ recovery: true }, claimed, true)).toBeNull();
  });
  it("handles corrupt browser preferences conservatively and requires complete real reading", () => {
    expect(parseVisit("{bad")).toBeNull();
    expect(parseVisit('{"id":"visit","lastActivity":0,"offered":["unknown"]}')).toBeNull();
    expect(parseDevicePreference('{"until":"bad"}')).toEqual(DEFAULT_DEVICE_PREFERENCE);
    const group = { planDays: [{ segments: [{ id: "a" }, { id: "b" }] }], progress: { member: { a: "done" } } } as unknown as Group;
    expect(hasCompletedReading(group, "member")).toBe(false);
    group.progress.member.b = "done";
    expect(hasCompletedReading(group, "member")).toBe(true);
    expect(hasCompletedReading({ ...group, planDays: [{ segments: [] }] } as unknown as Group, "member")).toBe(false);
  });
  it("snoozes the first dismissal for a week and stops automatic proposals after the second", () => {
    const first = postponeDevicePrompt(DEFAULT_DEVICE_PREFERENCE, NOW);
    expect(devicePromptAllowed(first, NOW + WEEK - 1)).toBe(false);
    expect(devicePromptAllowed(first, NOW + WEEK)).toBe(true);
    expect(devicePromptAllowed(postponeDevicePrompt(first, NOW + WEEK), NOW + 365 * 86400000)).toBe(false);
  });
});
