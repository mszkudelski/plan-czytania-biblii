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
  expect(button("Wybierz plan").textContent).toBe("Wybierz plan");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  await click("Wybierz plan");
  const rows = parsePlanCsv(BASIC_PLAN_CSV);
  const daily = buildSchedule(rows, todayIso(), { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] });
  expect(summary()).toContain(`${rows.length} czytań`);
  expect(summary()).toContain(formatPolishDate(daily.at(-1)!.date, "shortYear"));

  await click("Od poniedziałku do piątku");
  const weekdays = buildSchedule(rows, todayIso(), { kind: "weekdays", days: [1, 2, 3, 4, 5] });
  expect(summary()).toContain(formatPolishDate(weekdays.at(-1)!.date, "shortYear"));
  expect(weekdays.at(-1)!.date).not.toBe(daily.at(-1)!.date);
});

it("preserves own-plan CSV upload and can return to the ready-made schedule", async () => {
  await openSetup();
  await click("Mam własny plan →");
  expect(container.querySelector("h1")?.textContent).toBe("Dodaj swój plan");
  expect(container.querySelector('input[type="file"]')).toBeTruthy();
  expect(button("Dalej").disabled).toBe(true);
  await click("Wróć");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  await click("Wybierz plan");
  expect(summary()).toContain("365 czytań");
});

it("links the ready plan source and keeps the CSV structure collapsed for own plans", async () => {
  await openSetup();
  const source = container.querySelector<HTMLAnchorElement>('a[href="https://www.mcheyne.app/"]');
  expect(source?.textContent).toContain("Źródło");
  await click("Mam własny plan →");
  const help = container.querySelector<HTMLDetailsElement>("details.csv-format-help");
  expect(help?.open).toBe(false);
  expect(help?.textContent).toContain("Dzień;Czytanie 1;Czytanie 2");
  expect(help?.textContent).toContain("Rdz 1–3");
  await act(async () => { help!.open = true; });
  expect(help?.open).toBe(true);
});

it("keeps the form usable when a CSV contains an invalid date", async () => {
  await openSetup();
  await click("Mam własny plan →");
  vi.stubGlobal("FileReader", class {
    result = "Data;Fragment\n2026-13-01;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { this.onload?.(); }
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(summary()).toContain("Sprawdź daty w pliku CSV");
  expect(button(container.querySelector("form") ? "Utwórz plan" : "Dalej").disabled).toBe(true);
});

it("rejects an extended start year before scheduling", async () => {
  await openSetup();
  await click("Wybierz plan");
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "10000-01-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(summary()).toContain("Sprawdź daty");
  expect(button(container.querySelector("form") ? "Utwórz plan" : "Dalej").disabled).toBe(true);
});

it("rejects a CSV date that rolls into another month", async () => {
  await openSetup(); await click("Mam własny plan →");
  vi.stubGlobal("FileReader", class {
    result = "Data;Fragment\n2026-02-30;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { this.onload?.(); }
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(summary()).toContain("Sprawdź daty");
  expect(button(container.querySelector("form") ? "Utwórz plan" : "Dalej").disabled).toBe(true);
});

it("keeps the selected preset when a delayed CSV finishes and caches it for later", async () => {
  let finish: () => void = () => {};
  vi.stubGlobal("FileReader", class {
    result = "Dzień;Fragment\n1;Rdz 1";
    onload: (() => void) | null = null;
    readAsText() { finish = () => this.onload?.(); }
  });
  await openSetup(); await click("Mam własny plan →");
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await click("Wróć");
  await act(async () => finish());
  await click("Wybierz plan");
  expect(summary()).toContain("365 czytań");
  await click("Wróć");
  await click("Mam własny plan →");
  expect(button("Dalej").disabled).toBe(false);
  await click("Dalej");
  expect(summary()).toContain("1 czytanie");
});

it("keeps name and schedule across back navigation and focuses each step heading", async () => {
  await openSetup();
  expect(document.activeElement).toBe(container.querySelector("h1"));
  await click("Wybierz plan");
  expect(container.querySelector<HTMLDetailsElement>(".setup-customize")?.open).toBe(false);
  expect(document.activeElement).toBe(container.querySelector("h1"));
  const name = container.querySelector<HTMLInputElement>('input[name="ownerName"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Tester");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Od poniedziałku do piątku");
  const expected = summary();
  await click("Wróć");
  await click("Wybierz plan");
  expect(container.querySelector<HTMLInputElement>('input[name="ownerName"]')?.value).toBe("Tester");
  expect(summary()).toBe(expected);
});

it("copies the edited prompt, reports success and selects text on clipboard failure", async () => {
  await openSetup(); await click("Mam własny plan →");
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Plan Jana;30 czytań");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await click("Kopiuj prompt");
  expect(writeText).toHaveBeenCalledWith("Plan Jana;30 czytań");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Skopiowano prompt.");
  writeText.mockRejectedValue(new Error("Unavailable"));
  await click("Kopiuj prompt");
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(0);
  expect(textarea.selectionEnd).toBe(textarea.value.length);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("ręcznie");
});

it("requires a real valid import and disables continuation during read or on read failure", async () => {
  let fail: () => void = () => {};
  vi.stubGlobal("FileReader", class {
    onerror: (() => void) | null = null;
    readAsText() { fail = () => this.onerror?.(); }
  });
  await openSetup(); await click("Mam własny plan →");
  expect(button("Dalej").disabled).toBe(true);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File([""], "plan.csv")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(button("Dalej").disabled).toBe(true);
  await act(async () => fail());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się odczytać");
  expect(button("Dalej").disabled).toBe(true);
});

it("disables creation if all custom weekdays are deselected", async () => {
  await openSetup(); await click("Wybierz plan"); await click("Wybierz dni");
  for (const day of ["Pn", "Wt", "Śr", "Cz", "Pt"]) await click(day);
  expect(button("Utwórz plan").disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Wybierz dni czytania.");
  await click("So");
  expect(button("Utwórz plan").disabled).toBe(false);
});
