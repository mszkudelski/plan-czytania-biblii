import { describe, expect, it } from "vitest";
import { DEFAULT_RECOVERY_PROMPT, recoveryPromptPreference, shouldSuggestRecovery } from "./recovery-prompt";
import { isReadingDateComplete, type RecoveryPortion } from "./recovery";
import type { PlanDay } from "../types";
const NOW = Date.parse("2026-10-12T12:00:00Z");
describe("recovery suggestions", () => {
  it("suggests only beyond three overdue readings and never in active recovery", () => {
    expect(shouldSuggestRecovery(3, false, DEFAULT_RECOVERY_PROMPT, NOW)).toBe(false);
    expect(shouldSuggestRecovery(4, false, DEFAULT_RECOVERY_PROMPT, NOW)).toBe(true);
    expect(shouldSuggestRecovery(4, true, DEFAULT_RECOVERY_PROMPT, NOW)).toBe(false);
  });
  it("snoozes for exactly a week, including across a month and daylight-saving changes", () => {
    const now = Date.parse("2026-10-24T22:30:00Z");
    const preference = recoveryPromptPreference("later", now);
    expect(shouldSuggestRecovery(4, false, preference, now + 7 * 86400000 - 1)).toBe(false);
    expect(shouldSuggestRecovery(4, false, preference, now + 7 * 86400000)).toBe(true);
  });
  it("defers suggestions for exactly 24 hours after stopping", () => {
    const preference = recoveryPromptPreference("stop", NOW);
    expect(shouldSuggestRecovery(4, false, preference, NOW + 86400000 - 1)).toBe(false);
    expect(shouldSuggestRecovery(4, false, preference, NOW + 86400000)).toBe(true);
  });
  it("never automatically suggests after opting out, and handles a reset", () => {
    expect(shouldSuggestRecovery(99, false, recoveryPromptPreference("never", NOW), NOW + 365 * 86400000)).toBe(false);
    expect(shouldSuggestRecovery(4, false, recoveryPromptPreference("reset", NOW), NOW)).toBe(true);
    expect(shouldSuggestRecovery(4, false, { disabled: false, snoozedUntil: "invalid" }, NOW)).toBe(false);
  });
});

describe("reading completion on the date strip", () => {
  const day: PlanDay = { id: "day", index: 0, date: "2026-10-12", title: "", segments: [{ id: "range", label: "Rdz 2–3", section: "ST" }] };
  const portion: RecoveryPortion = { day: { ...day, segments: [{ ...day.segments[0], label: "Rdz 3" }] }, chapterIndices: { range: [1] }, extra: { segmentId: "extra", chapterIndex: 0, label: "Rdz 4", originalDate: "2026-10-13", chapterCount: 1 } };
  it("marks standard days only when all their actual segments are complete", () => {
    expect(isReadingDateComplete(day, {})).toBe(false);
    expect(isReadingDateComplete(day, { range: "done" })).toBe(true);
    expect(isReadingDateComplete({ ...day, segments: [] }, {})).toBe(false);
  });
  it("does not mark forecast assumptions or an unfinished extra as completed", () => {
    expect(isReadingDateComplete(portion.day, {}, portion)).toBe(false);
    expect(isReadingDateComplete(portion.day, {}, portion, {}, { range: [1] })).toBe(false);
    expect(isReadingDateComplete(portion.day, {}, portion, {}, { range: [1], extra: [0] })).toBe(true);
    expect(isReadingDateComplete(portion.day, {}, portion, {}, { extra: [0] })).toBe(false);
  });
  it("supports persisted base/extra segments and the validated legacy daily extra", () => {
    expect(isReadingDateComplete(portion.day, { range: "done", extra: "done" }, portion)).toBe(true);
    expect(isReadingDateComplete(portion.day, { range: "done" }, portion, {}, {}, true)).toBe(true);
  });
});
