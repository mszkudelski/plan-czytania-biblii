// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { installErrorTracking, reactErrorHandlers, sanitizeExceptionProperties } from "./error-tracking";

const release = "a".repeat(40);
const frame = { platform: "web:javascript", filename: "https://plan-czytania.netlify.app/assets/index-abc.js?invite=secret#private",
  function: "Private name", lineno: 12, colno: 34, vars: { token: "secret" }, context_line: "private CSV" };
const exception = { type: "TypeError", value: "Private name and access token", stacktrace: { type: "raw", frames: [frame] } };
afterEach(() => vi.restoreAllMocks());

it("removes dynamic error text, URLs, values, context and functions while preserving an actionable frame", () => {
  const result = sanitizeExceptionProperties({ error_source: "window_error", app_release: release,
    $exception_list: [exception], $exception_steps: [{ message: "private CSV" }], $exception_fingerprint: "secret" });
  expect(result).toEqual({ $exception_level: "error", error_source: "window_error", app_release: release,
    $exception_list: [{ type: "TypeError", value: "Exception message redacted",
      mechanism: { type: "window_error", handled: false, synthetic: false, exception_id: 0 },
      stacktrace: { type: "raw", frames: [{ platform: "web:javascript", filename: "https://plan-czytania.netlify.app/assets/index-abc.js", function: "?",
        lineno: 12, colno: 34, in_app: true }] } }] });
});

it("retains only fixed native/React diagnostics and normalizes custom exception names", () => {
  const messages = [
    ["Cannot read properties of undefined (reading 'Private name')", "Cannot read properties of undefined"],
    ["Minified React error #310; visit https://react.dev/errors/310?args[]=secret", "Minified React error #310"],
    ["Failed to fetch", "Failed to fetch"],
    ["secret token or participant name", "Exception message redacted"],
  ];
  for (const [value, expected] of messages) {
    const result = sanitizeExceptionProperties({ error_source: "react_caught", $exception_list: [{ type: "Private name", value }] });
    expect(result!.$exception_list[0]).toMatchObject({ type: "Error", value: expected, mechanism: { handled: true } });
  }
  expect(sanitizeExceptionProperties({ error_source: "private", $exception_list: [exception] })).toBeUndefined();
  expect(sanitizeExceptionProperties({ error_source: "window_error", $exception_list: [] })).toBeUndefined();
});

it("drops extension, blob, file, API and external stack URLs and rejects invalid line numbers", () => {
  const filenames = ["chrome-extension://id/private.js", "https://private.example/secret.js", "blob:https://plan-czytania.netlify.app/secret",
    "file:///private/secret.js", "https://plan-czytania.netlify.app/api/groups/private", "https://plan-czytania.netlify.app/?token=secret"];
  const result = sanitizeExceptionProperties({ error_source: "unhandled_rejection", app_release: "private", $exception_list: [{
    ...exception, stacktrace: { type: "raw", frames: [...filenames.map(filename => ({ ...frame, filename })),
      { ...frame, lineno: -5, colno: Infinity }] },
  }] });
  expect(result!.$exception_list[0].stacktrace!.frames).toHaveLength(1);
  expect(result!.$exception_list[0].stacktrace!.frames[0]).toMatchObject({ lineno: undefined, colno: undefined });
  expect(result).not.toHaveProperty("app_release");
});

it("captures browser exceptions and rejected promises, ignores load failures and cleans up without canceling events", () => {
  const target = new EventTarget(), report = vi.fn();
  const stop = installErrorTracking(report, target);
  const error = new TypeError("private");
  const event = new ErrorEvent("error", { error, cancelable: true });
  target.dispatchEvent(event);
  const rejection = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(rejection, "reason", { value: error });
  target.dispatchEvent(rejection);
  target.dispatchEvent(new Event("error"));
  expect(report.mock.calls).toEqual([[error, "window_error"], [error, "unhandled_rejection"]]);
  expect(event.defaultPrevented).toBe(false);
  expect(rejection.defaultPrevented).toBe(false);
  stop(); target.dispatchEvent(event); target.dispatchEvent(rejection);
  expect(report).toHaveBeenCalledTimes(2);
});

it("reports actual React root failures and errors caught by a boundary", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const report = vi.fn(), container = document.createElement("div");
  const root = createRoot(container, reactErrorHandlers(report));
  const failure = new TypeError("private");
  function Broken(): ReactNode { throw failure; }
  class Boundary extends Component<{ children: ReactNode }, { broken: boolean }> {
    state = { broken: false };
    static getDerivedStateFromError() { return { broken: true }; }
    render() { return this.state.broken ? <p>Fallback</p> : this.props.children; }
  }
  try {
    await act(async () => root.render(<Boundary><Broken /></Boundary>));
    expect(container.textContent).toBe("Fallback");
    expect(report).toHaveBeenCalledWith(failure, "react_caught");
    report.mockClear();
    // React forwards uncaught errors to act itself while an act queue is open.
    // Render outside act to exercise the actual production root callback.
    flushSync(() => root.render(<Broken />));
    expect(report).toHaveBeenCalledWith(failure, "react_uncaught");
    const recover = reactErrorHandlers(report).onRecoverableError!;
    recover(failure, { componentStack: "private" });
    expect(report).toHaveBeenCalledWith(failure, "react_recoverable");
  } finally { await act(async () => root.unmount()); }
});
