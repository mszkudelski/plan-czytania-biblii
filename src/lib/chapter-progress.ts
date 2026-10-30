import type { Group } from "../types";
import { splitReadingChapters } from "./recovery";

// Apply an intent to individual chapters, never replace a device's whole snapshot.
export function applyChapterProgress<T extends Group>(group: T, memberId: string,
  segmentId: string, completed: boolean, indices?: number[], timestamp = new Date().toISOString()): T {
  const segment = group.planDays.flatMap(day => day.segments).find(segment => segment.id === segmentId);
  if (!segment) return group;
  const all = splitReadingChapters(segment.label).map((_, index) => index);
  const existing = group.chapterProgress?.[memberId]?.[segmentId]
    ?? (group.progress[memberId]?.[segmentId] ? all : []);
  const marks = new Set(indices ? existing : []);
  for (const index of indices ?? all) {
    if (completed) marks.add(index); else marks.delete(index);
  }
  const next = [...marks].filter(index => all.includes(index)).sort((a, b) => a - b);
  const progress = { ...group.progress[memberId] };
  if (next.length === all.length) progress[segmentId] = timestamp;
  else delete progress[segmentId];
  return { ...group, progress: { ...group.progress, [memberId]: progress },
    chapterProgress: { ...group.chapterProgress, [memberId]: {
      ...group.chapterProgress?.[memberId], [segmentId]: next,
    } } };
}
