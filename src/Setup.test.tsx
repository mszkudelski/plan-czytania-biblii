// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Setup } from "./SimpleApp";
import { BASIC_PLAN_CSV } from "./lib/basic-plan";
import { parsePlanCsv } from "./lib/csv";
import { buildSchedule, formatPolishDate, todayIso } from "./lib/schedule";

let root: Root;
let container: HTMLDivElement;

function button(label: string) {
  const node = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(element => element.textContent?.trim() === label);
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
async function click(label: string) {
  await act(async () => { button(label).click(); });
}
function summary() { return container.querySelector(".plan-schedule-summary")?.textContent ?? ""; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openSetup() {
  await act(async () => {
    root.render(<Setup onCreated={() => undefined} onRecovered={() => undefined}
      onJoinInvite={() => undefined} error="" theme="light" onThemeChange={() => undefined} />);
  });
  await click("Utwórz plan");
}

it("offers the ready-made plan first and calculates its actual end date without CSV upload", async () => {
  await openSetup();
  expect(button("Gotowy plan").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  const rows = parsePlanCsv(BASIC_PLAN_CSV);
  const daily = buildSchedule(rows, todayIso(), { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] });
  expect(summary()).toContain(`${rows.length} czytań`);
  expect(summary()).toContain(formatPolishDate(daily.at(-1)!.date, "shortYear"));

  await click("Pon.–pt.");
  const weekdays = buildSchedule(rows, todayIso(), { kind: "weekdays", days: [1, 2, 3, 4, 5] });
  expect(summary()).toContain(formatPolishDate(weekdays.at(-1)!.date, "shortYear"));
  expect(weekdays.at(-1)!.date).not.toBe(daily.at(-1)!.date);
});

it("preserves own-plan CSV upload and can return to the ready-made schedule", async () => {
  await openSetup();
  await click("Własny plan");
  expect(button("Własny plan").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('input[type="file"]')).toBeTruthy();
  expect(summary()).toContain("Wgraj plik CSV");
  await click("Gotowy plan");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(summary()).toContain("365 czytań");
});
