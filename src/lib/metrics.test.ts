import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import {
  calculateProgressPercent,
  formatProgressPercent,
  getMemberMetrics,
  getReadingBalance,
  getPaceTone,
} from "./metrics";

describe("kolor tempa", () => {
  it.each([
    [4, "good"],
    [0, "good"],
    [-1, "warning"],
    [-7, "warning"],
    [-8, "danger"],
  ])("klasyfikuje %s dni jako %s", (pace, tone) => {
    expect(getPaceTone(pace)).toBe(tone);
  });
});

describe("postęp", () => {
  it("zaokrągla postęp do najbliższego pół procenta", () => {
    expect(calculateProgressPercent(1, 390)).toBe(0.5);
    expect(calculateProgressPercent(3, 390)).toBe(1);
  });

  it("pokazuje połówki procentów z polskim separatorem", () => {
    expect(formatProgressPercent(0.5)).toBe("0,5");
    expect(formatProgressPercent(1)).toBe("1");
  });
});

describe("tempo dni", () => {
  it("nie dolicza częściowo zaznaczonego dnia", () => {
    const group: Group = {
      id: "group-1",
      name: "Plan",
      createdAt: "2026-09-21T00:00:00.000Z",
      startDate: "2026-09-21",
      frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
      planDays: [
        {
          id: "day-1",
          index: 0,
          date: "2026-09-21",
          title: "Dzień 1",
          segments: [1, 2, 3].map((index) => ({
            id: `day-1-segment-${index}`,
            label: `Fragment ${index}`,
            section: "Biblia",
          })),
        },
        {
          id: "day-2",
          index: 1,
          date: "2026-09-22",
          title: "Dzień 2",
          segments: [1, 2, 3].map((index) => ({
            id: `day-2-segment-${index}`,
            label: `Fragment ${index}`,
            section: "Biblia",
          })),
        },
      ],
      members: [
        { id: "member-1", name: "Marek", color: "#000", isAdmin: true },
      ],
      progress: {
        "member-1": {
          "day-1-segment-1": "done",
          "day-1-segment-2": "done",
          "day-1-segment-3": "done",
          "day-2-segment-1": "done",
        },
      },
    };

    expect(getMemberMetrics(group, "member-1", "2026-09-21").paceDays).toBe(
      0,
    );

    group.progress["member-1"]["day-2-segment-2"] = "done";
    expect(getMemberMetrics(group, "member-1", "2026-09-21").paceDays).toBe(
      0,
    );

    group.progress["member-1"]["day-2-segment-3"] = "done";
    expect(getMemberMetrics(group, "member-1", "2026-09-21").paceDays).toBe(
      1,
    );
  });
});


describe("consistent reading and group balance", () => {
  function plan(kind: Group["frequency"]["kind"]): Group {
    return {
      id: "balance", name: "KNS", createdAt: "2026-10-09T00:00:00Z", startDate: "2026-10-09",
      frequency: { kind, days: [1, 3, 5] },
      members: [{ id: "member", name: "Reader", isAdmin: true, color: "green" }],
      planDays: ["2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"].map((date, index) => ({
        id: `d${index}`, index, date, title: "", segments: [0, 1].map(fragment => ({
          id: `s${index}-${fragment}`, label: "Rdz 1", section: "Biblia",
        })),
      })),
      progress: { member: { "s0-0": "done", "s0-1": "done", "s1-0": "done", "s1-1": "done" } },
    };
  }

  it.each(["daily", "weekdays", "custom"] as const)("counts Wednesday and Friday as two overdue readings on Sunday for %s", kind => {
    const group = plan(kind);
    expect(getReadingBalance(group, "member", "2026-10-18")).toEqual({ overdueReadings: 2, aheadReadings: 0 });
    expect(getMemberMetrics(group, "member", "2026-10-18").paceDays).toBe(-2);
    // Monday is due today, and becomes overdue on Tuesday.
    expect(getMemberMetrics(group, "member", "2026-10-19").paceDays).toBe(-2);
    expect(getMemberMetrics(group, "member", "2026-10-20").paceDays).toBe(-3);
  });

  it("does not let future completions cancel partially unfinished past readings", () => {
    const group = plan("custom");
    group.progress.member["s2-0"] = "done";
    group.progress.member["s4-0"] = "done";
    group.progress.member["s4-1"] = "done";
    group.progress.other = Object.fromEntries(group.planDays.flatMap(day => day.segments.map(s => [s.id, "done"])));
    group.planDays.push({ id: "empty", index: 5, date: "2026-10-01", title: "", segments: [] });
    expect(getReadingBalance(group, "member", "2026-10-18")).toEqual({ overdueReadings: 2, aheadReadings: 1 });
    expect(getMemberMetrics(group, "member", "2026-10-18").paceDays).toBe(-2);
    for (const day of group.planDays.filter(day => day.date < "2026-10-18")) {
      for (const segment of day.segments) group.progress.member[segment.id] = "done";
    }
    expect(getMemberMetrics(group, "member", "2026-10-18").paceDays).toBe(1);
    expect(getMemberMetrics(group, "member", "2026-10-19").paceDays).toBe(0);
    group.planDays = [];
    expect(getReadingBalance(group, "member", "2026-10-18")).toEqual({ overdueReadings: 0, aheadReadings: 0 });
    expect(getMemberMetrics(group, "member", "2026-10-18").paceDays).toBe(0);
  });
});
