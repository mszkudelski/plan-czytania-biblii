// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dashboard } from "./SimpleApp";
import Onboarding from "./Onboarding";
import { applyChapterProgress } from "./lib/chapter-progress";
import type { Group } from "./types";

vi.mock("./RecoveryPrompt", () => ({ default: () => null }));
vi.mock("./ReminderPrompt", () => ({ default: () => null }));
let root: Root, container: HTMLDivElement;
const today = "2026-10-30";
const credentials = { groupId: "g", memberId: "m", token: "test" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${today}T12:00:00Z`));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear(); window.history.replaceState({}, "", "/");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    button.textContent === label || button.getAttribute("aria-label") === label)!;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
it.each([false, true])("opens original completed, overdue and future rows without writes and restores Plan position (recovery: %s)", async recovery => {
  const group: Group = { id: "g", name: "Test", createdAt: today, startDate: "2026-10-24",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    members: [{ id: "m", name: "Test", color: "green", isAdmin: true }],
    progress: { m: { s0: "done" } },
    planDays: Array.from({ length: 36 }, (_, index) => ({ id: `d${index}`, index, title: "",
      date: new Date(Date.parse("2026-10-24T12:00:00Z") + index * 86400000).toISOString().slice(0, 10),
      segments: [{ id: `s${index}`, label: `Rdz ${index * 3 + 1}-${index * 3 + 3}`, section: "Biblia" }],
    })),
  };
  if (recovery) localStorage.setItem("reading-recovery:g:m", today);
  localStorage.setItem("reading-recovery:g:m:chapters", JSON.stringify({ s3: 1 }));
  await act(async () => root.render(<Onboarding group={group} credentials={credentials} ready>
    <Dashboard group={group} credentials={credentials} setGroup={vi.fn()} onCredentialsChange={vi.fn()}
      theme="light" onThemeChange={vi.fn()} promptReady refreshing={false} syncMessage=""
      onRefresh={vi.fn()} onLeave={vi.fn()} />
  </Onboarding>));
  const home = container.querySelector('.reading-focus')!.textContent;
  const storage = { ...localStorage };
  const originalProgress = structuredClone(group.progress);
  for (const index of [0, 3, 24, 24]) {
    await click(button("Plan"));
    const row = container.querySelector<HTMLButtonElement>(`[data-day-id="d${index}"].plan-day-row`)!;
    expect(row.tagName).toBe("BUTTON"); expect(row.type).toBe("button");
    expect(row.getAttribute("aria-label")).toContain(group.planDays[index].segments[0].label);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(720);
    await click(row);
    const card = container.querySelector<HTMLElement>('.reading-focus')!;
    expect(card.textContent).toContain(group.planDays[index].segments[0].label);
    expect(document.activeElement).toBe(card);
    expect(card.querySelector('time')!.dateTime).toBe(group.planDays[index].date);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    expect(group.progress).toEqual(originalProgress); expect({ ...localStorage }).toEqual(storage);
    await click(button("Plan"));
    expect(document.activeElement?.getAttribute("data-day-id")).toBe(`d${index}`);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 720, behavior: "instant" });
  }
  await click(button("Czytaj")); await click(button("Wróć do swojego miejsca"));
  expect(container.querySelector('.reading-focus')!.textContent).toBe(home);
});


it("waits for the dashboard queue to receive verified progress before freezing recovery", async () => {
  const cached: Group = { id: "g", name: "Test", createdAt: today, startDate: "2026-10-24",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    members: [{ id: "m", name: "Test", color: "green", isAdmin: true }], progress: { m: {} },
    planDays: Array.from({ length: 12 }, (_, index) => ({ id: `d${index}`, index, title: "",
      date: new Date(Date.parse("2026-10-24T12:00:00Z") + index * 86400000).toISOString().slice(0, 10),
      segments: [{ id: `s${index}`, label: `Rdz ${index + 1}`, section: "Biblia" }],
    })),
  };
  localStorage.setItem("reading-recovery:g:m", today);
  const render = (group: Group, ready: boolean) => root.render(<Onboarding group={group} credentials={credentials} ready={ready}>
    <Dashboard group={group} credentials={credentials} setGroup={vi.fn()} onCredentialsChange={vi.fn()}
      theme="light" onThemeChange={vi.fn()} promptReady={ready} refreshing={false} syncMessage=""
      onRefresh={vi.fn()} onLeave={vi.fn()} />
  </Onboarding>);
  await act(async () => render(cached, false));
  expect(localStorage.getItem(`reading-recovery:g:m:ordered:${today}:portion-v3`)).toBeNull();
  let fresh = cached;
  for (const id of ["s0", "s1", "s2"]) fresh = applyChapterProgress(fresh, "m", id, true);
  await act(async () => render(fresh, true));
  expect(container.querySelector(".simple-readings strong")?.textContent).toBe("Rdz 4");
  expect(container.querySelector(".reading-extra strong")?.textContent).toBe("Rdz 5");
});
