import type { Group } from "../types";
import type { RecoveryPortion } from "./recovery";

export function formatFragmentCount(count: number) {
  const ending = count === 1 ? "fragment" : count % 10 >= 2 && count % 10 <= 4 &&
    !(count % 100 >= 12 && count % 100 <= 14) ? "fragmenty" : "fragmentów";
  return `${count} ${ending}`;
}

export function formatReadingCount(count: number) {
  const value = Math.abs(count);
  const ending = value === 1 ? "czytanie" : value % 10 >= 2 && value % 10 <= 4 &&
    !(value % 100 >= 12 && value % 100 <= 14) ? "czytania" : "czytań";
  return `${count < 0 ? "−" : count > 0 ? "+" : ""}${value} ${ending}`;
}

export function getReadingWeekSummary(group: Group, memberId: string, today: string) {
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const weekStart = iso(start);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekEnd = iso(end);
  const progress = group.progress[memberId] ?? {};
  const days = group.planDays.filter(day => day.segments.length > 0);
  const complete = (day: typeof days[number]) => day.segments.every(segment => progress[segment.id]);
  const weekly = days.filter(day => day.date >= weekStart && day.date < weekEnd);
  // Use the final fragment's completion date, in the same local timezone as
  // the calendar. Catching up counts as reading this week too; pre-read work
  // already assigned to this week remains complete without being counted twice.
  const completedOn = (day: typeof days[number]) => {
    const dates = day.segments.map(segment => new Date(progress[segment.id]));
    return dates.every(date => !Number.isNaN(date.getTime()))
      ? iso(new Date(Math.max(...dates.map(date => date.getTime())))) : "";
  };
  const completedThisWeek = (day: typeof days[number]) => {
    const date = completedOn(day);
    return complete(day) && date >= weekStart && date < weekEnd;
  };
  // Keep a weekly goal when the scheduled end has passed but work remains.
  const remainingAtWeekStart = days.filter(day => !complete(day) || completedOn(day) >= weekStart).length;
  const weeklyTotal = weekly.length || (today > (days.at(-1)?.date ?? today)
    ? Math.min(group.frequency.days.length, remainingAtWeekStart) : 0);
  // A less frequent plan has a weekly goal: unfinished work becomes debt
  // after the week closes. Future work never erases earlier missing readings.
  const cutoff = group.frequency.kind === "daily" ? today : weekStart;
  const aheadCutoff = group.frequency.kind === "daily" ? today : weekEnd;
  return {
    overdueReadings: days.filter(day => day.date < cutoff && !complete(day)).length,
    aheadReadings: days.filter(day => (group.frequency.kind === "daily" ? day.date > aheadCutoff : day.date >= aheadCutoff) && complete(day)).length,
    weeklyTotal,
    weeklyCompleted: Math.min(weeklyTotal, days.filter(day => complete(day) &&
      ((day.date >= weekStart && day.date < weekEnd) || completedThisWeek(day))).length),
  };
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

export function getDailyReadingDay(group: Group, memberId: string, _today: string, savedDayId = "") {
  const progress = group.progress[memberId] ?? {};
  const next = group.planDays.find(day => day.segments.some(segment => !progress[segment.id]));
  const saved = group.planDays.find(day => day.id === savedDayId);
  // Keep a finished daily portion on reload, but do not skip an earlier unread day.
  if (saved && (!next || group.planDays.indexOf(next) >= group.planDays.indexOf(saved))) return saved;
  return next ?? group.planDays.at(-1);
}

export function getRecoveryEstimate(portions: RecoveryPortion[]) {
  const lastExtra = portions.reduce((last, portion, index) => portion.extra ? index : last, -1);
  if (lastExtra < 0) return null;
  return { readingDays: lastExtra + 1, date: portions[lastExtra].day.date };
}
