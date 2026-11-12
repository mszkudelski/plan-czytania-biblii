import type { Group, PlanDay, PlanSegment, PersonalTempo } from "../types";
import { readingChapters } from "./reading-parts";

export function validTempoDays(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 7 &&
    new Set(value).size === value.length && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function monday(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return shiftDate(date, -(value.getUTCDay() + 6) % 7);
}
export function tempoFor(group: Group, memberId: string): PersonalTempo | undefined {
  const tempo = group.members.find(member => member.id === memberId)?.personalTempo;
  return tempo?.planRevision === (group.planRevision ?? "") ? tempo : undefined;
}
export function tempoEffectiveFrom(group: Group, memberId: string, today: string) {
  const member = group.members.find(member => member.id === memberId);
  const started = Object.keys(group.progress[memberId] ?? {}).length > 0 ||
    Object.values(group.chapterProgress?.[memberId] ?? {}).some(indices => indices.length > 0);
  const first = group.planDays[0]?.date ?? group.startDate;
  // A first choice made by the original participant before the plan starts can
  // include its partial first week. Mid-week joining never rewrites that week.
  return !started && today <= first &&
    !member?.readingStart?.autoRecoveryAt && !member?.readingStart?.skippedSegmentIds.length
    ? first : [first, shiftDate(monday(started && today < first ? first : today), 7)].sort().at(-1)!;
}

export function personalReadingDays(group: Group, memberId: string, date: string): number[] {
  const original = group.personalProjection?.original ?? group;
  const change = [...(tempoFor(original, memberId)?.changes ?? [])].reverse().find(change => change.effectiveFrom <= date);
  if (change) return change.days;
  return original.frequency.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6]
    : original.frequency.kind === "weekdays" ? [1, 2, 3, 4, 5] : original.frequency.days;
}
export function nextTempo(group: Group, memberId: string, days: number[] | null,
  today: string, expectedVersion: number, expectedPlanRevision: string): PersonalTempo {
  if (expectedPlanRevision !== (group.planRevision ?? "")) throw new Error("Plan został zmieniony. Odśwież dane.");
  const existing = tempoFor(group, memberId);
  if ((existing?.version ?? 0) !== expectedVersion) throw new Error("Dni czytania zmieniono na innym urządzeniu. Odśwież dane.");
  const changes = (existing?.changes ?? []).filter(change => change.effectiveFrom <= today);
  if (days !== null) {
    if (!validTempoDays(days)) throw new Error("Wybierz od 1 do 7 różnych dni czytania.");
    let effectiveFrom = tempoEffectiveFrom(group, memberId, today);
    if (!Array.from({ length: 7 }, (_, index) => shiftDate(monday(effectiveFrom), index))
      .some(date => date >= effectiveFrom && days.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))) {
      effectiveFrom = shiftDate(monday(effectiveFrom), 7);
    }
    // Replacing a not-yet-started initial choice is allowed; retain past history.
    const retained = changes.filter(change => change.effectiveFrom < effectiveFrom);
    return { version: expectedVersion + 1, planRevision: expectedPlanRevision,
      changes: [...retained, { days: [...days].sort(), effectiveFrom }] };
  }
  return { version: expectedVersion + 1, planRevision: expectedPlanRevision, changes };
}

export function projectPersonalTempo(group: Group, memberId: string): Group {
  if (group.personalProjection?.memberId === memberId) return group;
  group = group.personalProjection?.original ?? group;
  const tempo = tempoFor(group, memberId);
  if (!tempo?.changes.length) return group;
  const skipped = new Set(group.members.find(m => m.id === memberId)?.readingStart?.skippedSegmentIds ?? []);
  const weeks = new Map<string, PlanDay[]>();
  for (const day of group.planDays) {
    const key = monday(day.date);
    weeks.set(key, [...(weeks.get(key) ?? []), day]);
  }
  const result: PlanDay[] = [];
  const progress = { ...group.progress[memberId] };
  const marks = { ...group.chapterProgress?.[memberId] };
  for (const [weekStart, originalDays] of weeks) {
    const change = [...tempo.changes].reverse().find(c => c.effectiveFrom <= shiftDate(weekStart, 6));
    if (!change) { result.push(...originalDays); continue; }
    const eligible = originalDays.filter(day => day.date >= change.effectiveFrom);
    result.push(...originalDays.filter(day => day.date < change.effectiveFrom));
    if (!eligible.length) continue;
    const dates = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i))
      .filter(date => date >= change.effectiveFrom && change.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay()));
    // In a partial first week all selected weekdays may precede the plan start.
    // Keep material on the first eligible date, without losing or duplicating it.
    if (!dates.length) { result.push(...eligible); continue; }
    const units: PlanSegment[] = [];
    for (const day of eligible) for (const segment of day.segments) {
      if (skipped.has(segment.id)) continue;
      const labels = readingChapters(segment);
      labels.forEach((label, index) => {
        const id = `tempo:${encodeURIComponent(segment.id)}:${index}`;
        units.push({ ...segment, id, label, personalSource: { segmentId: segment.id, chapterIndex: index, dayId: day.id } });
        const complete = Boolean(group.progress[memberId]?.[segment.id]) ||
          Boolean(group.chapterProgress?.[memberId]?.[segment.id]?.includes(index));
        if (complete) {
          const timestamp = group.chapterCompletedAt?.[memberId]?.[segment.id]?.[index] ?? group.progress[memberId]?.[segment.id];
          // Old imported partial marks have no trustworthy completion date.
          // Keep them complete without inventing a completion in the current week.
          progress[id] = timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : `${day.date}T12:00:00Z`;
        }
        else delete progress[id];
        marks[id] = complete ? [0] : [];
      });
    }
    let offset = 0;
    dates.forEach((date, index) => {
      const count = Math.floor(units.length / dates.length) + (index < units.length % dates.length ? 1 : 0);
      if (!count) return;
      result.push({ id: `tempo:${weekStart}:${date}`, date, index: result.length,
        title: "Czytanie", segments: units.slice(offset, offset + count) });
      offset += count;
    });
  }
  return { ...group, personalProjection: { memberId, original: group },
    planDays: result.sort((a, b) => a.date.localeCompare(b.date)).map((day, index) => ({ ...day, index })),
    progress: { ...group.progress, [memberId]: progress },
    chapterProgress: { ...group.chapterProgress, [memberId]: marks } };
}
