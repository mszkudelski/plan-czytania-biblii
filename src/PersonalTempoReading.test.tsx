// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dashboard } from "./SimpleApp";
import Onboarding from "./Onboarding";
import { nextTempo } from "./lib/personal-tempo";
import { applyChapterProgress } from "./lib/chapter-progress";
import type { Group } from "./types";
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("./lib/api", async original => ({ ...await original<typeof import("./lib/api")>(), getGroup: mocks.get, updateProgress: mocks.update }));
vi.mock("./RecoveryPrompt", () => ({ default: () => null }));
vi.mock("./ReminderPrompt", () => ({ default: () => null }));
it("writes projected checkboxes to their original chapter index and preserves original plan view", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {}); localStorage.clear(); window.history.replaceState({}, "", "/");
  let g: Group = { id: "g", name: "Synthetic", createdAt: "2026-11-01", startDate: "2026-11-09", frequency: { kind: "daily", days: [0,1,2,3,4,5,6] }, members: [{ id: "m", name: "Tester", color: "green", isAdmin: true }], progress: { m: {} },
    planDays: [{ id: "d", index: 0, date: "2026-11-09", title: "Oryginalny dzień", segments: [{ id: "s", label: "Rdz 1–12", section: "Biblia", referenceVersion: 1 }] }] };
  g.members[0].personalTempo = nextTempo(g, "m", [1,3,5], "2026-11-08", 0, "");
  mocks.get.mockImplementation(async () => g);
  mocks.update.mockImplementation(async (_credentials, id, complete, indices) => { g = applyChapterProgress(g, "m", id, complete, indices); return g; });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const credentials = { groupId: "g", memberId: "m", token: "synthetic" };
  function Harness() { const [group, setGroup] = useState(g); return <Onboarding group={group} credentials={credentials} ready><Dashboard group={group} credentials={credentials} setGroup={setGroup} onCredentialsChange={vi.fn()} theme="light" onThemeChange={vi.fn()} promptReady refreshing={false} syncMessage="" onRefresh={vi.fn()} onLeave={vi.fn()} /></Onboarding>; }
  try {
    await act(async () => root.render(<Harness />));
    const first = container.querySelector<HTMLButtonElement>('.reading-focus button[aria-pressed]')!;
    expect(first).toBeTruthy();
    await act(async () => { first.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mocks.update).toHaveBeenCalledWith(credentials, "s", true, [0], undefined);
    expect(g.chapterProgress?.m.s).toEqual([0]); expect(g.progress.m.s).toBeUndefined();
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Plan")!;
    await act(async () => button.click());
    expect(container.querySelectorAll('.plan-day-row')).toHaveLength(1);
    expect(container.querySelector('.plan-day-row')?.textContent).toContain("Rdz 1–12");
  } finally { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
