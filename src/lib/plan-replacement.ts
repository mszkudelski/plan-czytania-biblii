import type { Frequency, Group, PlanDay, PlanSegment } from "../types";
import { planTemplate } from "./plan-template";

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

export function replaceGroupPlan<T extends Group>(group: T, input: PlanReplacementInput, revision: string = crypto.randomUUID()): T {
  if ((group.planRevision ?? "") !== input.expectedRevision) {
    throw new Error("Plan został już podmieniony. Odśwież plan i sprawdź podgląd ponownie.");
  }
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
    ...group, planDays, startDate: input.startDate, frequency: input.frequency,
    planTemplate: planTemplate(input.planDays),
    planRevision: revision, planVersion: (group.planVersion ?? 0) + 1, progressSegmentIds,
    chapterProgress: Object.fromEntries(group.members.map(member => [member.id,
      Object.fromEntries(Object.entries(group.chapterProgress?.[member.id] ?? {}).filter(([id]) => activeIds.has(id))),
    ])),
    progress: Object.fromEntries(group.members.map(member => [member.id,
      Object.fromEntries(Object.entries(group.progress[member.id] ?? {}).filter(([id]) => activeIds.has(id))),
    ])),
  };
}
