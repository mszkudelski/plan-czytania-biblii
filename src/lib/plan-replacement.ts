import type { Frequency, Group, PlanDay, PlanSegment } from "../types";

export type PlanReplacementInput = {
  planDays: PlanDay[];
  startDate: string;
  frequency: Frequency;
  expectedRevision: string;
};

export function replacementPlanError(planDays: PlanDay[]) {
  if (!planDays.length || planDays.length > 5000) return "Plan musi zawierać od 1 do 5000 dni czytania.";
  if (planDays.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || Number.isNaN(Date.parse(day.date)) ||
    new Date(day.date).toISOString().slice(0, 10) !== day.date)) return "Sprawdź daty w nowym planie.";
  if (planDays.some(day => day.title.length > 120 || !day.segments.length || day.segments.length > 20 ||
    day.segments.some(segment => !segment.label.trim() || segment.label.length > 180 || segment.section.length > 80))) {
    return "Każdy dzień może mieć 1–20 fragmentów. Maksymalna długość fragmentu to 180 znaków, tytułu dnia 120, a nagłówka kolumny 80.";
  }
  return "";
}

function readingKey(label: string) {
  return label.normalize("NFC").toLocaleLowerCase("pl")
    .replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim()
    .replace(/\s*([,:;-])\s*/g, "$1");
}

// Match occurrences one-to-one. Dates, titles and CSV column headings can change.
// Different abbreviations or split/merged passages are intentionally not guessed.
export function matchPlanSegments(group: Group, planDays: PlanDay[]) {
  const old = new Map<string, { segments: PlanSegment[]; next: number }>();
  for (const segment of group.planDays.flatMap(day => day.segments)) {
    const key = readingKey(segment.label);
    const bucket = old.get(key) ?? { segments: [], next: 0 };
    bucket.segments.push(segment);
    old.set(key, bucket);
  }
  return planDays.flatMap(day => day.segments).map(segment => {
    const bucket = old.get(readingKey(segment.label));
    return { segment, previous: bucket?.segments[bucket.next++] };
  });
}

export function replacementSummary(group: Group, planDays: PlanDay[]) {
  const matches = matchPlanSegments(group, planDays);
  const retainedIds = new Set(matches.flatMap(match => match.previous ? [match.previous.id] : []));
  const oldIds = new Set(group.planDays.flatMap(day => day.segments.map(segment => segment.id)));
  let index = 0;
  const dayMatches = planDays.map(day => {
    const start = index;
    index += day.segments.length;
    return matches.slice(start, index);
  });
  return {
    matched: retainedIds.size,
    total: matches.length,
    members: group.members.map(member => {
      const completed = Object.keys(group.progress[member.id] ?? {}).filter(id => oldIds.has(id));
      const retained = completed.filter(id => retainedIds.has(id)).length;
      const completedIds = new Set(completed);
      const completedDays = dayMatches.filter(day => day.length > 0 &&
        day.every(match => match.previous && completedIds.has(match.previous.id))).length;
      return { memberId: member.id, name: member.name, retained, unmatched: completed.length - retained, completedDays };
    }),
  };
}

export const PLAN_RESTORE_TTL = 7 * 24 * 60 * 60 * 1000;
export type SavedPlan = Pick<Group, "planDays" | "startDate" | "frequency" | "progress"> & {
  savedAt: string;
  expiresAt: string;
};
export type RestorableGroup = Group & { previousPlan?: SavedPlan };

export function planRestoreAvailable(restore: Group["planRestore"], now = Date.now()) {
  return Boolean(restore && Date.parse(restore.expiresAt) > now);
}

export function replaceGroupPlan<T extends Group>(group: T, input: PlanReplacementInput,
  revision: string = crypto.randomUUID(), now = Date.now()): T & { previousPlan: SavedPlan } {
  if ((group.planRevision ?? "") !== input.expectedRevision) {
    throw new Error("Plan został już podmieniony. Odśwież plan i sprawdź podgląd ponownie.");
  }
  const savedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + PLAN_RESTORE_TTL).toISOString();
  const previousPlan: SavedPlan = structuredClone({ planDays: group.planDays, startDate: group.startDate,
    frequency: group.frequency, progress: group.progress, savedAt, expiresAt });
  const matches = matchPlanSegments(group, input.planDays);
  const progressSegmentIds = [...(group.progressSegmentIds ?? group.planDays.flatMap(day => day.segments.map(segment => segment.id)))];
  let index = 0;
  const planDays = input.planDays.map((day, dayIndex) => ({
    ...day, id: `plan-${revision}-day-${dayIndex + 1}`, index: dayIndex,
    segments: day.segments.map(segment => {
      const match = matches[index++];
      const id = match.previous?.id ?? `plan-${revision}-segment-${index}`;
      if (!match.previous) progressSegmentIds.push(id);
      return { ...segment, id };
    }),
  }));
  const activeIds = new Set(planDays.flatMap(day => day.segments.map(segment => segment.id)));
  return {
    ...group, previousPlan, planRestore: { savedAt, expiresAt }, planDays, startDate: input.startDate, frequency: input.frequency,
    planRevision: revision, planVersion: (group.planVersion ?? 0) + 1, progressSegmentIds,
    progress: Object.fromEntries(group.members.map(member => [member.id,
      Object.fromEntries(Object.entries(group.progress[member.id] ?? {}).filter(([id]) => activeIds.has(id))),
    ])),
  };
}

// Fresh IDs isolate the saved snapshot from every old or in-flight progress log.
// Membership, roles and credentials always come from the current group.
export function restoreGroupPlan<T extends RestorableGroup>(group: T, expectedRevision: string,
  revision: string = crypto.randomUUID(), now = Date.now()): T {
  if ((group.planRevision ?? "") !== expectedRevision) {
    throw new Error("Plan został już zmieniony. Odśwież plan i spróbuj ponownie.");
  }
  const saved = group.previousPlan;
  if (!saved) throw new Error("Brak poprzedniego planu do przywrócenia.");
  if (!planRestoreAvailable(saved, now)) throw new Error("Minęło 7 dni. Przywrócenie poprzedniego planu nie jest już dostępne.");
  const progressSegmentIds = [...(group.progressSegmentIds ?? group.planDays.flatMap(day => day.segments.map(segment => segment.id)))];
  const restoredIds = new Map<string, string>();
  const planDays = saved.planDays.map((day, index) => ({
    ...day, id: `plan-${revision}-day-${index + 1}`, index,
    segments: day.segments.map(segment => {
      const id = `plan-${revision}-segment-${restoredIds.size + 1}`;
      restoredIds.set(segment.id, id);
      progressSegmentIds.push(id);
      return { ...segment, id };
    }),
  }));
  return {
    ...group, planDays, startDate: saved.startDate, frequency: structuredClone(saved.frequency),
    planRevision: revision, planVersion: (group.planVersion ?? 0) + 1, progressSegmentIds,
    previousPlan: undefined, planRestore: undefined,
    progress: Object.fromEntries(group.members.map(member => [member.id,
      Object.fromEntries(Object.entries(saved.progress[member.id] ?? {})
        .flatMap(([id, timestamp]) => restoredIds.has(id) ? [[restoredIds.get(id)!, timestamp]] : [])),
    ])),
  };
}
