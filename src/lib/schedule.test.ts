import { describe, expect, it } from "vitest";
import { buildSchedule } from "./schedule";

describe("buildSchedule", () => {
  it("skips weekends for a weekday plan", () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      title: `Dzień ${index + 1}`,
      segments: [{ section: "Biblia", label: `Fragment ${index + 1}` }],
    }));

    const days = buildSchedule(rows, "2026-09-18", {
      kind: "weekdays",
      days: [1, 2, 3, 4, 5],
    });

    expect(days.map((day) => day.date)).toEqual([
      "2026-09-18",
      "2026-09-21",
      "2026-09-22",
    ]);
  });
});
