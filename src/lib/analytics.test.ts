// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Group } from "../types";
import type { CaptureResult, PostHog, PostHogConfig } from "posthog-js";
const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_DEPLOY_CONTEXT", "production");
  vi.stubEnv("VITE_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubGlobal("window", { location: { hostname: "plan-czytania.netlify.app", search: "?invite=private-token" } });
  vi.stubGlobal("navigator", { webdriver: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function tracker(load = true) {
  sdk.init.mockImplementation((_token: string, options: PostHogConfig) => {
    if (load) options.loaded?.(sdk as unknown as PostHog);
    return sdk;
  });
  const analytics = await import("./analytics");
  await analytics.startAnalytics();
  const options = sdk.init.mock.calls[0]?.[1] as PostHogConfig;
  return { ...analytics, options, count: sdk.capture };
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
  ["development", "plan-czytania.netlify.app", false, "phc_test"],
  ["branch-deploy", "plan-czytania.netlify.app", false, "phc_test"],
  ["production", "main--plan-czytania.netlify.app", false, "phc_test"],
  ["production", "localhost", false, "phc_test"],
  ["production", "plan-czytania.netlify.app", true, "phc_test"],
  ["production", "plan-czytania.netlify.app", false, ""],
  ["production", "plan-czytania.netlify.app", false, "https://other.example"],
])("does not load analytics for %s / %s / automation=%s / code=%s", async (context, hostname, webdriver, code) => {
  vi.stubEnv("VITE_DEPLOY_CONTEXT", context);
  vi.stubEnv("VITE_POSTHOG_PROJECT_TOKEN", code);
  vi.stubGlobal("window", { location: { hostname } });
  vi.stubGlobal("navigator", { webdriver });
  const analytics = await import("./analytics");
  await analytics.startAnalytics();
  analytics.trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  expect(sdk.init).not.toHaveBeenCalled();
});

it("initializes once with automatic capture, persistent identity and replay disabled", async () => {
  const { startAnalytics, options, count } = await tracker();
  await startAnalytics();
  expect(sdk.init).toHaveBeenCalledTimes(1);
  expect(sdk.init.mock.calls[0][0]).toBe("phc_test");
  expect(options).toMatchObject({ api_host: "https://eu.i.posthog.com", autocapture: false,
    capture_pageview: false, capture_pageleave: false, disable_session_recording: true,
    capture_exceptions: false, capture_performance: false, capture_heatmaps: false,
    person_profiles: "never", disable_persistence: true, persistence: "memory", advanced_disable_flags: true });
  expect(count.mock.calls).toEqual([["$pageview"]]);
});

it("removes private URLs, application identities and person properties before transmission", async () => {
  const { sanitizeAnalyticsEvent } = await import("./analytics");
  const event = sanitizeAnalyticsEvent({ event: "$pageview", properties: {
    distinct_id: "anonymous", token: "phc_test", $lib: "web", $current_url: "https://example.com/?invite=secret",
    $initial_current_url: "https://example.com/?token=secret", $referrer: "https://example.com/private",
    $set: { email: "private@example.com" }, name: "Private person", groupId: "private-group",
  }, $set: { name: "Private person" }, $set_once: { invitation: "secret" } } as unknown as CaptureResult)!;
  expect(event.properties).toEqual({ distinct_id: "anonymous", token: "phc_test", $lib: "web",
    $current_url: "https://plan-czytania.netlify.app/", $host: "plan-czytania.netlify.app",
    $pathname: "/", $title: "Plan czytania Biblii", $referrer: "", $referring_domain: "", $process_person_profile: false });
  expect(event.$set).toBeUndefined();
  expect(event.$set_once).toBeUndefined();
  expect(sanitizeAnalyticsEvent(null)).toBeNull();
  expect(sanitizeAnalyticsEvent({ event: "$autocapture", properties: {} } as CaptureResult)).toBeNull();
});

it("counts only a newly completed original day after confirmed progress", async () => {
  const { trackSavedReading, count } = await tracker();
  count.mockClear();
  const empty = group(), partial = group({ a: "read" }), full = group({ a: "read", b: "read" });
  trackSavedReading(empty, partial, "member");
  expect(count).not.toHaveBeenCalled();
  trackSavedReading(partial, full, "member");
  expect(count.mock.calls).toEqual([["reading_day_completed"]]);
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
  const { trackSavedReading, options, count } = await tracker(false);
  trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  expect(count).not.toHaveBeenCalled();
  options.loaded?.(sdk as unknown as PostHog);
  expect(count).toHaveBeenCalledTimes(2);
  count.mockImplementation(() => { throw new Error("Tracker unavailable"); });
  expect(() => trackSavedReading(group(), group({ a: "read", b: "read" }), "member")).not.toThrow();
});

it("tolerates an SDK initialization failure without interrupting the app", async () => {
  sdk.init.mockImplementation(() => { throw new Error("SDK blocked"); });
  const analytics = await import("./analytics");
  const start = analytics.startAnalytics();
  analytics.trackSavedReading(group(), group({ a: "read", b: "read" }), "member");
  await expect(start).resolves.toBeUndefined();
  expect(sdk.capture).not.toHaveBeenCalled();
});
