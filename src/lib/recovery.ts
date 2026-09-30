import type { Group } from "../types";

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
export function getRecoveryReading(group: Group, memberId: string, today: string, readChapters: Record<string, number>): RecoveryReading | undefined {
  const progress = group.progress[memberId] ?? {};
  for (const day of getOverdueDays(group, memberId, today)) {
    for (const segment of day.segments) {
      if (progress[segment.id]) continue;
      const chapters = splitReadingChapters(segment.label);
      const chapterIndex = readChapters[segment.id] ?? 0;
      if (chapterIndex >= chapters.length) continue;
      return { segmentId: segment.id, label: chapters[chapterIndex], originalDate: day.date, chapterIndex, chapterCount: chapters.length };
    }
  }
}
