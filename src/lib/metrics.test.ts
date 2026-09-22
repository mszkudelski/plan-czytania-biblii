import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import {
  calculateProgressPercent,
  formatProgressPercent,
  getMemberMetrics,
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
