import type { Group, PlanDay } from "../types";
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
export function getRecoveryReading(group: Group, memberId: string, today: string, readChapters: Record<string, number>, afterDayId?: string, chapterMarks: ReadChapterMarks = {}): RecoveryReading | undefined {
  const progress = group.progress[memberId] ?? {};
  const afterIndex = afterDayId ? group.planDays.findIndex(day => day.id === afterDayId) : -1;
  for (const day of getOverdueDays(group, memberId, today).filter(day => group.planDays.indexOf(day) > afterIndex)) {
    for (const segment of day.segments) {
      if (progress[segment.id]) continue;
      const chapters = splitReadingChapters(segment.label);
      const chapterIndex = chapters.findIndex((_, index) => !isRecoveryChapterRead(readChapters, chapterMarks, segment.id, index));
      if (chapterIndex < 0) continue;
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

export type ReadChapterMarks = Record<string, number[]>;
export function parseChapterMarks(value: string | null): ReadChapterMarks {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, indices]) =>
      Array.isArray(indices) && indices.every(index => Number.isInteger(index) && index >= 0 && index <= 150),
    ));
  } catch { return {}; }
}
export function isRecoveryChapterRead(
  readChapters: Record<string, number>, marks: ReadChapterMarks, segmentId: string, index: number,
) {
  return index < (readChapters[segmentId] ?? 0) || Boolean(marks[segmentId]?.includes(index));
}
export function setRecoveryChapters(
  readChapters: Record<string, number>, marks: ReadChapterMarks, segmentId: string,
  indices: number[], completed: boolean,
) {
  const nextChapters = { ...readChapters };
  const actual = new Set([
    ...Array.from({ length: readChapters[segmentId] ?? 0 }, (_, index) => index),
    ...(marks[segmentId] ?? []),
  ]);
  for (const index of indices) {
    if (completed) actual.add(index);
    else actual.delete(index);
  }
  let prefix = 0;
  while (actual.has(prefix)) prefix++;
  nextChapters[segmentId] = prefix;
  const nextMarks = { ...marks, [segmentId]: [...actual].filter(index => index >= prefix).sort((a, b) => a - b) };
  return { chapters: nextChapters, marks: nextMarks };
}
export type RecoveryPortion = {
  day: PlanDay; extra?: RecoveryReading; chapterIndices: Record<string, number[]>;
};

// Forecast on copies: viewing tomorrow never marks today's readings as done.
export function projectRecoveryPortions(
  group: Group,
  memberId: string,
  today: string,
  readChapters: Record<string, number>,
  savedDayId: string,
  savedExtra?: RecoveryReading,
  chapterMarks: ReadChapterMarks = {},
): RecoveryPortion[] {
  const progress = { ...group.progress[memberId] };
  let chapters = { ...readChapters };
  let marks = { ...chapterMarks };
  const projectedGroup = { ...group, progress: { ...group.progress, [memberId]: progress } };
  const portions: RecoveryPortion[] = [];
  let base = getRecoveryDay(projectedGroup, memberId, savedDayId);
  let date = today;
  const allowed = group.frequency.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6]
    : group.frequency.kind === "weekdays" ? [1, 2, 3, 4, 5]
    : group.frequency.days.length ? group.frequency.days : [0, 1, 2, 3, 4, 5, 6];
  while (base) {
    const chapterIndices: Record<string, number[]> = {};
    const day: PlanDay = {
      ...base, date,
      segments: base.segments.map(segment => {
        const labels = splitReadingChapters(segment.label);
        const indices = labels.map((_, index) => index).filter(index =>
          !isRecoveryChapterRead(chapters, marks, segment.id, index),
        );
        chapterIndices[segment.id] = indices.length && !progress[segment.id] ? indices : labels.map((_, index) => index);
        const remaining = chapterIndices[segment.id].map(index => labels[index]);
        return {
          ...segment,
          label: !progress[segment.id] && remaining.length !== labels.length
            ? remaining.join(" · ") : segment.label,
        };
      }),
    };
    const extra = portions.length === 0 && savedExtra
      ? savedExtra
      : getRecoveryReading(projectedGroup, memberId, date, chapters, base.id, marks);
    portions.push({ day, extra, chapterIndices });
    for (const segment of base.segments) progress[segment.id] = "projected";
    if (extra) {
      const updated = setRecoveryChapters(chapters, marks, extra.segmentId, [extra.chapterIndex], true);
      chapters = updated.chapters; marks = updated.marks;
      if (chapters[extra.segmentId] >= extra.chapterCount) progress[extra.segmentId] = "projected";
    }
    base = getNextDay(projectedGroup, memberId);
    const cursor = new Date(`${date}T12:00:00`);
    do { cursor.setDate(cursor.getDate() + 1); } while (!allowed.includes(cursor.getDay()));
    date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
  }
  return portions;
}
