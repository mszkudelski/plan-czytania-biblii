import { describe, expect, it } from "vitest";
import { parsePlanCsv } from "./csv";

import { BASIC_PLAN_CSV } from "./basic-plan";

describe("parsePlanCsv", () => {
  it("parses semicolon-separated Polish columns as separate fragments", () => {
    const rows = parsePlanCsv("Dzień;Stary Testament;Nowy Testament;Psalm\nPoczątek;Rdz 1–3;Mt 1;Ps 1");

    expect(rows).toHaveLength(1);
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

it("provides all 365 days of the basic plan with four readings and no fixed dates", () => {
  const rows = parsePlanCsv(BASIC_PLAN_CSV);
  expect(rows).toHaveLength(365);
  expect(rows.every(row => row.segments.length === 4 && !row.date)).toBe(true);
  expect(rows[0].segments.map(segment => segment.label)).toEqual(["Rdz 1", "Mt 1", "Ezd 1", "Dz 1"]);
  expect(rows.at(-1)?.segments.map(segment => segment.label)).toEqual(["2Krn 36", "Ap 22", "Ml 4", "Ps 150"]);
});
