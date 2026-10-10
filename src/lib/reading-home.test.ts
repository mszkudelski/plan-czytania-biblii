import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import { formatFragmentCount, getDailyReadingDay, getReadingHomeSummary, getRecoveryEstimate, getReadingWeekSummary, formatReadingCount } from "./reading-home";
import { projectRecoveryPortions } from "./recovery";

const TODAY = "2026-10-10";
function group(): Group {
  return {
    id: "group", name: "Czytamy razem", createdAt: "2026-10-09T00:00:00Z", startDate: "2026-10-09",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    members: [{ id: "member", name: "Jan", isAdmin: true, color: "green" }],
    planDays: ["2026-10-09", TODAY, "2026-10-11"].map((date, index) => ({
      id: "d" + index, index, title: "Dzień " + (index + 1), date,
      segments: [0, 1].map(segment => ({ id: `s${index}-${segment}`, label: `Rdz ${index * 2 + segment + 1}`, section: "Biblia" })),
    })),
    progress: { member: {} },
  };
}

describe("czytanie na stronie głównej", () => {
  it.each([[1, "1 fragment"], [2, "2 fragmenty"], [5, "5 fragmentów"], [12, "12 fragmentów"], [22, "22 fragmenty"]] as const)(
    "formats a count of %s as %s", (count, expected) => expect(formatFragmentCount(count)).toBe(expected),
  );
  it("does not let reading ahead cancel yesterday's unfinished fragments", () => {
    const plan = group();
    plan.progress.member = { "s0-0": "done", "s2-0": "done", "s2-1": "done" };
    expect(getReadingHomeSummary(plan, "member", TODAY)).toMatchObject({
      overdueDays: 1, overdueSegments: 1, todaySegments: 2,
      todayCompletedSegments: 0, aheadSegments: 2, planComplete: false,
    });
  });

  it("keeps today's completed work separate from earlier debt and other members", () => {
    const plan = group();
    plan.progress.member = { "s1-0": "done", "s1-1": "done", unknown: "done" };
    plan.progress.other = Object.fromEntries(plan.planDays.flatMap(day => day.segments).map(s => [s.id, "done"]));
    expect(getReadingHomeSummary(plan, "member", TODAY)).toMatchObject({ overdueDays: 1, overdueSegments: 2, todayCompletedSegments: 2, aheadSegments: 0 });
  });

  it("distinguishes a future start, a rest day and a completed plan", () => {
    const plan = group();
    plan.startDate = "2026-10-12";
    expect(getReadingHomeSummary(plan, "member", TODAY)).toMatchObject({ notStarted: true, restDay: false, planComplete: false });
    plan.startDate = "2026-10-09";
    plan.planDays = plan.planDays.filter(day => day.date !== TODAY);
    expect(getReadingHomeSummary(plan, "member", TODAY)).toMatchObject({ notStarted: false, restDay: true, planComplete: false });
    plan.progress.member = Object.fromEntries(plan.planDays.flatMap(day => day.segments).map(s => [s.id, "done"]));
    expect(getReadingHomeSummary(plan, "member", TODAY)).toMatchObject({ planComplete: true, restDay: false });
  });

  it("does not declare an empty plan completed", () => {
    const plan = group();
    plan.planDays = [];
    expect(getReadingHomeSummary(plan, "member", TODAY).planComplete).toBe(false);
    expect(getDailyReadingDay(plan, "member", TODAY)).toBeUndefined();
  });

  it("keeps a completed daily portion until a new day instead of jumping on reload", () => {
    const plan = group();
    expect(getDailyReadingDay(plan, "member", TODAY)?.id).toBe("d0");
    plan.progress.member = { "s0-0": "done", "s0-1": "done" };
    expect(getDailyReadingDay(plan, "member", TODAY, "d0")?.id).toBe("d0");
    expect(getDailyReadingDay(plan, "member", "2026-10-11")?.id).toBe("d1");
  });

  it("rejects an invalid anchor and an anchor that skips earlier unread work", () => {
    const plan = group();
    expect(getDailyReadingDay(plan, "member", TODAY, "missing")?.id).toBe("d0");
    expect(getDailyReadingDay(plan, "member", TODAY, "d2")?.id).toBe("d0");
  });

  it("continues with the first unread reading when today is complete", () => {
    const plan = group();
    plan.progress.member = { "s0-0": "done", "s0-1": "done", "s1-0": "done", "s1-1": "done" };
    expect(getDailyReadingDay(plan, "member", TODAY)?.id).toBe("d2");
  });

  it("derives a catch-up estimate from the final projected extra without changing progress", () => {
    const plan = group();
    const snapshot = JSON.stringify(plan);
    const portions = projectRecoveryPortions(plan, "member", TODAY, {}, "d0");
    const estimate = getRecoveryEstimate(portions);
    expect(estimate).not.toBeNull();
    expect(portions[estimate!.readingDays - 1].day.date).toBe(estimate!.date);
    expect(portions.slice(estimate!.readingDays).every(portion => !portion.extra)).toBe(true);
    expect(JSON.stringify(plan)).toBe(snapshot);
    expect(getRecoveryEstimate([])).toBeNull();
  });
});

