import { expect, it } from "vitest";
import { getRecoveryDay, getOverdueDays, getRecoveryReading, splitReadingChapters, parseReadChapters, validateDailyRecoveryReading, projectRecoveryPortions, setRecoveryChapters, parseChapterMarks, parseRecoveryPortion } from "./recovery";
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

it("ignores null, array and invalid chapter-cache values", () => {
  expect(parseReadChapters("null")).toEqual({});
  expect(parseReadChapters("[]")).toEqual({});
  expect(parseReadChapters("{broken")).toEqual({});
  expect(parseReadChapters('{"valid":1,"negative":-1,"fraction":0.5,"text":"2"}')).toEqual({ valid: 1 });
});
it("rejects a cached extra that skips earlier incomplete segments", () => {
  const g = fixture();
  const reading = { segmentId: "day-10-segment-1", label: "Rdz 1", originalDate: "2026-09-10", chapterIndex: 0, chapterCount: 3 };
  expect(validateDailyRecoveryReading(g, "a", "2026-09-12", {}, "day-1", { reading, completed: false })).toBeNull();
});
it("keeps the same completed extra visible after its backend segment is saved", () => {
  const g = fixture();
  g.progress.a["day-1-segment-1"] = "done";
  g.progress.a["day-2-segment-1"] = "done";
  const reading = { segmentId: "day-2-segment-1", label: "Rdz 3", originalDate: "2026-09-02", chapterIndex: 2, chapterCount: 3 };
  expect(validateDailyRecoveryReading(g, "a", "2026-09-12", {}, "day-1", { reading, completed: true }))
    .toEqual({ reading, completed: true });
});
it("rejects malformed saved readings and those inside the current base day", () => {
  const g = fixture();
  for (const saved of [null, {}, { reading: null, completed: true }, { reading: {}, completed: true }]) {
    expect(validateDailyRecoveryReading(g, "a", "2026-09-12", {}, "day-1", saved)).toBeNull();
  }
  const reading = { segmentId: "day-1-segment-1", label: "Rdz 1", originalDate: "2026-09-01", chapterIndex: 0, chapterCount: 3 };
  expect(validateDailyRecoveryReading(g, "a", "2026-09-12", {}, "day-1", { reading, completed: false })).toBeNull();
});

it("forecasts one extra per day and trims previous extra chapters without persisting progress", () => {
  const g = fixture();
  const original = JSON.stringify(g);
  const chapters = { "day-2-segment-1": 1 };
  const portions = projectRecoveryPortions(g, "a", "2026-09-10", chapters, "day-1");
  expect(portions.slice(0, 3).map(p => [p.day.date, p.day.segments[0].label, p.extra?.label])).toEqual([
    ["2026-09-10", "Rdz 1–3", "Rdz 2"],
    ["2026-09-11", "Rdz 3", "Rdz 3"],
    ["2026-09-12", "Rdz 1–3", "Rdz 1"],
  ]);
  expect(JSON.stringify(g)).toBe(original);
  expect(chapters).toEqual({ "day-2-segment-1": 1 });
  expect(projectRecoveryPortions(g, "b", "2026-09-10", {}, "day-1")[1].day.segments[0].label)
    .toBe("Rdz 2 · Rdz 3");
});
it("skips entire days consumed by extras and keeps today's already completed extra", () => {
  const g = fixture();
  g.planDays = g.planDays.slice(0, 5).map((day, i) => ({
    ...day, segments: [{ ...day.segments[0], label: `Rdz ${i + 1}` }],
  }));
  const extra = getRecoveryReading(g, "a", "2026-09-10", {}, "day-1")!;
  g.progress.a["day-1-segment-1"] = "done";
  g.progress.a["day-2-segment-1"] = "done";
  const portions = projectRecoveryPortions(g, "a", "2026-09-10", { "day-2-segment-1": 1 }, "day-1", extra);
  expect(portions.map(p => [p.day.segments[0].id, p.extra?.label])).toEqual([
    ["day-1-segment-1", "Rdz 2"], ["day-3-segment-1", "Rdz 4"], ["day-5-segment-1", undefined],
  ]);
  expect(projectRecoveryPortions(g, "a", "2026-09-10", {}, "missing")[0].day.segments[0].id).toBe("day-3-segment-1");
});
it("respects reading weekdays and stops adding extras when caught up", () => {
  const g = fixture();
  g.frequency = { kind: "weekdays", days: [] };
  const portions = projectRecoveryPortions(g, "a", "2026-09-11", {}, "day-1");
  expect(portions[1].day.date).toBe("2026-09-14");
  g.frequency = { kind: "custom", days: [1, 4] };
  expect(projectRecoveryPortions(g, "a", "2026-09-11", {}, "day-1")[1].day.date).toBe("2026-09-14");
  expect(projectRecoveryPortions(g, "a", "2026-08-30", {}, "day-1")[0].extra).toBeUndefined();
  for (const day of g.planDays) for (const segment of day.segments) g.progress.a[segment.id] = "done";
  expect(projectRecoveryPortions(g, "a", "2026-09-11", {}, "")).toEqual([]);
});

