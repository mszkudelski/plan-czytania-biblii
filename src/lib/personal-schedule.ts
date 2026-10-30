import type { Group, Member } from "../types";
import { todayIso } from "./schedule";

export type ReadingStartChoice = "beginning" | "group";

export function groupStartDay(group: Group, today = todayIso()) {
  return group.planDays.find(day => day.date >= today && day.segments.length > 0);
}

// Store exact fragment IDs, so the personal choice never rewrites the group calendar.
export function createReadingStart(group: Group, choice: ReadingStartChoice, today = todayIso()): Member["readingStart"] {
  const past = group.planDays.filter(day => day.date < today);
  if (choice === "group") {
    if (!groupStartDay(group, today)) throw new Error("Harmonogram grupy już się zakończył. Wybierz start od początku.");
    return { skippedSegmentIds: past.flatMap(day => day.segments.map(segment => segment.id)) };
  }
  return { skippedSegmentIds: [], ...(past.some(day => day.segments.length > 0) ? { autoRecoveryAt: today } : {}) };
}

export function skippedSegmentIds(group: Group, memberId: string) {
  return new Set(group.members.find(member => member.id === memberId)?.readingStart?.skippedSegmentIds ?? []);
}

export function personalGroup(group: Group, memberId: string): Group {
  const skipped = skippedSegmentIds(group, memberId);
  if (!group.planDays.some(day => day.segments.some(segment => skipped.has(segment.id)))) return group;
  return { ...group, planDays: group.planDays.map(day => {
    const segments = day.segments.filter(segment => !skipped.has(segment.id));
    return segments.length === day.segments.length ? day : { ...day, segments };
  }).filter(day => day.segments.length > 0) };
}

export function initialRecoveryStart(storage: Pick<Storage, "getItem" | "setItem">, key: string, member: Member, initializedKey = `${key}:auto-initialized`) {
  const saved = storage.getItem(key);
  if (!member.readingStart?.autoRecoveryAt || storage.getItem(initializedKey)) return saved ?? "";
  storage.setItem(initializedKey, "1");
  const start = saved ?? member.readingStart?.autoRecoveryAt ?? "";
  if (start) storage.setItem(key, start);
  return start;
}
