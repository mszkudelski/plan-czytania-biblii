// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dashboard } from "./SimpleApp";
import Onboarding from "./Onboarding";
import type { Group } from "./types";
import { createReadingStart } from "./lib/personal-schedule";
const include = vi.hoisted(() => vi.fn());
vi.mock("./lib/api", async importOriginal => ({ ...await importOriginal<typeof import("./lib/api")>(), includeSkippedReadings: include }));
vi.mock("./RecoveryPrompt", () => ({ default: () => null }));
vi.mock("./ReminderPrompt", () => ({ default: () => null }));
let root: Root, container: HTMLDivElement;
const today = "2026-10-30", credentials = { groupId: "g", memberId: "m", token: "test" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${today}T12:00:00Z`));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear(); window.history.replaceState({}, "", "/"); include.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function button(label: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label || b.getAttribute("aria-label") === label)!; }
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); }
async function render(choice: "beginning" | "group") {
  const group: Group = { id: "g", name: "Test", createdAt: today, startDate: "2026-10-24",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] }, members: [{ id: "m", name: "Test", color: "green", isAdmin: true }], progress: { m: {} },
    planDays: Array.from({ length: 15 }, (_, index) => ({ id: `d${index}`, index, title: "",
      date: new Date(Date.parse("2026-10-24T12:00:00Z") + index * 86400000).toISOString().slice(0, 10),
      segments: [{ id: `s${index}`, label: `Rdz ${index + 1}`, section: "Biblia" }],
    })),
  };
  group.members[0].readingStart = createReadingStart(group, choice, today);
  function Harness() {
    const [current, setCurrent] = useState(group);
    return <Onboarding group={current} credentials={credentials} ready><Dashboard group={current} credentials={credentials} setGroup={setCurrent}
      onCredentialsChange={vi.fn()} theme="light" onThemeChange={vi.fn()} promptReady refreshing={false} syncMessage="" onRefresh={vi.fn()} onLeave={vi.fn()} /></Onboarding>;
  }
  await act(async () => root.render(<Harness />)); return group;
}
it("late beginning starts catch-up immediately and turning it off survives remount", async () => {
  await render("beginning"); expect(button("Wyłącz nadrabianie")).toBeTruthy();
  expect(container.querySelector('.reading-extra')).toBeTruthy();
  expect(container.querySelector('.reading-focus')?.textContent).toContain("Rdz 1");
  await click(button("Wyłącz nadrabianie")); expect(button("Wyłącz nadrabianie")).toBeUndefined();
  await act(async () => root.unmount()); root = createRoot(container);
  await render("beginning"); expect(button("Wyłącz nadrabianie")).toBeUndefined();
});
it("group start has no catch-up or fictional progress and allows safe retry when including skipped readings", async () => {
  const group = await render("group");
  expect(button("Wyłącz nadrabianie")).toBeUndefined(); expect(container.querySelector('.reading-extra')).toBeNull();
  expect(container.querySelector('.reading-focus')?.textContent).toContain("Rdz 7");
  expect(container.querySelector('[aria-label="Postęp całego planu"]')?.getAttribute('aria-valuenow')).toBe("0");
  await click(button("Plan")); expect(container.querySelector('[data-day-id="d0"]')?.textContent).toContain("Pominięte");
  await click(container.querySelector('[data-day-id="d0"]')!);
  expect(container.querySelector('.reading-focus')?.textContent).toContain("Rdz 1");
  await click(button("Wróć do swojego miejsca")); expect(container.querySelector('.reading-focus')?.textContent).toContain("Rdz 7");
  expect(group.progress.m).toEqual({});
  await click(button("Plan")); await click(button("Włącz pominięte czytania")); await click(button("Anuluj")); expect(include).not.toHaveBeenCalled();
  await click(button("Włącz pominięte czytania")); include.mockRejectedValueOnce(new Error("offline"));
  await click(button("Potwierdź powrót do początku")); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się");
  expect(container.querySelector('[data-day-id="d0"]')?.textContent).toContain("Pominięte");
  const returned = structuredClone(group); returned.members[0].readingStart = { skippedSegmentIds: [] }; include.mockResolvedValueOnce(returned);
  await click(button("Potwierdź powrót do początku"));
  expect(container.querySelector('[data-day-id="d0"]')?.textContent).not.toContain("Pominięte");
  await click(button("Czytaj")); expect(container.querySelector('.reading-focus')?.textContent).toContain("Rdz 1");
  expect(group.progress.m).toEqual({});
});
