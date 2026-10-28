import type { Group } from "../types";
import type { CaptureResult, PostHog } from "posthog-js";

type EventName = "$pageview" | "reading_day_completed";

let started = false;
let client: Pick<PostHog, "capture"> | undefined;
const pending: EventName[] = [];

function send(event: EventName) {
  if (!started) return;
  try {
    if (client) client.capture(event);
    else if (pending.length < 20) pending.push(event);
  } catch { /* Analytics must never interrupt reading or progress saves. */ }
}

export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || (event.event !== "$pageview" && event.event !== "reading_day_completed")) return null;
  // Allow only SDK identifiers/metadata. Invitation URLs and person properties
  // can otherwise be added automatically, even without explicit identification.
  const safe: Record<string, unknown> = {};
  for (const key of ["token", "distinct_id", "$device_id", "$session_id", "$window_id", "$lib", "$lib_version", "$browser", "$os"]) {
    if (key in event.properties) safe[key] = event.properties[key];
  }
  event.properties = { ...safe, $current_url: "https://plan-czytania.netlify.app/",
    $host: "plan-czytania.netlify.app", $pathname: "/", $title: "Plan czytania Biblii",
    $referrer: "", $referring_domain: "", $process_person_profile: false };
  delete event.$set;
  delete event.$set_once;
  return event;
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
        for (const event of pending.splice(0)) send(event);
      },
    });
  } catch {
    pending.length = 0;
    client = undefined;
    started = false;
  }
}

// Count a transition after the server confirms a complete original plan day.
// Recovery portions may contain parts of several original days.
export function trackSavedReading(before: Group, after: Group, memberId: string) {
  if (before.id !== after.id || before.planVersion !== after.planVersion) return;
  const previous = before.progress[memberId] ?? {};
  const current = after.progress[memberId] ?? {};
  const days = new Map(before.planDays.map(day => [day.id, day]));
  for (const day of after.planDays) {
    const oldDay = days.get(day.id);
    if (oldDay && day.segments.length > 0 &&
      day.segments.every(segment => current[segment.id]) &&
      !oldDay.segments.every(segment => previous[segment.id])) {
      send("reading_day_completed");
    }
  }
}
