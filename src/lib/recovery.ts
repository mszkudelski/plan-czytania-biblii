import type { Group, PlanDay } from "../types";

export type RecoveryDay = { date: string; days: PlanDay[] };

export function getOverdueDays(group: Group, memberId: string, today: string) {
  const progress = group.progress[memberId] ?? {};
  return group.planDays.filter(day => day.date < today && day.segments.some(segment => !progress[segment.id]));
}

// A personal overlay: original dates, segment IDs and group data stay intact.
export function buildRecoveryPlan(group: Group, memberId: string, started: string, today: string): RecoveryDay[] {
  const progress = group.progress[memberId] ?? {};
  const backlog = group.planDays.filter(day => day.date < started && day.segments.some(segment => !progress[segment.id]));
  const allowed = group.frequency.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6]
    : group.frequency.kind === "weekdays" ? [1, 2, 3, 4, 5] : group.frequency.days;
  if (!allowed.some(day => day >= 0 && day <= 6)) return [];
  const cursor = new Date(`${today}T12:00:00`);
  const result: RecoveryDay[] = [];
  let extra = 0;
  while (result.length < Math.max(7, backlog.length)) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (allowed.includes(cursor.getDay())) {
      const scheduled = group.planDays.filter(day => day.date >= started && day.date <= date && day.segments.some(segment => !progress[segment.id]) && !result.some(slot => slot.days.includes(day)));
      const overdue = backlog[extra++];
      const days = [...(overdue ? [overdue] : []), ...scheduled];
      if (days.length) result.push({ date, days });
      else if (extra >= backlog.length && !group.planDays.some(day => day.date > date && day.segments.some(segment => !progress[segment.id]))) break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
