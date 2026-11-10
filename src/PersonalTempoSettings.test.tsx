// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PersonalTempoSettings from "./PersonalTempoSettings";
import type { Group } from "./types";
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./lib/api", () => ({ savePersonalTempo: save }));
const group: Group = { id: "g", name: "Synthetic", createdAt: "2026-11-01", startDate: "2026-11-16", frequency: { kind: "daily", days: [0,1,2,3,4,5,6] },
  members: [{ id: "m", name: "Tester", color: "green", isAdmin: true }], progress: { m: {} },
  planDays: [{ id: "d", index: 0, date: "2026-11-16", title: "", segments: [{ id: "s", label: "Rdz 1–12", section: "", referenceVersion: 1 }] }] };
let root: Root, container: HTMLDivElement;
const saved = vi.fn();
const button = (label: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === label)!;
async function click(label: string) { await act(async () => button(label).click()); }
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockReset(); saved.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<PersonalTempoSettings group={group} member={group.members[0]} credentials={{ groupId: "g", memberId: "m", token: "synthetic" }} onSaved={saved} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps preview collapsed, supports arbitrary weekday selection, and cancels without writing", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>(".tempo-setting-button")!.click());
  expect(container.querySelector<HTMLDetailsElement>("details")?.open).toBe(false);
  await click("3 dni");
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(3);
  expect(container.querySelector("ol")?.textContent).toContain("Rdz 12");
  const wednesday = container.querySelector<HTMLButtonElement>('[aria-label="Środa"]')!;
  await act(async () => wednesday.click());
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  expect(document.activeElement).toBe(container.querySelector("h2"));
  await click("Anuluj"); expect(save).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
});
it("disables zero days and does not activate a failed server write", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>(".tempo-setting-button")!.click());
  await click("1 dzień");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Sobota"]')!.click());
  expect(button("Zapisz").disabled).toBe(true); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Wybierz");
  await click("5 dni"); save.mockRejectedValue(new Error("Offline"));
  await click("Zapisz"); expect(saved).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Nie udało");
  save.mockResolvedValue(group); await click("Zapisz");
  expect(save).toHaveBeenLastCalledWith(expect.anything(), [1,2,3,4,5], 0, "", expect.any(String));
  expect(saved).toHaveBeenCalledWith(group);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Zapisano dni czytania.");
});
