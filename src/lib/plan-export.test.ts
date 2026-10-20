import { expect, it } from "vitest";
import type { PlanDay } from "../types";
import { exportPlanCsv } from "./plan-export";
import { parsePlanCsv, parseCsvTable } from "./csv";
import { BASIC_PLAN_CSV } from "./basic-plan";
import { buildSchedule } from "./schedule";

it("round-trips dates, titles and ordered individual readings, including verse ranges and CSV delimiters", () => {
  const days: PlanDay[] = [
    { id: "a", index: 0, date: "2026-10-20", title: 'Rodowód, "Jezusa"; początek', segments: [
      { id: "s1", label: "Mt 1,1–17", section: "NT" },
      { id: "s2", label: "Ps 1 | Ps 2", section: "Psalmy" },
    ] },
    { id: "b", index: 1, date: "2026-10-21", title: "Narodzenie\nJezusa", segments: [
      { id: "s3", label: "Mt 1,18–25", section: "NT" },
    ] },
  ];
  const csv = exportPlanCsv(days);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(parsePlanCsv(csv).map(row => ({ date: row.date, title: row.title, readings: row.segments.map(s => s.label) })))
    .toEqual(days.map(day => ({ date: day.date, title: day.title, readings: day.segments.map(s => s.label) })));
  expect(csv).not.toContain('"s1"');
});

it("exports every day and reading of the annual plan without fixed column-count assumptions", () => {
  const days = buildSchedule(parsePlanCsv(BASIC_PLAN_CSV), "2026-10-20", { kind: "daily", days: [] });
  const imported = parsePlanCsv(exportPlanCsv(days));
  expect(imported).toHaveLength(365);
  expect(imported.map(row => row.segments.map(s => s.label))).toEqual(days.map(day => day.segments.map(s => s.label)));
  expect(imported.map(row => row.date)).toEqual(days.map(day => day.date));
});

it("neutralizes spreadsheet formulas and supports an empty plan", () => {
  const csv = exportPlanCsv([{ id: "a", index: 0, date: "2026-10-20", title: '=HYPERLINK("url")',
    segments: [{ id: "s1", label: "+1+1", section: "" }] }]);
  expect(parseCsvTable(csv).rows[0].slice(1)).toEqual(['\'=HYPERLINK("url")', "'+1+1"]);
  expect(parsePlanCsv(exportPlanCsv([]))).toEqual([]);
});
