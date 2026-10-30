import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import { createReadingStart, groupStartDay, initialRecoveryStart, personalGroup } from "./personal-schedule";
import { getMemberMetrics, getNextDay } from "./metrics";
import { getDailyReadingDay, getReadingHomeSummary, getReadingWeekSummary } from "./reading-home";
import { getOverdueDays, parseRecoverySchedule, projectRecoveryPortions } from "./recovery";
import { replaceGroupPlan, restoreGroupPlan } from "./plan-replacement";
const today = "2026-10-30";
function fixture(): Group {
  return { id: "g", name: "Plan", createdAt: today, startDate: "2026-10-28",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    members: [{ id: "m", name: "Nowa osoba", color: "green", isAdmin: false }, { id: "owner", name: "Admin", color: "blue", isAdmin: true }],
    progress: { m: {}, owner: {} }, planDays: ["2026-10-28", "2026-10-29", today, "2026-10-31"].map((date, index) => ({
      id: `d${index}`, index, date, title: "", segments: [{ id: `s${index}`, label: `Rdz ${index + 1}`, section: "Biblia" }],
    })),
  };
}
describe("personal late-join schedule", () => {
  it("starts at the beginning and automatically enables catch-up only when there is past work", () => {
    const group = fixture();
    expect(createReadingStart(group, "beginning", today)).toEqual({ skippedSegmentIds: [], autoRecoveryAt: today });
    expect(createReadingStart(group, "beginning", group.startDate)).toEqual({ skippedSegmentIds: [] });
    group.members[0].readingStart = createReadingStart(group, "beginning", today);
    expect(getNextDay(group, "m")?.id).toBe("d0");
    const portion = projectRecoveryPortions(group, "m", today, {}, "")[0];
    expect(portion.day.segments[0].id).toBe("s0"); expect(portion.extra?.segmentId).toBe("s1");
    expect(group.progress.m).toEqual({});
  });
  it("does not re-enable catch-up after it was disabled or completed on the device", () => {
    const member = fixture().members[0]; member.readingStart = { skippedSegmentIds: [], autoRecoveryAt: today };
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(initialRecoveryStart(storage, "recovery", member)).toBe(today);
    values.delete("recovery"); expect(initialRecoveryStart(storage, "recovery", member)).toBe("");
    expect(initialRecoveryStart(storage, "other-device", member)).toBe(today);
    member.readingStart = { skippedSegmentIds: ["s0"] };
    expect(initialRecoveryStart(storage, "group-start", member)).toBe("");
  });
  it("skips prior readings without progress or debt, preserves the group and counts percentage over the whole plan", () => {
    const group = fixture(); const original = structuredClone(group);
    group.members[0].readingStart = createReadingStart(group, "group", today);
    expect(group.members[0].readingStart).toEqual({ skippedSegmentIds: ["s0", "s1"] });
    expect(getNextDay(group, "m")?.id).toBe("d2");
    expect(getDailyReadingDay(group, "m", today, "d0")?.id).toBe("d2");
    expect(getMemberMetrics(group, "m", today)).toMatchObject({ progressPercent: 0, paceDays: 0, expectedSegments: 1 });
    expect(getReadingWeekSummary(group, "m", today)).toMatchObject({ overdueReadings: 0, weeklyTotal: 2, weeklyCompleted: 0 });
    expect(getOverdueDays(group, "m", today)).toEqual([]);
    expect(getReadingHomeSummary(group, "m", today)).toMatchObject({ overdueDays: 0, planComplete: false });
    expect(group.planDays).toEqual(original.planDays); expect(group.progress).toEqual(original.progress);
    expect(getNextDay(group, "owner")?.id).toBe("d0");
    group.progress.m.s2 = today; group.progress.m.s3 = today;
    expect(getMemberMetrics(group, "m", today).progressPercent).toBe(50);
    expect(getReadingHomeSummary(group, "m", today).planComplete).toBe(true);
    expect(getReadingHomeSummary(group, "owner", today).planComplete).toBe(false);
    group.members[0].readingStart = { skippedSegmentIds: [] };
    expect(getNextDay(group, "m")?.id).toBe("d0");
    expect(getMemberMetrics(group, "m", today)).toMatchObject({ progressPercent: 50, paceDays: -2 });
  });
  it("uses the next reading on rest days, rejects group start after the end and keeps future starts unchanged", () => {
    const group = fixture(); group.planDays = group.planDays.filter(day => day.date !== today);
    expect(groupStartDay(group, today)?.id).toBe("d3");
    group.members[0].readingStart = createReadingStart(group, "group", today);
    expect(getReadingHomeSummary(group, "m", today)).toMatchObject({ restDay: true, overdueDays: 0 });
    expect(getNextDay(group, "m")?.id).toBe("d3");
    expect(() => createReadingStart(group, "group", "2026-11-01")).toThrow(/zakończył/);
    expect(createReadingStart(group, "group", "2026-10-01")).toEqual({ skippedSegmentIds: [] });
  });
  it("future catch-up and cached forecasts never pull skipped fragments back in", () => {
    const group = fixture(); group.members[0].readingStart = createReadingStart(group, "group", today);
    const portions = projectRecoveryPortions(group, "m", "2026-11-03", {}, "");
    expect(portions.flatMap(portion => [...portion.day.segments.map(s => s.id), portion.extra?.segmentId].filter(Boolean)).sort()).toEqual(["s2", "s3"]);
    expect(parseRecoverySchedule(group, "m", "2026-11-03", {}, {}, JSON.stringify(portions))).toEqual(portions);
    expect(personalGroup(personalGroup(group, "m"), "m").planDays.map(d => d.id)).toEqual(["d2", "d3"]);
  });
  it("preserves skipped status across plan replacement and restore, including changed fragment IDs", () => {
    const group = fixture(); group.members[0].readingStart = createReadingStart(group, "group", today);
    const replaced = replaceGroupPlan(group, { planDays: group.planDays, startDate: group.startDate, frequency: group.frequency, expectedRevision: "" }, "r1");
    expect(replaced.members[0].readingStart?.skippedSegmentIds).toEqual(["s0", "s1"]);
    const restored = restoreGroupPlan(replaced, "r1", "r2");
    expect(personalGroup(restored, "m").planDays.map(day => day.segments[0].label)).toEqual(["Rdz 3", "Rdz 4"]);
  });
});
