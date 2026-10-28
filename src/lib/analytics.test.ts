// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Group } from "../types";

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = "";
  vi.stubEnv("VITE_DEPLOY_CONTEXT", "production");
  vi.stubEnv("VITE_GOATCOUNTER_CODE", "plan-czytania-biblii");
  vi.stubGlobal("window", { location: { hostname: "plan-czytania.netlify.app", search: "?invite=private-token" } });
  vi.stubGlobal("navigator", { webdriver: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function tracker(load = true) {
  const analytics = await import("./analytics");
  analytics.startAnalytics();
  const script = document.querySelector<HTMLScriptElement>("script[data-goatcounter]")!;
  const count = vi.fn();
  window.goatcounter!.count = count;
  if (load) script.dispatchEvent(new Event("load"));
  return { ...analytics, script, count };
}

function group(progress: Record<string, string> = {}): Group {
  return { id: "private-group", name: "Private group name", createdAt: "", startDate: "2026-10-01",
    frequency: { kind: "daily", days: [] }, members: [], progress: { member: progress },
    planDays: [
      { id: "d0", index: 0, date: "2026-10-01", title: "Private title", segments: [
        { id: "a", label: "Rdz 1", section: "ST" }, { id: "b", label: "Mt 1", section: "NT" },
      ] },
      { id: "empty", index: 1, date: "2026-10-02", title: "Empty", segments: [] },
    ] };
}

it.each([
  ["development", "plan-czytania.netlify.app", false, "plan-czytania-biblii"],
  ["branch-deploy", "plan-czytania.netlify.app", false, "plan-czytania-biblii"],
  ["production", "main--plan-czytania.netlify.app", false, "plan-czytania-biblii"],
  ["production", "localhost", false, "plan-czytania-biblii"],
  ["production", "plan-czytania.netlify.app", true, "plan-czytania-biblii"],
  ["production", "plan-czytania.netlify.app", false, ""],
  ["production", "plan-czytania.netlify.app", false, "https://other.example"],
])("does not load analytics for %s / %s / automation=%s / code=%s", async (context, hostname, webdriver, code) => {
  vi.stubEnv("VITE_DEPLOY_CONTEXT", context);
  vi.stubEnv("VITE_GOATCOUNTER_CODE", code);
  vi.stubGlobal("window", { location: { hostname } });
  vi.stubGlobal("navigator", { webdriver });
  const analytics = await import("./analytics");
  analytics.startAnalytics();
  analytics.trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  expect(document.querySelector("script[data-goatcounter]")).toBeNull();
});

it("loads once and sends a fixed pageview without private URL parameters", async () => {
  const { startAnalytics, script, count } = await tracker();
  startAnalytics();
  expect(document.querySelectorAll("script[data-goatcounter]")).toHaveLength(1);
  expect(script.src).toBe("https://gc.zgo.at/count.js");
  expect(script.referrerPolicy).toBe("no-referrer");
  expect(script.dataset.goatcounter).toBe("https://plan-czytania-biblii.goatcounter.com/count");
  expect(count.mock.calls).toEqual([[{ path: "/", title: "Plan czytania Biblii", referrer: "" }]]);
});

it("counts only a newly completed original day after confirmed progress", async () => {
  const { trackSavedReading, count } = await tracker();
  count.mockClear();
  const empty = group(), partial = group({ a: "read" }), full = group({ a: "read", b: "read" });
  trackSavedReading(empty, partial, "member");
  expect(count).not.toHaveBeenCalled();
  trackSavedReading(partial, full, "member");
  expect(count.mock.calls).toEqual([[{ path: "reading_day_completed", title: "Ukończony dzień planu", referrer: "", event: true, no_session: true }]]);
  trackSavedReading(full, full, "member");
  trackSavedReading(full, partial, "member");
  trackSavedReading(empty, { ...full, id: "another-group" }, "member");
  trackSavedReading(empty, { ...full, planVersion: 2 }, "member");
  trackSavedReading(empty, full, "another-member");
  expect(count).toHaveBeenCalledTimes(1);
});

it("waits for an actual successful save, including rollback and retry", async () => {
  const { trackSavedReading, count } = await tracker();
  const { createOptimisticProgressQueue } = await import("./optimistic-progress");
  const initial = group({ a: "read" });
  let resolve!: (group: Group) => void;
  let reject!: (error: Error) => void;
  let confirmed = initial;
  const queue = createOptimisticProgressQueue({ group: initial, memberId: "member",
    save: () => new Promise<Group>((yes, no) => { resolve = yes; reject = no; }),
    onChange: () => {}, onError: () => {},
    onSave: next => { trackSavedReading(confirmed, next, "member"); confirmed = next; },
  });
  count.mockClear();
  const failed = queue.toggle("b", true);
  expect(count).not.toHaveBeenCalled();
  const rejection = expect(failed).rejects.toThrow("Save rejected");
  reject(new Error("Save rejected"));
  await rejection;
  expect(count).not.toHaveBeenCalled();
  const saved = queue.toggle("b", true);
  expect(count).not.toHaveBeenCalled();
  resolve(group({ a: "read", b: "read" }));
  await saved;
  expect(count).toHaveBeenCalledTimes(1);
});

it("flushes early events on load and tolerates blocked or throwing analytics", async () => {
  const { trackSavedReading, script, count } = await tracker(false);
  trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  expect(count).not.toHaveBeenCalled();
  script.dispatchEvent(new Event("load"));
  expect(count).toHaveBeenCalledTimes(2);
  count.mockImplementation(() => { throw new Error("Tracker unavailable"); });
  expect(() => trackSavedReading(group(), group({ a: "read", b: "read" }), "member")).not.toThrow();
});

it("drops queued events when the tracking script fails to load", async () => {
  const { trackSavedReading, script, count } = await tracker(false);
  trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  script.dispatchEvent(new Event("error"));
  trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  expect(count).not.toHaveBeenCalled();
});
