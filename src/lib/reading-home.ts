import type { Group } from "../types";
import type { RecoveryPortion } from "./recovery";

export function formatFragmentCount(count: number) {
  const ending = count === 1 ? "fragment" : count % 10 >= 2 && count % 10 <= 4 &&
    !(count % 100 >= 12 && count % 100 <= 14) ? "fragmenty" : "fragmentów";
  return `${count} ${ending}`;
}

export function getReadingHomeSummary(group: Group, memberId: string, today: string) {
  const progress = group.progress[memberId] ?? {};
  const allSegments = group.planDays.flatMap(day => day.segments);
  const past = group.planDays.filter(day => day.date < today);
  const scheduledToday = group.planDays.filter(day => day.date === today).flatMap(day => day.segments);
  const notStarted = today < group.startDate;
  const planComplete = allSegments.length > 0 && allSegments.every(segment => progress[segment.id]);

  return {
    notStarted,
    planComplete,
    restDay: !notStarted && !planComplete && scheduledToday.length === 0,
    overdueDays: past.filter(day => day.segments.some(segment => !progress[segment.id])).length,
    overdueSegments: past.flatMap(day => day.segments).filter(segment => !progress[segment.id]).length,
    todaySegments: scheduledToday.length,
    todayCompletedSegments: scheduledToday.filter(segment => progress[segment.id]).length,
    aheadSegments: group.planDays.filter(day => day.date > today)
      .flatMap(day => day.segments).filter(segment => progress[segment.id]).length,
  };
}

export function getDailyReadingDay(group: Group, memberId: string, today: string, savedDayId = "") {
  const progress = group.progress[memberId] ?? {};
  const next = group.planDays.find(day => day.segments.some(segment => !progress[segment.id]));
  const saved = group.planDays.find(day => day.id === savedDayId);
  // Keep a finished daily portion on reload, but do not skip an earlier unread day.
  if (saved && (!next || group.planDays.indexOf(next) >= group.planDays.indexOf(saved))) return saved;
  if (next && next.date > today) {
    const scheduledToday = group.planDays.find(day => day.date === today && day.segments.length > 0);
    if (scheduledToday) return scheduledToday;
  }
  return next ?? group.planDays.at(-1);
}

export function getRecoveryEstimate(portions: RecoveryPortion[]) {
  const lastExtra = portions.reduce((last, portion, index) => portion.extra ? index : last, -1);
  if (lastExtra < 0) return null;
  return { readingDays: lastExtra + 1, date: portions[lastExtra].day.date };
}
