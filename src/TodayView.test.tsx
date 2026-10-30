// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TodayView } from "./SimpleApp";
import { createOptimisticProgressQueue } from "./lib/optimistic-progress";
import { applyChapterProgress } from "./lib/chapter-progress";
import type { Group } from "./types";

vi.mock("./RecoveryPrompt", () => ({ default: ({ onEnable }: { onEnable: () => void }) =>
  <button data-test="enable" onClick={onEnable}>Włącz testowo</button> }));

const TODAY = "2026-10-15";
const KEY = "reading-recovery:g:m";
let root: Root;
let container: HTMLDivElement;
const date = (offset: number) => new Date(Date.parse(`${TODAY}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
function plan(count = 12): Group {
  return { id: "g", name: "Test", createdAt: TODAY, startDate: date(-4),
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    members: [{ id: "m", name: "Test", isAdmin: true, color: "green" }],
    planDays: Array.from({ length: count }, (_, i) => ({
      id: `d${i}`, index: i, date: date(i - 4), title: "",
      segments: [{ id: `s${i}`, label: `Rdz ${i + 1}`, section: "Biblia" }],
    })), progress: { m: {} } };
}
type Pending = { id: string; completed: boolean; resolve: () => void; reject: () => void };
function mount(initial: Group, enabled = true, ready = true) {
  if (enabled) localStorage.setItem(KEY, TODAY);
  let group = initial;
  let verified = ready;
  const writes: Pending[] = [];
  const errors: string[] = [];
  let server = structuredClone(initial);
  const queue = createOptimisticProgressQueue({ group, memberId: "m",
    save: (id, completed, indices) => new Promise<Group>((resolve, reject) => {
      writes.push({ id, completed, resolve: () => {
        server = structuredClone(server);
        server = applyChapterProgress(server, "m", id, completed, indices, `${TODAY}T12:00:00Z`);
        resolve(server);
      }, reject: () => reject(new Error("offline")) });
    }),
    onChange: value => { group = value; render(); }, onSave: () => undefined,
    onError: () => errors.push("save failed"),
  });
  function render() {
    root.render(<TodayView group={group} credentials={{ groupId: "g", memberId: "m", token: "test" }}
      member={group.members[0]} active promptReady={verified}
      onToggle={(id, completed, optimistic, indices, migrate) => queue.toggle(id, completed, optimistic, indices, migrate)}
      onWaitForSegments={queue.waitForSegments} onError={message => { if (message) errors.push(message); }} />);
  }
  return { writes, errors, render,
    refresh(value: Group, ready = true) { verified = ready; queue.replaceGroup(value); },
    get group() { return group; },
  };
}
function button(label: string) {
  const element = [...container.querySelectorAll<HTMLButtonElement>("button")].find(node =>
    node.querySelector("strong")?.textContent === label || node.getAttribute("aria-label") === label || node.textContent === label);
  if (!element) throw new Error(`Missing button ${label}: ${container.textContent}`);
  return element;
}
async function click(label: string) { await act(async () => button(label).click()); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); window.history.replaceState({}, "", "/");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("imports legacy prefix and sparse marks only after verification and updates the visible remaining range", async () => {
  const g = plan(); g.planDays[0].segments[0].label = "Rdz 1-4";
  localStorage.setItem(`${KEY}:chapters`, JSON.stringify({ s0: 1 }));
  localStorage.setItem(`${KEY}:chapter-marks`, JSON.stringify({ s0: [2] }));
  const f = mount(g, false, false); await act(async () => f.render());
  expect(f.writes).toHaveLength(0);
  await act(async () => f.refresh(structuredClone(g)));
  expect(f.writes).toHaveLength(1);
  expect(localStorage.getItem(`${KEY}:chapters-synced-v1`)).toBeNull();
  await act(async () => f.writes[0].resolve());
  expect(f.group.chapterProgress?.m.s0).toEqual([0, 2]);
  expect(f.group.progress.m.s0).toBeUndefined();
  expect(button("Rdz 2 · Rdz 4")).toBeDefined();
  expect(localStorage.getItem(`${KEY}:chapters-synced-v1`)).toBe("1");
});

it("retains legacy partial marks and reports a failed import without recording migration success", async () => {
  const g = plan(); g.planDays[0].segments[0].label = "Rdz 1-3";
  localStorage.setItem(`${KEY}:chapters`, JSON.stringify({ s0: 1 }));
  const f = mount(g, false); await act(async () => f.render());
  await act(async () => f.writes[0].reject());
  expect(localStorage.getItem(`${KEY}:chapters-synced-v1`)).toBeNull();
  expect(localStorage.getItem(`${KEY}:chapters`)).toBe(JSON.stringify({ s0: 1 }));
  expect(f.errors.some(error => error.includes("zsynchronizować"))).toBe(true);
  expect(f.group.progress.m.s0).toBeUndefined();
});

it("checks and unchecks only the remaining chapters, preserves the other device's mark, and rolls back failure", async () => {
  const g = plan(); g.planDays[0].segments[0].label = "Rdz 1-3";
  g.chapterProgress = { m: { s0: [1] } };
  const f = mount(g, false); await act(async () => f.render());
  await click("Rdz 1 · Rdz 3");
  expect(button("Rdz 1 · Rdz 3").getAttribute("aria-pressed")).toBe("true");
  await act(async () => f.writes[0].resolve());
  expect(f.group.chapterProgress?.m.s0).toEqual([0, 1, 2]);
  await click("Rdz 1 · Rdz 3"); await act(async () => f.writes[1].resolve());
  expect(f.group.chapterProgress?.m.s0).toEqual([1]);
  expect(f.group.progress.m.s0).toBeUndefined();
  await click("Rdz 1 · Rdz 3"); await act(async () => f.writes[2].reject());
  expect(button("Rdz 1 · Rdz 3").getAttribute("aria-pressed")).toBe("false");
  expect(f.group.chapterProgress?.m.s0).toEqual([1]);
  expect(f.errors.length).toBeGreaterThan(0);
});

it("uses server chapter state instead of a stale cached extra completion", async () => {
  const g = plan(); g.progress.m.s0 = "done"; g.chapterProgress = { m: { s1: [] } };
  localStorage.setItem(`${KEY}:ordered:${TODAY}:day`, "d0");
  localStorage.setItem(`${KEY}:ordered:${TODAY}`, JSON.stringify({ completed: true,
    reading: { segmentId: "s1", label: "Rdz 2", originalDate: date(-3), chapterIndex: 0, chapterCount: 1 } }));
  const f = mount(g); await act(async () => f.render());
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("false");
  expect(f.writes).toHaveLength(0);
});