describe("status czytań i tygodnia", () => {
  it.each([[1, "+1 czytanie"], [-2, "−2 czytania"], [5, "+5 czytań"], [12, "+12 czytań"], [-22, "−22 czytania"]] as const)(
    "formats a signed count of %s", (count, expected) => expect(formatReadingCount(count)).toBe(expected),
  );
  it("counts whole readings and does not let future reading hide incomplete debt", () => {
    const plan = group();
    plan.progress.member = { "s0-0": "done", "s2-0": "done", "s2-1": "done" };
    expect(getReadingWeekSummary(plan, "member", TODAY)).toEqual({
      overdueReadings: 1, aheadReadings: 1, weeklyTotal: 3, weeklyCompleted: 1,
    });
    plan.progress.member["s0-1"] = "done";
    expect(getReadingWeekSummary(plan, "member", TODAY).overdueReadings).toBe(0);
  });
  it("a three-reading week has no debt until Monday and only later weeks count as ahead", () => {
    const plan = group();
    plan.frequency = { kind: "custom", days: [1, 3, 5] };
    plan.planDays = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"].map((date, i) => ({
      id: `d${i}`, index: i, title: "", date,
      segments: [{ id: `s${i}`, label: `Rdz ${i + 1}`, section: "Biblia" }],
    }));
    expect(getReadingWeekSummary(plan, "member", TODAY)).toEqual({
      overdueReadings: 0, aheadReadings: 0, weeklyTotal: 3, weeklyCompleted: 0,
    });
    plan.progress.member = { s0: "done", s1: "done", s2: "done", s3: "done" };
    expect(getReadingWeekSummary(plan, "member", TODAY)).toEqual({
      overdueReadings: 0, aheadReadings: 1, weeklyTotal: 3, weeklyCompleted: 3,
    });
    delete plan.progress.member.s1;
    expect(getReadingWeekSummary(plan, "member", "2026-10-12")).toEqual({
      overdueReadings: 1, aheadReadings: 0, weeklyTotal: 1, weeklyCompleted: 1,
    });
  });
  it("handles Sunday, a year boundary, empty readings and other members", () => {
    const plan = group();
    plan.frequency = { kind: "weekdays", days: [1, 2, 3, 4, 5] };
    plan.planDays[0].date = "2025-12-28";
    plan.planDays[1].date = "2025-12-29";
    plan.planDays[2].date = "2026-01-05";
    plan.planDays.push({ id: "empty", index: 3, date: "2025-12-20", title: "", segments: [] });
    plan.progress.other = Object.fromEntries(plan.planDays.flatMap(day => day.segments).map(s => [s.id, "done"]));
    expect(getReadingWeekSummary(plan, "member", "2026-01-04")).toEqual({
      overdueReadings: 1, aheadReadings: 0, weeklyTotal: 1, weeklyCompleted: 0,
    });
    expect(getReadingWeekSummary(plan, "member", "2026-01-05")).toEqual({
      overdueReadings: 2, aheadReadings: 0, weeklyTotal: 1, weeklyCompleted: 0,
    });
    plan.planDays = [];
    expect(getReadingWeekSummary(plan, "member", TODAY)).toEqual({
      overdueReadings: 0, aheadReadings: 0, weeklyTotal: 0, weeklyCompleted: 0,
    });
  });
});