it("records future chapter slices without treating an assumed earlier chapter as read", () => {
  const first = setRecoveryChapters({}, {}, "s", [1, 2], true);
  expect(first).toEqual({ chapters: { s: 0 }, marks: { s: [1, 2] } });
  const g = fixture();
  expect(getRecoveryReading(g, "a", "2026-09-10", {}, undefined, { "day-1-segment-1": [1, 2] })?.label)
    .toBe("Rdz 1");
  const finished = setRecoveryChapters(first.chapters, first.marks, "s", [0], true);
  expect(finished.chapters.s).toBe(3);
  const undone = setRecoveryChapters(finished.chapters, finished.marks, "s", [1, 2], false);
  expect(undone.chapters.s).toBe(1);
  expect(first.marks.s).toEqual([1, 2]);
  expect(parseChapterMarks('{"s":[1,2],"bad":[-1]}')).toEqual({ s: [1, 2] });
  expect(parseChapterMarks("null")).toEqual({});
});

function parallelFixture(count = 80): Group {
  return {
    ...fixture(), startDate: "2026-09-01",
    planDays: buildSchedule(Array.from({ length: count }, (_, i) => ({
      title: "", segments: ["Rdz", "Mt", "Ps"].map((book, lane) => ({
        label: `${book} ${i + 1}`, section: `Czytanie ${lane + 1}`,
      })),
    })), "2026-09-01", { kind: "daily", days: [] }),
  };
}
it("clears ten days of three parallel chapters with thirty extras then resumes the normal plan", () => {
  const g = parallelFixture();
  const unchanged = JSON.stringify(g);
  const portions = projectRecoveryPortions(g, "a", "2026-09-11", {}, "");
  expect(portions.slice(0, 30).every(p => p.extra)).toBe(true);
  expect(portions.slice(0, 30).every(p => p.day.segments.length === 3)).toBe(true);
  expect(portions.slice(0, 3).map(p => p.extra?.label)).toEqual(["Rdz 2", "Mt 3", "Ps 4"]);
  expect(portions[30].day.date).toBe("2026-10-11");
  expect(portions[30].day.segments.map(s => s.label)).toEqual(["Rdz 41", "Mt 41", "Ps 41"]);
  expect(portions.slice(30).every(p => !p.extra)).toBe(true);
  expect(JSON.stringify(g)).toBe(unchanged);
});
it("keeps the daily quota when an earlier extra consumes part of a chapter range", () => {
  const g = fixture();
  const portions = projectRecoveryPortions(g, "a", "2026-09-10", {}, "");
  for (const portion of portions.slice(0, 4)) {
    expect(Object.values(portion.chapterIndices).flat()).toHaveLength(3);
  }
  expect(portions[1].day.segments.map(s => s.label)).toEqual(["Rdz 2 · Rdz 3", "Rdz 1"]);
});
it("balances uneven debt and keeps streams stable across book transitions and generic sections", () => {
  const g = parallelFixture(12);
  for (const day of g.planDays.slice(0, 5)) g.progress.a[day.segments[0].id] = "done";
  g.planDays[4].segments[1].label = "Mk 1";
  const portions = projectRecoveryPortions(g, "a", "2026-09-11", {}, "");
  expect(portions[0].extra?.label).toBe("Mt 2");
  expect(portions[1].extra?.label).toBe("Ps 3");
  for (const day of g.planDays) for (const segment of day.segments) segment.section = "Fragment";
  const generic = projectRecoveryPortions(g, "a", "2026-09-11", {}, "");
  expect(generic[0].extra?.label).toBe("Mt 2");
  expect(generic[0].day.segments).toHaveLength(3);
});
it("preserves a saved composite portion but rejects corrupt and skipped chapter assignments", () => {
  const g = parallelFixture();
  const portion = projectRecoveryPortions(g, "a", "2026-09-11", {}, "")[0];
  expect(parseRecoveryPortion(g, "a", "2026-09-11", {}, {}, JSON.stringify(portion))).toEqual(portion);
  for (const segment of portion.day.segments) g.progress.a[segment.id] = "done";
  expect(projectRecoveryPortions(g, "a", "2026-09-11", {}, "", undefined, {}, portion)[0]).toEqual(portion);
  expect(parseRecoveryPortion(g, "a", "2026-09-12", {}, {}, JSON.stringify(portion))).toBeUndefined();
  expect(parseRecoveryPortion(g, "a", "2026-09-11", {}, {}, "null")).toBeUndefined();
  const future = projectRecoveryPortions(parallelFixture(), "a", "2026-09-11", {}, "")[5];
  future.day.date = "2026-09-11"; future.day.id = "recovery:2026-09-11";
  expect(parseRecoveryPortion(parallelFixture(), "a", "2026-09-11", {}, {}, JSON.stringify(future))).toBeUndefined();
});
