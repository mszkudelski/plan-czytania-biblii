// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TodayView } from "./SimpleApp";
import { createOptimisticProgressQueue } from "./lib/optimistic-progress";
import { projectRecoveryPortions } from "./lib/recovery";
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
    save: (id, completed) => new Promise<Group>((resolve, reject) => {
      writes.push({ id, completed, resolve: () => {
        server = structuredClone(server);
        if (completed) server.progress.m[id] = `${TODAY}T12:00:00Z`;
        else delete server.progress.m[id];
        resolve(server);
      }, reject: () => reject(new Error("offline")) });
    }),
    onChange: value => { group = value; render(); }, onSave: () => undefined,
    onError: () => errors.push("save failed"),
  });
  function render() {
    root.render(<TodayView group={group} credentials={{ groupId: "g", memberId: "m", token: "test" }}
      member={group.members[0]} active promptReady={verified} savingProgress={queue.hasPending}
      onToggle={(id, completed) => queue.toggle(id, completed)}
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
async function flush() { await act(async () => { await Promise.resolve(); }); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); window.history.replaceState({}, "", "/");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("sends one request for a recovery check, without a second autosync request", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Rdz 1");
  expect(f.writes).toHaveLength(1);
  await act(async () => f.writes[0].resolve());
  expect(f.writes).toHaveLength(1);
});

it("rolls back a failed full chapter without retrying it from the local chapter cache", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Rdz 1");
  await act(async () => f.writes[0].reject()); await flush();
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("false");
  expect(f.writes).toHaveLength(1);
});

it("honors a normal uncheck after recovery instead of re-checking cached chapters", async () => {
  const g = plan(); g.progress.m.s0 = "done";
  localStorage.setItem(`${KEY}:chapters`, JSON.stringify({ s0: 1 }));
  localStorage.setItem(`reading-home:g:m:${TODAY}`, "d0");
  const f = mount(g, false); await act(async () => f.render());
  await click("Rdz 1");
  await act(async () => f.writes[0].resolve()); await flush();
  expect(f.group.progress.m.s0).toBeUndefined();
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("false");
  expect(f.writes).toHaveLength(1);
});

it("keeps recovery enabled while the final overdue check is pending and after a rejection", async () => {
  const g = plan(); g.planDays.forEach((day, i) => { day.date = date(i - 1); });
  const f = mount(g); await act(async () => f.render());
  await click("Rdz 1");
  expect(localStorage.getItem(KEY)).toBe(TODAY);
  await act(async () => f.writes[0].reject()); await flush();
  expect(localStorage.getItem(KEY)).toBe(TODAY);
  expect(container.textContent).toContain("Wyłącz nadrabianie");
});

it("exits recovery after the final overdue check has actually been saved", async () => {
  const g = plan(); g.planDays.forEach((day, i) => { day.date = date(i - 1); });
  const f = mount(g); await act(async () => f.render()); await click("Rdz 1");
  await act(async () => f.writes[0].resolve()); await flush();
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(container.textContent).not.toContain("Wyłącz nadrabianie");
  expect(f.writes).toHaveLength(1);
  await act(async () => root.unmount()); root = createRoot(container);
  const reloaded = mount(f.group, false); await act(async () => reloaded.render());
  expect(container.querySelector(".simple-readings strong")?.textContent).toBe("Rdz 2");
});

it("does not freeze a stale cached portion before fresh progress is loaded", async () => {
  const f = mount(plan(), true, false); await act(async () => f.render());
  expect(localStorage.getItem(`${KEY}:ordered:${TODAY}:portion-v3`)).toBeNull();
  const fresh = plan(); fresh.progress.m = { s0: "done", s1: "done" };
  await act(async () => f.refresh(fresh));
  expect(container.querySelector(".simple-readings strong")?.textContent).toBe("Rdz 3");
});

