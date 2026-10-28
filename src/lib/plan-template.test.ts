import { expect, it } from "vitest";
import { BASIC_PLAN_CSV } from "./basic-plan";
import { parsePlanCsv } from "./csv";
import { buildSchedule } from "./schedule";
import { planTemplate } from "./plan-template";

it("recognizes the entire basic schedule independently of dates, names, headings and IDs", () => {
  const days = buildSchedule(parsePlanCsv(BASIC_PLAN_CSV), "2026-10-28", { kind: "daily", days: [0,1,2,3,4,5,6] });
  expect(planTemplate(days)).toBe("mcheyne_365");
  const renamed = days.map(day => ({ ...day, id: "private", title: "Private", date: "2027-01-01",
    segments: day.segments.map(segment => ({ ...segment, id: "other", section: "Private", label: `  ${segment.label} ` })) }));
  expect(planTemplate(renamed)).toBe("mcheyne_365");
  expect(planTemplate(days.slice(0, 10))).toBe("custom_csv");
  renamed[0].segments[0].label = "Different";
  expect(planTemplate(renamed)).toBe("custom_csv");
});
