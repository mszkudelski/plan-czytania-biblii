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

export type DailyRecoveryReading = { reading: RecoveryReading; completed: boolean };

export function parseReadChapters(value: string | null): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, count]) =>
      typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 151,
    ));
  } catch { return {}; }
}

export function validateDailyRecoveryReading(
  group: Group,
  memberId: string,
  today: string,
  readChapters: Record<string, number>,
  afterDayId: string,
  saved: unknown,
): DailyRecoveryReading | null {
  if (!saved || typeof saved !== "object") return null;
  const candidate = saved as Partial<DailyRecoveryReading>;
  const reading = candidate.reading;
  if (typeof candidate.completed !== "boolean" || !reading ||
      !Number.isInteger(reading.chapterIndex) || reading.chapterIndex < 0) return null;
  const afterIndex = group.planDays.findIndex(day => day.id === afterDayId);
  const progress = group.progress[memberId] ?? {};
  // A completed extra remains visible today, but a cached future extra cannot
  // skip any earlier unfinished segment after the corrected daily portion.
  for (const day of group.planDays.slice(afterIndex + 1)) {
    if (day.date >= today) continue;
    for (const segment of day.segments) {
      const chapters = splitReadingChapters(segment.label);
      if (segment.id === reading.segmentId) {
        if (reading.chapterCount !== chapters.length ||
            reading.label !== chapters[reading.chapterIndex] ||
            reading.originalDate !== day.date) return null;
        return { reading, completed: candidate.completed };
      }
      if (!progress[segment.id] && (readChapters[segment.id] ?? 0) < chapters.length) return null;
    }
  }
  return null;
}
