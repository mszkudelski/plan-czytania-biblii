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

type Chapter = RecoveryReading & { section: string; lane: string; dayIndex: number };
function planChapters(group: Group): Chapter[] {
  return group.planDays.flatMap((day, dayIndex) => {
    const occurrences: Record<string, number> = {};
    return day.segments.flatMap(segment => {
      const occurrence = occurrences[segment.section] ?? 0;
      occurrences[segment.section] = occurrence + 1;
      // CSV column/section survives book transitions. Repeated generic columns
      // retain separate parallel streams by their occurrence within that section.
      const lane = JSON.stringify([segment.section, occurrence]);
      const labels = splitReadingChapters(segment.label);
      return labels.map((label, chapterIndex) => ({
        segmentId: segment.id, label, originalDate: day.date,
        chapterIndex, chapterCount: labels.length, section: segment.section, lane, dayIndex,
      }));
    });
  });
}
function readingReference(chapter: Chapter): RecoveryReading {
  return {
    segmentId: chapter.segmentId, label: chapter.label, originalDate: chapter.originalDate,
    chapterIndex: chapter.chapterIndex, chapterCount: chapter.chapterCount,
  };
}
function nextRecoveryDate(date: string, group: Group) {
  const allowed = group.frequency.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6]
    : group.frequency.kind === "weekdays" ? [1, 2, 3, 4, 5]
    : group.frequency.days.filter(day => day >= 0 && day <= 6);
  const cursor = new Date(`${date}T12:00:00`);
  do { cursor.setDate(cursor.getDate() + 1); } while (allowed.length && !allowed.includes(cursor.getDay()));
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
}
export function parseRecoveryPortion(
  group: Group, memberId: string, today: string,
  readChapters: Record<string, number>, marks: ReadChapterMarks, value: string | null,
): RecoveryPortion | undefined {
  try {
    const saved = JSON.parse(value ?? "null") as RecoveryPortion | null;
    if (!saved || saved.day?.date !== today || saved.day.id !== `recovery:${today}` ||
        !Array.isArray(saved.day.segments) || !saved.day.segments.length ||
        !saved.chapterIndices || typeof saved.chapterIndices !== "object") return;
    const chapters = planChapters(group);
    const assigned = new Set<string>();
    const chosen: Chapter[] = [];
    const ids = new Set<string>();
    for (const segment of saved.day.segments) {
      if (ids.has(segment.id)) return;
      ids.add(segment.id);
      const indices = saved.chapterIndices[segment.id];
      if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length) return;
      const selected = indices.map(index => chapters.find(c => c.segmentId === segment.id && c.chapterIndex === index));
      if (selected.some(c => !c)) return;
      const actual = selected as Chapter[];
      if (actual.some(c => c.originalDate > today) || segment.section !== actual[0].section ||
          segment.label !== (actual.length === actual[0].chapterCount
            ? group.planDays[actual[0].dayIndex].segments.find(s => s.id === segment.id)?.label
            : actual.map(c => c.label).join(" · "))) return;
      for (const chapter of actual) {
        assigned.add(`${chapter.segmentId}:${chapter.chapterIndex}`); chosen.push(chapter);
      }
    }
    if (saved.extra) {
      const extra = chapters.find(c => c.segmentId === saved.extra?.segmentId && c.chapterIndex === saved.extra.chapterIndex);
      if (!extra || extra.originalDate > today || Object.entries(readingReference(extra)).some(([key, value]) => saved.extra?.[key as keyof RecoveryReading] !== value) ||
          assigned.has(`${extra.segmentId}:${extra.chapterIndex}`)) return;
      chosen.push(extra);
    }
    // Cached portions may keep completed rows, but cannot bypass an earlier
    // unread chapter in any parallel stream.
    for (const chosenChapter of chosen) {
      if (chapters.some(c => c.lane === chosenChapter.lane &&
          (c.dayIndex < chosenChapter.dayIndex || c.segmentId === chosenChapter.segmentId && c.chapterIndex < chosenChapter.chapterIndex) &&
          !assigned.has(`${c.segmentId}:${c.chapterIndex}`) &&
          !group.progress[memberId]?.[c.segmentId] &&
          !isRecoveryChapterRead(readChapters, marks, c.segmentId, c.chapterIndex))) return;
    }
    return saved;
  } catch { return; }
}

