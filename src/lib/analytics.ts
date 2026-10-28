import type { Group } from "../types";
import type { CaptureResult, PostHog } from "posthog-js";

type EventName = "$pageview" | "plan_opened" | "reading_progress_saved" | "reading_day_completed";
type Properties = Record<string, string | number | boolean>;

let started = false;
let client: Pick<PostHog, "capture"> | undefined;
const pending: Array<{ event: EventName; properties?: Properties }> = [];
const opened = new Set<string>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const templates = ["mcheyne_365", "custom_csv", "unknown"];

function planProperties(group: Group): Properties | undefined {
  if (group.analyticsDisabled || !group.analyticsPlanId || !uuid.test(group.analyticsPlanId)) return;
  return { plan_id: group.analyticsPlanId, plan_version: group.planVersion ?? 0,
    plan_template: group.planTemplate ?? "unknown", analytics_schema: 2 };
}

function send(event: EventName, properties?: Properties) {
  if (!started) return;
  try {
    if (client) {
      if (properties) client.capture(event, properties);
      else client.capture(event);
    } else if (pending.length < 20) pending.push({ event, properties: properties && { ...properties } });
  } catch { /* Analytics must never interrupt reading or progress saves. */ }
}

export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || !["$pageview", "plan_opened", "reading_progress_saved", "reading_day_completed"].includes(event.event)) return null;
  // Explicit, per-event property allowlists keep names, credentials, filenames,
  // invitation URLs and automatically supplied person properties out of events.
  const safe: Record<string, unknown> = {};
  for (const key of ["token", "distinct_id", "$device_id", "$session_id", "$window_id", "$lib", "$lib_version", "$browser", "$os"]) {
    if (key in event.properties) safe[key] = event.properties[key];
  }
  if (event.event !== "$pageview") {
    const p = event.properties;
    if (typeof p.plan_id !== "string" || !uuid.test(p.plan_id) ||
      !Number.isSafeInteger(p.plan_version) || p.plan_version < 0 ||
      !templates.includes(p.plan_template) || p.analytics_schema !== 2) return null;
    Object.assign(safe, { plan_id: p.plan_id, plan_version: p.plan_version,
      plan_template: p.plan_template, analytics_schema: 2 });
    if (event.event !== "plan_opened") {
      if (!Number.isInteger(p.day_number) || p.day_number < 1 || p.day_number > 5000) return null;
      safe.day_number = p.day_number;
    }
    if (event.event === "reading_progress_saved") {
      if (typeof p.completed !== "boolean") return null;
      safe.completed = p.completed;
    }
  }
  event.properties = { ...safe, $current_url: "https://plan-czytania.netlify.app/",
    $host: "plan-czytania.netlify.app", $pathname: "/", $title: "Plan czytania Biblii",
    $referrer: "", $referring_domain: "", $process_person_profile: false };
  delete event.$set;
  delete event.$set_once;
  return event;
}

export function trackPlanOpened(group: Group) {
  const properties = planProperties(group);
  if (!started || !properties) return;
  const key = `${properties.plan_id}:${properties.plan_version}`;
  if (opened.has(key)) return;
  opened.add(key);
  send("plan_opened", properties);
}

export async function startAnalytics() {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
  const host = import.meta.env.VITE_POSTHOG_HOST;
  if (started || import.meta.env.VITE_DEPLOY_CONTEXT !== "production" ||
    window.location.hostname !== "plan-czytania.netlify.app" || navigator.webdriver ||
    typeof token !== "string" || !token.startsWith("phc_") || !host) return;

  started = true;
  try {
    if (new URL(host).protocol !== "https:") throw new Error("Invalid analytics host");
    const { default: posthog } = await import("posthog-js");
    posthog.init(token, {
      api_host: host, defaults: "2026-08-30",
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_dead_clicks: false, rageclick: false,
      capture_exceptions: false, capture_performance: false, capture_heatmaps: false,
      disable_session_recording: true, enable_recording_console_log: false,
      disable_surveys: true, disable_product_tours: true,
      advanced_disable_flags: true, disable_external_dependency_loading: true,
      persistence: "memory", disable_persistence: true, person_profiles: "never", ip: false,
      before_send: sanitizeAnalyticsEvent,
      loaded: instance => {
        client = instance;
        send("$pageview");
        for (const { event, properties } of pending.splice(0)) send(event, properties);
      },
    });
  } catch {
    pending.length = 0;
    client = undefined;
    started = false;
  }
}

// Attribute only the operation that this device actually saved. A response may
// also contain progress from another device; that is not a second local action.
export function trackSavedReading(before: Group, after: Group, memberId: string,
  operation: { segmentId: string; completed: boolean }) {
  if (before.id !== after.id || (before.planVersion ?? 0) !== (after.planVersion ?? 0)) return;
  const properties = planProperties(after);
  if (!properties) return;
  const previous = before.progress[memberId] ?? {};
  const current = after.progress[memberId] ?? {};
  const dayIndex = after.planDays.findIndex(day => day.segments.some(segment => segment.id === operation.segmentId));
  const day = after.planDays[dayIndex];
  const oldDay = before.planDays.find(candidate => candidate.id === day?.id);
  if (!day || !oldDay || !oldDay.segments.some(segment => segment.id === operation.segmentId) ||
    Boolean(current[operation.segmentId]) !== operation.completed ||
    Boolean(previous[operation.segmentId]) === operation.completed) return;
  const context = { ...properties, day_number: dayIndex + 1 };
  send("reading_progress_saved", { ...context, completed: operation.completed });
  // Recovery portions may contain parts of several original plan days.
  if (operation.completed && day.segments.length > 0 &&
    day.segments.every(segment => current[segment.id]) &&
    !oldDay.segments.every(segment => previous[segment.id])) {
    send("reading_day_completed", context);
  }
}
