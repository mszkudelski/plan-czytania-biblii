import type { Group, MemberMetrics, PlanDay } from "../types";
import { todayIso } from "./schedule";

export type PaceTone = "good" | "warning" | "danger";

export function getPaceTone(paceDays: number): PaceTone {
  if (paceDays >= 0) return "good";
  if (paceDays >= -7) return "warning";
  return "danger";
}

export function calculateProgressPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 200) / 2;
}

export function formatProgressPercent(percent: number) {
  return Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(1).replace(".", ",");
}

export function getMemberMetrics(
  group: Group,
  memberId: string,
  today = todayIso(),
): MemberMetrics {
  const completed = group.progress[memberId] ?? {};
  const allSegments = group.planDays.flatMap((day) => day.segments);
  const expectedDays = group.planDays.filter((day) => day.date <= today);
  const expectedSegments = expectedDays.flatMap((day) => day.segments).length;
  const completedSegments = allSegments.filter((segment) => completed[segment.id]).length;
  const completedExpectedSegments = expectedDays
    .flatMap((day) => day.segments)
    .filter((segment) => completed[segment.id]).length;
  const averageSegments =
    group.planDays.length > 0 ? allSegments.length / group.planDays.length : 1;
  const paceDays = Math.round(
    (completedExpectedSegments +
      allSegments.filter(
        (segment) =>
          completed[segment.id] &&
          !expectedDays.some((day) =>
            day.segments.some((expected) => expected.id === segment.id),
          ),
      ).length -
      expectedSegments) /
      averageSegments,
  );

  const completedDays = group.planDays.filter(
    (day) =>
      day.segments.length > 0 &&
      day.segments.every((segment) => completed[segment.id]),
  ).length;

  return {
    completedSegments,
    totalSegments: allSegments.length,
    expectedSegments,
    progressPercent: calculateProgressPercent(
      completedSegments,
      allSegments.length,
    ),
    paceDays,
    completedDays,
    streak: calculateStreak(group.planDays, completed, today),
  };
}

function calculateStreak(
  days: PlanDay[],
  completed: Record<string, string>,
  today: string,
) {
  const pastDays = days
    .filter((day) => day.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;

  for (const day of pastDays) {
    if (
      day.segments.length > 0 &&
      day.segments.every((segment) => completed[segment.id])
    ) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function getNextDay(group: Group, memberId: string) {
  const completed = group.progress[memberId] ?? {};
  return group.planDays.find((day) =>
    day.segments.some((segment) => !completed[segment.id]),
  );
}