// Forecast on copies: each date has a full normal quota in every parallel
// stream, then one extra from the stream with the largest remaining debt.
export function projectRecoveryPortions(
  group: Group,
  memberId: string,
  today: string,
  readChapters: Record<string, number>,
  savedDayId: string,
  savedExtra?: RecoveryReading,
  chapterMarks: ReadChapterMarks = {},
  savedPortion?: RecoveryPortion,
): RecoveryPortion[] {
  const chapters = planChapters(group);
  const lanes = [...new Set(chapters.map(chapter => chapter.lane))];
  const done = new Set(chapters.filter(chapter => group.progress[memberId]?.[chapter.segmentId] ||
    isRecoveryChapterRead(readChapters, chapterMarks, chapter.segmentId, chapter.chapterIndex))
    .map(chapter => `${chapter.segmentId}:${chapter.chapterIndex}`));
  const isDone = (chapter: Chapter) => done.has(`${chapter.segmentId}:${chapter.chapterIndex}`);
  const consume = (reading: RecoveryReading) => done.add(`${reading.segmentId}:${reading.chapterIndex}`);
  const portions: RecoveryPortion[] = [];
  const anchor = getRecoveryDay(group, memberId, savedDayId);
  let date = today;
  while (chapters.some(chapter => !isDone(chapter)) || portions.length === 0 && (savedPortion || anchor && savedDayId)) {
    let base: Chapter[] = [];
    if (portions.length === 0 && savedPortion) {
      base = savedPortion.day.segments.flatMap(segment =>
        savedPortion.chapterIndices[segment.id].map(index =>
          chapters.find(c => c.segmentId === segment.id && c.chapterIndex === index)!));
    } else if (portions.length === 0 && anchor && savedDayId &&
        anchor.segments.every(segment => group.progress[memberId]?.[segment.id])) {
      // Migrate a completed legacy daily anchor without advancing today's rows.
      base = chapters.filter(c => c.dayIndex === group.planDays.indexOf(anchor));
    } else {
      for (const lane of lanes) {
        const laneChapters = chapters.filter(c => c.lane === lane);
        const due = laneChapters.filter(c => c.originalDate <= date);
        const templateIndex = due.at(-1)?.dayIndex ?? laneChapters[0].dayIndex;
        const quota = laneChapters.filter(c => c.dayIndex === templateIndex).length;
        base.push(...laneChapters.filter(c => !isDone(c) && c.originalDate <= date).slice(0, quota));
      }
    }
    if (!base.length) {
      // A future schedule gap is not a reason to read its chapters early.
      const nextDue = chapters.find(chapter => !isDone(chapter));
      if (!nextDue) break;
      date = nextRecoveryDate(date, group);
      continue;
    }
    const chapterIndices: Record<string, number[]> = {};
    const segments: PlanDay["segments"] = [];
    for (const chapter of base) {
      if (!chapterIndices[chapter.segmentId]) {
        chapterIndices[chapter.segmentId] = [];
        segments.push({ id: chapter.segmentId, label: "", section: chapter.section });
      }
      chapterIndices[chapter.segmentId].push(chapter.chapterIndex);
      const segment = segments.find(s => s.id === chapter.segmentId)!;
      segment.label += (segment.label ? " · " : "") + chapter.label;
      consume(chapter);
    }
    for (const segment of segments) {
      const indices = chapterIndices[segment.id];
      const original = group.planDays.flatMap(day => day.segments).find(s => s.id === segment.id)!;
      if (indices.length === splitReadingChapters(original.label).length) segment.label = original.label;
    }
    let extra = portions.length === 0 ? savedPortion?.extra ?? savedExtra : undefined;
    if (!extra) {
      const debts = lanes.map(lane => chapters.filter(c => c.lane === lane && c.originalDate <= date && !isDone(c)));
      const largest = debts.reduce<Chapter[]>((previous, debt) => debt.length > previous.length ? debt : previous, []);
      if (largest[0]) extra = readingReference(largest[0]);
    }
    if (extra) consume(extra);
    portions.push({
      day: { id: `recovery:${date}`, index: portions.length, date, title: "", segments },
      extra, chapterIndices,
    });
    date = nextRecoveryDate(date, group);
  }
  return portions;
}
