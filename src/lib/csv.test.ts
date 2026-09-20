import { describe, expect, it } from "vitest";
import { parsePlanCsv, SAMPLE_CSV } from "./csv";

describe("parsePlanCsv", () => {
  it("parses semicolon-separated Polish columns as separate fragments", () => {
    const rows = parsePlanCsv(SAMPLE_CSV);

    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({
      title: "Początek",
      date: undefined,
      segments: [
        { section: "Stary Testament", label: "Rdz 1–3" },
        { section: "Nowy Testament", label: "Mt 1" },
        { section: "Psalm", label: "Ps 1" },
      ],
    });
  });

  it("supports quoted commas and explicit ISO dates", () => {
    const rows = parsePlanCsv(
      'date,title,fragments\n2026-09-21,"Dzień, pierwszy","Rdz 1–2 | Mt 1"',
    );

    expect(rows[0].date).toBe("2026-09-21");
    expect(rows[0].title).toBe("Dzień, pierwszy");
    expect(rows[0].segments.map((segment) => segment.label)).toEqual([
      "Rdz 1–2",
      "Mt 1",
    ]);
  });
});