it("only attempts startup reconciliation once when its request fails", async () => {
  localStorage.setItem(`${KEY}:chapters`, JSON.stringify({ s0: 1 }));
  const f = mount(plan()); await act(async () => f.render());
  expect(f.writes).toHaveLength(1);
  await act(async () => f.writes[0].reject()); await flush();
  expect(f.writes).toHaveLength(1);
});

it("preserves a completed frozen portion after reload without duplicating its history", async () => {
  const g = plan();
  const portion = projectRecoveryPortions(g, "m", TODAY, {}, "")[0];
  g.progress.m.s0 = "done";
  localStorage.setItem(`${KEY}:ordered:${TODAY}:portion-v3`, JSON.stringify(portion));
  const f = mount(g); await act(async () => f.render());
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('.reading-date[data-day-id="d0"]')).toBeNull();
  await click("Następne"); expect(button("Rdz 3")).toBeDefined();
  await click("Poprzednie"); expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("true");
});

it("keeps a forecast's assignments stable while its rows are checked and unchecked", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Następne");
  const labels = () => [...container.querySelectorAll(".simple-readings strong")].map(node => node.textContent);
  const before = labels();
  await click("Rdz 3");
  expect(labels()).toEqual(before);
  await act(async () => f.writes[0].resolve());
  expect(labels()).toEqual(before);
  await click("Rdz 3");
  await act(async () => f.writes[1].resolve());
  expect(labels()).toEqual(before);
  expect(button("Rdz 3").getAttribute("aria-pressed")).toBe("false");
});

it("does not persist a failed extra as complete and allows a successful retry", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Rdz 1"); await act(async () => f.writes[0].resolve());
  await click("Rdz 2"); await act(async () => f.writes[1].reject());
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("false");
  await click("Rdz 2"); await act(async () => f.writes[2].resolve());
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("true");
  expect(f.group.progress.m.s1).toBeDefined();
});

it("disabling and re-enabling starts from the new unread position without reusing a finished extra", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Rdz 1"); await act(async () => f.writes[0].resolve());
  await click("Rdz 2"); await act(async () => f.writes[1].resolve());
  await click("Wyłącz nadrabianie");
  await click("Włącz testowo");
  expect([...container.querySelectorAll(".simple-readings strong")].map(node => node.textContent)).toEqual(["Rdz 3", "Rdz 4"]);
  expect(localStorage.getItem(`${KEY}:ordered:${TODAY}`)).toBeNull();
});

it("keeps checked forecast assignments on the same date after reload", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Następne"); await click("Rdz 3"); await act(async () => f.writes[0].resolve());
  await act(async () => root.unmount()); root = createRoot(container);
  const reloaded = mount(f.group); await act(async () => reloaded.render());
  await click("Następne");
  expect(button("Rdz 3").getAttribute("aria-pressed")).toBe("true");
  expect(button("Rdz 4").getAttribute("aria-pressed")).toBe("false");
});

it("normal reading shows only chapters not already consumed by a recovery extra", async () => {
  const g = plan(); g.planDays[1].segments[0].label = "Rdz 2-4";
  const f = mount(g); await act(async () => f.render());
  await click("Rdz 1"); await act(async () => f.writes[0].resolve());
  await click("Rdz 2"); // A partial range is local until every chapter is read.
  expect(f.writes).toHaveLength(1);
  await click("Wyłącz nadrabianie"); await click("Następne");
  expect(button("Rdz 3 · Rdz 4").getAttribute("aria-pressed")).toBe("false");
  await click("Rdz 3 · Rdz 4");
  expect(f.writes[1]).toMatchObject({ id: "s1", completed: true });
  await act(async () => f.writes[1].resolve());
  expect(f.group.progress.m.s1).toBeDefined();
});

it("returns to earlier unread history after an explicit uncheck without losing it from the schedule", async () => {
  const g = plan(); g.progress.m = { s0: "done", s1: "done" };
  const f = mount(g); await act(async () => f.render());
  await click("Poprzednie"); await click("Rdz 2");
  await act(async () => f.writes[0].resolve());
  expect(container.querySelector(".simple-readings strong")?.textContent).toBe("Rdz 2");
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("false");
  expect(container.querySelector('.reading-date[aria-pressed="true"]')?.getAttribute("data-day-id")).toBe(`recovery:${TODAY}`);
});

