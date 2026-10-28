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
  return { analyticsPlanId: "11111111-1111-4111-8111-111111111111", planTemplate: "custom_csv", id: "private-group", name: "Private group name", createdAt: "", startDate: "2026-10-01",
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
  analytics.trackSavedReading(group(), group({ a: "read", b: "read" }), "member", { segmentId: "b", completed: true });
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

const context = { plan_id: "11111111-1111-4111-8111-111111111111", plan_version: 0,
  plan_template: "custom_csv", analytics_schema: 2 };

it("opens each plan version once per page, including StrictMode effects and refreshes", async () => {
  const { trackPlanOpened, count } = await tracker();
  count.mockClear();
  trackPlanOpened(group()); trackPlanOpened(group());
  trackPlanOpened({ ...group(), planVersion: 1 });
  trackPlanOpened({ ...group(), analyticsPlanId: "22222222-2222-4222-8222-222222222222" });
  trackPlanOpened({ ...group(), analyticsDisabled: true });
  trackPlanOpened({ ...group(), analyticsPlanId: undefined });
  expect(count.mock.calls).toEqual([
    ["plan_opened", context], ["plan_opened", { ...context, plan_version: 1 }],
    ["plan_opened", { ...context, plan_id: "22222222-2222-4222-8222-222222222222" }],
  ]);
});

it("preserves only typed per-plan properties and rejects malformed events", async () => {
  const { sanitizeAnalyticsEvent: sanitize } = await tracker();
  const event = (name: string, extra = {}) => ({ event: name, properties: { ...context, day_number: 1,
    completed: true, member_id: "private", filename: "private.csv", group_name: "private", ...extra } } as unknown as CaptureResult);
  expect(sanitize(event("reading_progress_saved"))!.properties).toMatchObject({ ...context, day_number: 1, completed: true });
  const day = sanitize(event("reading_day_completed"))!.properties;
  expect(day).not.toHaveProperty("completed");
  for (const key of ["member_id", "filename", "group_name"]) expect(day).not.toHaveProperty(key);
  expect(sanitize(event("plan_opened"))!.properties).not.toHaveProperty("day_number");
  for (const bad of [{ plan_id: "private-group" }, { plan_version: -1 }, { plan_version: 1.5 },
    { plan_template: "private name" }, { analytics_schema: 1 }, { completed: "true" },
    { day_number: 0 }, { day_number: 5001 }]) {
    expect(sanitize(event("reading_progress_saved", bad))).toBeNull();
  }
});

it("counts confirmed partial, full and unchecked progress only for the saved operation", async () => {
  const { trackSavedReading: track, count } = await tracker();
  count.mockClear();
  const empty = group(), partial = group({ a: "read" }), full = group({ a: "read", b: "read" });
  track(empty, partial, "member", { segmentId: "a", completed: true });
  track(partial, full, "member", { segmentId: "b", completed: true });
  track(full, full, "member", { segmentId: "b", completed: true });
  track(full, partial, "member", { segmentId: "b", completed: false });
  expect(count.mock.calls).toEqual([
    ["reading_progress_saved", { ...context, day_number: 1, completed: true }],
    ["reading_progress_saved", { ...context, day_number: 1, completed: true }],
    ["reading_day_completed", { ...context, day_number: 1 }],
    ["reading_progress_saved", { ...context, day_number: 1, completed: false }],
  ]);
  // Re-completing an unchecked day is another action, not a unique completion.
  track(partial, full, "member", { segmentId: "b", completed: true });
  expect(count).toHaveBeenCalledTimes(6);
});

it("ignores mismatched plans, unconfirmed operations, missing metadata and synthetic plans", async () => {
  const { trackSavedReading: track, count } = await tracker();
  count.mockClear();
  const empty = group(), full = group({ a: "read", b: "read" });
  for (const next of [{ ...full, id: "another" }, { ...full, planVersion: 2 },
    { ...full, analyticsPlanId: undefined }, { ...full, analyticsDisabled: true }]) {
    track(empty, next, "member", { segmentId: "b", completed: true });
  }
  track(empty, full, "another-member", { segmentId: "b", completed: true });
  track(empty, full, "member", { segmentId: "absent", completed: true });
  track(empty, full, "member", { segmentId: "b", completed: false });
  track(empty, group({ a: "read" }), "member", { segmentId: "b", completed: true });
  expect(count).not.toHaveBeenCalled();
});

it("does not attribute another device's completed day to the local saved segment", async () => {
  const { trackSavedReading: track, count } = await tracker();
  const before = group(), after = group({ a: "read", b: "read", c: "read" });
  const otherDay = { id: "other", index: 2, date: "2026-10-03", title: "Other", segments: [{ id: "c", label: "Other", section: "" }] };
  before.planDays.push(otherDay); after.planDays.push(otherDay);
  count.mockClear();
  track(before, after, "member", { segmentId: "c", completed: true });
  expect(count.mock.calls).toEqual([
    ["reading_progress_saved", { ...context, day_number: 3, completed: true }],
    ["reading_day_completed", { ...context, day_number: 3 }],
  ]);
});

it("waits for a successful save including rollback and retry, passing the exact operation", async () => {
  const { trackSavedReading, count } = await tracker();
  const { createOptimisticProgressQueue } = await import("./optimistic-progress");
  const initial = group({ a: "read" });
  let resolve!: (group: Group) => void;
  let reject!: (error: Error) => void;
  let confirmed = initial;
  const queue = createOptimisticProgressQueue({ group: initial, memberId: "member",
    save: () => new Promise<Group>((yes, no) => { resolve = yes; reject = no; }),
    onChange: () => {}, onError: () => {},
    onSave: (next, operation) => { trackSavedReading(confirmed, next, "member", operation); confirmed = next; },
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
  expect(count.mock.calls).toEqual([
    ["reading_progress_saved", { ...context, day_number: 1, completed: true }],
    ["reading_day_completed", { ...context, day_number: 1 }],
  ]);
});

it("flushes early events with their original plan context and tolerates analytics failures", async () => {
  const { trackPlanOpened, trackSavedReading, options, count } = await tracker(false);
  const plan = group();
  trackPlanOpened(plan);
  trackSavedReading(plan, group({ a: "read", b: "read" }), "member", { segmentId: "b", completed: true });
  plan.planVersion = 99;
  expect(count).not.toHaveBeenCalled();
  options.loaded?.(sdk as unknown as PostHog);
  expect(count.mock.calls).toEqual([["$pageview"], ["plan_opened", context],
    ["reading_progress_saved", { ...context, day_number: 1, completed: true }],
    ["reading_day_completed", { ...context, day_number: 1 }]]);
  count.mockImplementation(() => { throw new Error("Tracker unavailable"); });
  expect(() => trackSavedReading(group(), group({ a: "read", b: "read" }), "member", { segmentId: "b", completed: true })).not.toThrow();
});

it("tolerates an SDK initialization failure without interrupting the app", async () => {
  sdk.init.mockImplementation(() => { throw new Error("SDK blocked"); });
  const analytics = await import("./analytics");
  const start = analytics.startAnalytics();
  analytics.trackSavedReading(group(), group({ a: "read", b: "read" }), "member", { segmentId: "b", completed: true });
  await expect(start).resolves.toBeUndefined();
  expect(sdk.capture).not.toHaveBeenCalled();
});
