import { expect, it } from "vitest";
import { buildRecoveryPlan, getOverdueDays } from "./recovery";
import { buildSchedule } from "./schedule";
import type { Group } from "../types";
function fixture(): Group {
  return { id: "g", name: "G", createdAt: "", startDate: "2026-09-01", frequency: { kind: "daily", days: [] }, members: [], progress: { a: {}, b: {} }, planDays: buildSchedule(Array.from({length: 12}, () => ({ title: "", segments: [{label: "Read", section: "Bible"}] })), "2026-09-01", {kind: "daily", days: []}) };
}
it("offers recovery only after more than two overdue reading days, excluding today", () => {
  const g = fixture();
  expect(getOverdueDays(g, "a", "2026-09-03")).toHaveLength(2);
  expect(getOverdueDays(g, "a", "2026-09-04")).toHaveLength(3);
});
it("adds one backlog day per reading day, preserving IDs and group data", () => {
  const g = fixture(); const original = JSON.stringify(g);
  const plan = buildRecoveryPlan(g, "a", "2026-09-04", "2026-09-04");
  expect(plan[0].days.map(d => d.id)).toEqual(["day-1", "day-4"]);
  expect(plan[1].days.map(d => d.id)).toEqual(["day-2", "day-5"]);
  expect(new Set(plan.flatMap(slot => slot.days.map(d => d.id))).size).toBe(plan.flatMap(slot => slot.days).length);
  expect(JSON.stringify(g)).toBe(original);
});
it("keeps partial days and excludes completed readings for only the chosen member", () => {
  const g = fixture(); g.progress.a = { "day-1-segment-1": "done" };
  expect(buildRecoveryPlan(g, "a", "2026-09-04", "2026-09-04")[0].days[0].id).toBe("day-2");
  expect(buildRecoveryPlan(g, "b", "2026-09-04", "2026-09-04")[0].days[0].id).toBe("day-1");
});
it("uses reading weekdays even after the original plan ends", () => {
  const g = fixture(); g.frequency = {kind: "weekdays", days: []};
  expect(buildRecoveryPlan(g, "a", "2026-09-19", "2026-09-19")[0].date).toBe("2026-09-21");
});
it("handles completed plans and invalid custom frequency", () => {
  const g = fixture(); g.frequency = {kind: "custom", days: []};
  expect(buildRecoveryPlan(g, "a", "2026-09-04", "2026-09-04")).toEqual([]);
});

it("shows the whole personal schedule beyond seven days without truncating the group", () => {
  const g = fixture();
  const plan = buildRecoveryPlan(g, "a", "2026-09-04", "2026-09-04");
  expect(plan.length).toBeGreaterThan(7);
  expect(plan.at(-1)?.date).toBe("2026-09-12");
  expect(plan.flatMap(slot => slot.days)).toHaveLength(12);
  expect(g.planDays).toHaveLength(12);
});
