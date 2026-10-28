// @vitest-environment jsdom
import { expect, it } from "vitest";
import { PostHog, type CaptureResult } from "posthog-js";
import { sanitizeAnalyticsEvent } from "./analytics";

it("keeps the real SDK exception format ingestible after privacy filtering, without external code or requests", () => {
  const client = new PostHog();
  const events: CaptureResult[] = [];
  client.init("phc_test", {
    api_host: "https://example.invalid", defaults: "2026-08-30",
    autocapture: false, capture_pageview: false, capture_pageleave: false,
    capture_dead_clicks: false, rageclick: false, capture_exceptions: false,
    capture_performance: false, capture_heatmaps: false, disable_session_recording: true,
    disable_surveys: true, disable_product_tours: true, advanced_disable_flags: true,
    disable_external_dependency_loading: true, persistence: "memory", disable_persistence: true,
    person_profiles: "never", error_tracking: { exception_steps: { enabled: false } },
    before_send: event => {
      const sanitized = sanitizeAnalyticsEvent(event);
      if (sanitized) events.push(sanitized);
      return null; // Verify serialization; do not send unit-test events.
    },
  });
  const error = new TypeError("Private name and token");
  error.stack = "TypeError: Private name and token\n    at render (https://plan-czytania.netlify.app/assets/index-test.js?invite=secret:123:45)";
  client.captureException(error, { error_source: "react_uncaught", app_release: "a".repeat(40) });
  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("$exception");
  expect(events[0].properties.$exception_list).toMatchObject([{ type: "TypeError", value: "Exception message redacted",
    stacktrace: { type: "raw", frames: [{ filename: "https://plan-czytania.netlify.app/assets/index-test.js", function: "?", lineno: 123, colno: 45 }] } }]);
  expect(JSON.stringify(events)).not.toContain("Private name");
  expect(JSON.stringify(events)).not.toContain("secret");
});
