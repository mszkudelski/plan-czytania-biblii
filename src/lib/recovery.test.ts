import { expect, it } from "vitest";
import { getRecoveryDay, getOverdueDays, getRecoveryReading, splitReadingChapters } from "./recovery";
import { buildSchedule } from "./schedule";
import type { Group } from "../types";
function fixture(): Group {
  return { id: "g", name: "G", createdAt: "", startDate: "2026-09-01", frequency: { kind: "daily", days: [] }, members: [], progress: { a: {}, b: {} }, planDays: buildSchedule(Array.from({length: 12}, () => ({ title: "", segments: [{label: "Rdz 1–3", section: "Biblia"}] })), "2026-09-01", {kind: "daily", days: []}) };
}
it("excludes today's readings from backlog", () => {
  expect(getOverdueDays(fixture(), "a", "2026-09-03")).toHaveLength(2);
});
it("assigns only one chapter without mutating the shared plan", () => {
  const g = fixture(); const original = JSON.stringify(g);
  expect(getRecoveryReading(g, "a", "2026-09-04", {})?.label).toBe("Rdz 1");
  expect(JSON.stringify(g)).toBe(original);
});
it("advances partially read ranges and skips completed segments", () => {
  const g = fixture();
  expect(getRecoveryReading(g, "a", "2026-09-04", {"day-1-segment-1":1})?.label).toBe("Rdz 2");
  g.progress.a['day-1-segment-1'] = 'done';
  expect(getRecoveryReading(g, "a", "2026-09-04", {})?.segmentId).toBe("day-2-segment-1");
  expect(getRecoveryReading(g, "b", "2026-09-04", {})?.segmentId).toBe("day-1-segment-1");
});
it("handles chapter ranges and verse excerpts without inventing references", () => {
  expect(splitReadingChapters('1Kor 2-3')).toEqual(['1Kor 2','1Kor 3']);
  expect(splitReadingChapters('Mt 5,1–26')).toEqual(['Mt 5,1–26']);
});
it("has no extra reading before the plan starts", () => {
  expect(getRecoveryReading(fixture(), 'a', '2026-08-30', {})).toBeUndefined();
});
it("keeps the extra chapter after the base day instead of duplicating its readings", () => {
  const g = fixture();
  const reading = getRecoveryReading(g, 'a', '2026-09-10', {}, 'day-1');
  expect(reading?.segmentId).toBe('day-2-segment-1');
  expect(reading?.label).toBe('Rdz 1');
  expect(reading?.originalDate).toBe('2026-09-02');
  expect(getRecoveryReading(g, 'a', '2026-09-10', {'day-2-segment-1': 1}, 'day-1')?.label).toBe('Rdz 2');
});

it("starts recovery at the member's first unread day regardless of calendar date", () => {
  const g = fixture();
  g.progress.a["day-1-segment-1"] = "done";
  g.progress.a["day-2-segment-1"] = "done";
  expect(getRecoveryDay(g, "a")?.id).toBe("day-3");
  expect(getRecoveryDay(g, "b")?.id).toBe("day-1");
});
it("repairs a saved recovery day that would skip unread progress", () => {
  const g = fixture();
  g.progress.a["day-1-segment-1"] = "done";
  expect(getRecoveryDay(g, "a", "day-10")?.id).toBe("day-2");
  expect(getRecoveryDay(g, "a", "missing-day")?.id).toBe("day-2");
});
it("includes a partially completed day before a later saved day", () => {
  const g = fixture();
  g.planDays[0].segments.push({
    id: "day-1-segment-2", label: "Mt 1", section: "Nowy Testament",
  });
  g.progress.a["day-1-segment-1"] = "done";
  expect(getRecoveryDay(g, "a", "day-10")?.id).toBe("day-1");
});
it("keeps today's finished portion as the anchor for its extra chapter", () => {
  const g = fixture();
  g.progress.a["day-1-segment-1"] = "done";
  const base = getRecoveryDay(g, "a", "day-1");
  expect(base?.id).toBe("day-1");
  expect(getRecoveryReading(g, "a", "2026-09-10", {}, base?.id)?.segmentId)
    .toBe("day-2-segment-1");
  // On a new day there is no saved anchor, so continue at the actual progress.
  expect(getRecoveryDay(g, "a")?.id).toBe("day-2");
});
it("reflects refreshed progress and has no base reading after completion", () => {
  const g = fixture();
  expect(getRecoveryDay(g, "a")?.id).toBe("day-1");
  for (const day of g.planDays) {
    for (const segment of day.segments) g.progress.a[segment.id] = "done";
  }
  expect(getRecoveryDay(g, "a")).toBeUndefined();
});
