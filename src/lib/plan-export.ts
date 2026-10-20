import type { Group, PlanDay } from "../types";

function csvCell(value: string) {
  // Quoting alone does not prevent spreadsheet formula execution.
  const text = /^\s*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportPlanCsv(days: PlanDay[]) {
  const columns = Math.max(1, ...days.map(day => day.segments.length));
  const headers = ["data", "tytuł", ...Array.from({ length: columns }, (_, i) => `Czytanie ${i + 1}`)];
  const rows = days.map(day => [day.date, day.title,
    ...Array.from({ length: columns }, (_, i) => day.segments[i]?.label ?? "")]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadPlanCsv(group: Group) {
  const csv = new Blob([exportPlanCsv(group.planDays)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(csv);
  const link = document.createElement("a");
  const name = group.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  link.href = url;
  link.download = `${name || "plan-grupy"}.csv`;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    // Let browsers finish starting the download before releasing its object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
