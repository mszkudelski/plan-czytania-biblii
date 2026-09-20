import type { Frequency, ImportedRow, PlanDay } from "../types";

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextReadingDate(cursor: Date, frequency: Frequency) {
  const allowed =
    frequency.kind === "daily"
      ? [0, 1, 2, 3, 4, 5, 6]
      : frequency.kind === "weekdays"
        ? [1, 2, 3, 4, 5]
        : frequency.days;

  while (!allowed.includes(cursor.getDay())) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return new Date(cursor);
}

export function buildSchedule(
  rows: ImportedRow[],
  startDate: string,
  frequency: Frequency,
): PlanDay[] {
  let cursor = new Date(`${startDate}T12:00:00`);

  return rows.map((row, dayIndex) => {
    const scheduled = row.date
      ? new Date(`${row.date}T12:00:00`)
      : nextReadingDate(cursor, frequency);
    const date = toLocalIso(scheduled);

    if (!row.date) {
      cursor = new Date(scheduled);
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      id: `day-${dayIndex + 1}`,
      index: dayIndex,
      date,
      title: row.title,
      segments: row.segments.map((segment, segmentIndex) => ({
        id: `day-${dayIndex + 1}-segment-${segmentIndex + 1}`,
        label: segment.label,
        section: segment.section,
      })),
    };
  });
}

export function formatPolishDate(iso: string, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    ...(style === "long" ? { weekday: "long" as const } : {}),
  }).format(new Date(`${iso}T12:00:00`));
}

export function todayIso() {
  return toLocalIso(new Date());
}
