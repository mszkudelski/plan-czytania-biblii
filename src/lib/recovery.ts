import type { Group } from "../types";
import { getNextDay } from "./metrics";

export function getRecoveryDay(
  group: Group,
  memberId: string,
  savedDayId = "",
) {
  const nextDay = getNextDay(group, memberId);
  const savedIndex = group.planDays.findIndex(day => day.id === savedDayId);
  if (savedIndex < 0) return nextDay;

  // Keep today's completed portion visible, but never skip an earlier unread day.
  const nextIndex = nextDay ? group.planDays.indexOf(nextDay) : -1;
  return nextIndex >= 0 && nextIndex < savedIndex
    ? nextDay
    : group.planDays[savedIndex];
}

export function getOverdueDays(group: Group, memberId: string, today: string) {
  const progress = group.progress[memberId] ?? {};
  return group.planDays.filter(day => day.date < today && day.segments.some(segment => !progress[segment.id]));
}

export function splitReadingChapters(label: string): string[] {
  const match = label.match(/^(.+?)\s+(\d+)(?:\s*[–-]\s*(\d+))?$/);
  if (!match) return [label];
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  if (end < start || end - start > 150) return [label];
  return Array.from({ length: end - start + 1 }, (_, index) => `${match[1]} ${start + index}`);
}

export type RecoveryReading = { segmentId: string; label: string; originalDate: string; chapterIndex: number; chapterCount: number };
export function getRecoveryReading(group: Group, memberId: string, today: string, readChapters: Record<string, number>, afterDayId?: string): RecoveryReading | undefined {
  const progress = group.progress[memberId] ?? {};
  const afterIndex = afterDayId ? group.planDays.findIndex(day => day.id === afterDayId) : -1;
  for (const day of getOverdueDays(group, memberId, today).filter(day => group.planDays.indexOf(day) > afterIndex)) {
    for (const segment of day.segments) {
      if (progress[segment.id]) continue;
      const chapters = splitReadingChapters(segment.label);
      const chapterIndex = readChapters[segment.id] ?? 0;
      if (chapterIndex >= chapters.length) continue;
      return { segmentId: segment.id, label: chapters[chapterIndex], originalDate: day.date, chapterIndex, chapterCount: chapters.length };
    }
  }
}
