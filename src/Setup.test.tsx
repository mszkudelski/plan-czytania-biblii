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

it("links the ready plan source and keeps the CSV structure collapsed for own plans", async () => {
  await openSetup();
  const source = container.querySelector<HTMLAnchorElement>('a[href="https://www.mcheyne.app/"]');
  expect(source?.textContent).toContain("Źródło");
  await click("Własny plan");
  const help = container.querySelector<HTMLDetailsElement>("details.csv-format-help");
  expect(help?.open).toBe(false);
  expect(help?.textContent).toContain("Dzień;Stary Testament;Nowy Testament;Psalm");
  expect(help?.textContent).toContain("Rdz 1–3");
  await act(async () => { help!.open = true; });
  expect(help?.open).toBe(true);
});

it("keeps the form usable when a CSV contains an invalid date", async () => {
  await openSetup();
  await click("Własny plan");
  vi.stubGlobal("FileReader", class {
    result = "Data;Fragment\n2026-13-01;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { this.onload?.(); }
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(summary()).toContain("Sprawdź daty w pliku CSV");
  expect(button("Utwórz plan").disabled).toBe(true);
});

it("rejects an extended start year before scheduling", async () => {
  await openSetup();
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "10000-01-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(summary()).toContain("Sprawdź daty");
  expect(button("Utwórz plan").disabled).toBe(true);
});

it("rejects a CSV date that rolls into another month", async () => {
  await openSetup(); await click("Własny plan");
  vi.stubGlobal("FileReader", class {
    result = "Data;Fragment\n2026-02-30;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { this.onload?.(); }
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(summary()).toContain("Sprawdź daty");
  expect(button("Utwórz plan").disabled).toBe(true);
});

it("keeps the selected preset when a delayed CSV finishes and caches it for later", async () => {
  let finish: () => void = () => {};
  vi.stubGlobal("FileReader", class {
    result = "Dzień;Fragment\n1;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { finish = () => this.onload?.(); }
  });
  await openSetup(); await click("Własny plan");
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await click("Gotowy plan");
  await act(async () => finish());
  expect(summary()).toContain("365 czytań");
  await click("Własny plan");
  expect(summary()).toContain("1 czytanie");
});