it("keeps a notification's selected day when a stale recovery flag is cleared", async () => {
  const g = plan(); g.progress.m = Object.fromEntries(g.planDays.slice(0, 4).map(day => [day.segments[0].id, "done"]));
  window.history.replaceState({}, "", "/?reading=g&day=d1");
  const f = mount(g); await act(async () => f.render());
  expect(container.querySelector(".reading-card-head time")?.getAttribute("datetime")).toBe(date(-3));
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("true");
});

it("rapid check and uncheck preserve the final intent when the first request fails", async () => {
  const f = mount(plan()); await act(async () => f.render());
  await click("Rdz 1"); await click("Rdz 1");
  await act(async () => f.writes[0].reject());
  expect(f.writes[1]).toMatchObject({ id: "s0", completed: false });
  await act(async () => f.writes[1].resolve());
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("false");
  expect(JSON.parse(localStorage.getItem(`${KEY}:chapters`) ?? "{}").s0).toBe(0);
});

it("does not mistake a stale daily completion flag for a read extra chapter", async () => {
  const g = plan();
  const portion = projectRecoveryPortions(g, "m", TODAY, {}, "")[0];
  g.progress.m.s0 = "done";
  localStorage.setItem(`${KEY}:ordered:${TODAY}:portion-v3`, JSON.stringify(portion));
  localStorage.setItem(`${KEY}:ordered:${TODAY}`, JSON.stringify({ reading: portion.extra, completed: true }));
  const f = mount(g); await act(async () => f.render());
  expect(button("Rdz 2").getAttribute("aria-pressed")).toBe("false");
});

it("keeps reading usable if the larger forecast cache cannot fit in storage", async () => {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key.endsWith(":schedule-v1")) throw new DOMException("full", "QuotaExceededError");
    setItem.call(this, key, value);
  });
  const f = mount(plan()); await act(async () => f.render());
  expect(button("Rdz 1")).toBeDefined();
  await click("Następne"); expect(button("Rdz 3")).toBeDefined();
});

it("keeps the normal daily chapter quota after a partial range without assuming an earlier forecast chapter read", async () => {
  const g = plan(5);
  g.planDays[0].segments.push({ id: "nt", label: "Mt 1", section: "NT" });
  g.planDays[1].segments[0].label = "Rdz 2-3";
  g.planDays.slice(2).forEach((day, i) => { day.segments[0].label = `Rdz ${i + 4}`; });
  const f = mount(g); await act(async () => f.render());
  await click("Następne");
  expect([...container.querySelectorAll(".simple-readings strong")].map(node => node.textContent)).toEqual(["Rdz 3", "Rdz 4", "Rdz 5"]);
  await click("Rdz 3"); expect(f.writes).toHaveLength(0);
  expect(button("Rdz 5").disabled).toBe(true);
  await click("Rdz 4"); await act(async () => f.writes[0].resolve());
  expect(button("Rdz 5").disabled).toBe(false);
  await click("Rdz 5"); await act(async () => f.writes[1].resolve());
  expect(f.group.progress.m.s1).toBeUndefined();
  expect(f.group.progress.m.s2).toBeDefined();
  expect(f.group.progress.m.s3).toBeDefined();
});

it("does not resurrect a confirmed segment that was unchecked on another device", async () => {
  localStorage.setItem(`${KEY}:chapters`, JSON.stringify({ s0: 1 }));
  localStorage.setItem(`${KEY}:confirmed-segments`, JSON.stringify({ s0: 1 }));
  const f = mount(plan(), false, false); await act(async () => f.render());
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("true");
  await act(async () => f.refresh(plan()));
  expect(button("Rdz 1").getAttribute("aria-pressed")).toBe("false");
  expect(f.writes).toHaveLength(0);
});
