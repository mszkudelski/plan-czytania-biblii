import type { Group, PlanDay } from "../types";
import { BASIC_PLAN_CSV } from "./basic-plan";
import { parsePlanCsv } from "./csv";

const basic = parsePlanCsv(BASIC_PLAN_CSV);
const normalize = (label: string) => label.normalize("NFC").trim().replace(/\s+/g, " ");

// Classify the actual reading schedule, never an uploaded filename or a claim
// supplied by the client. Dates, headings and generated IDs do not affect it.
export function planTemplate(planDays: PlanDay[]): NonNullable<Group["planTemplate"]> {
  return planDays.length === basic.length && planDays.every((day, index) =>
    day.segments.length === basic[index].segments.length && day.segments.every((segment, lane) =>
      normalize(segment.label) === normalize(basic[index].segments[lane].label)))
    ? "mcheyne_365" : "custom_csv";
}
