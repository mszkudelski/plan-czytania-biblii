import type { RootOptions } from "react-dom/client";

export type ErrorSource = "window_error" | "unhandled_rejection" | "react_uncaught" | "react_caught" | "react_recoverable";
export type ExceptionReporter = (error: unknown, source: ErrorSource) => void;
const sources: ErrorSource[] = ["window_error", "unhandled_rejection", "react_uncaught", "react_caught", "react_recoverable"];
const types = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError", "AggregateError", "InternalError", "DOMException"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

// Error messages can embed CSV contents, participant names, access codes or
// URLs. Keep only known static diagnostics; never send an arbitrary message.
function diagnostic(value: unknown) {
  if (typeof value !== "string") return "Exception message redacted";
  for (const message of ["Cannot read properties of undefined", "Cannot read properties of null",
    "Cannot set properties of undefined", "Cannot set properties of null", "Maximum update depth exceeded",
    "Rendered more hooks than during the previous render", "Rendered fewer hooks than expected"]) {
    if (value.startsWith(message)) return message;
  }
  if (["Failed to fetch", "Load failed", "Script error."].includes(value)) return value;
  const react = value.match(/^Minified React error #(\d{1,4});/);
  return react ? `Minified React error #${react[1]}` : "Exception message redacted";
}

function safeFrame(value: unknown) {
  const frame = record(value);
  if (typeof frame.filename !== "string") return;
  try {
    const url = new URL(frame.filename, "https://plan-czytania.netlify.app");
    if (url.origin !== "https://plan-czytania.netlify.app" ||
      !/^\/assets\/[A-Za-z0-9_.-]{1,140}\.js$/.test(url.pathname)) return;
    const number = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000_000 ? value : undefined;
    // Cymbal requires a function field, even when the original is redacted.
    return { platform: "web:javascript", filename: url.origin + url.pathname, function: "?",
      lineno: number(frame.lineno), colno: number(frame.colno), in_app: true };
  } catch { return; }
}

export function sanitizeExceptionProperties(properties: Record<string, unknown>) {
  const source = sources.includes(properties.error_source as ErrorSource) ? properties.error_source as ErrorSource : undefined;
  const input = properties.$exception_list;
  if (!source || !Array.isArray(input) || !input.length) return;
  const exceptions = input.slice(0, 5).map((value, index) => {
    const exception = record(value), trace = record(exception.stacktrace);
    const frames = (Array.isArray(trace.frames) ? trace.frames : []).slice(-40).map(safeFrame).filter(frame => frame !== undefined);
    return { type: types.includes(exception.type as string) ? exception.type as string : "Error",
      value: diagnostic(exception.value),
      mechanism: { type: source, handled: source === "react_caught" || source === "react_recoverable",
        synthetic: record(exception.mechanism).synthetic === true, exception_id: index },
      ...(frames.length ? { stacktrace: { type: "raw", frames } } : {}),
    };
  });
  return { $exception_list: exceptions, $exception_level: source === "react_recoverable" ? "warning" : "error",
    error_source: source, ...(typeof properties.app_release === "string" && /^[a-f0-9]{40}$/.test(properties.app_release)
      ? { app_release: properties.app_release } : {}) };
}

// Register before the SDK's lazy import so startup exceptions can be queued.
// These listeners never cancel the browser's normal error handling.
export function installErrorTracking(report: ExceptionReporter,
  target: Pick<EventTarget, "addEventListener" | "removeEventListener"> = window) {
  const onError = (event: Event) => {
    if (!(event instanceof ErrorEvent)) return; // Ignore resource-load events.
    report(event.error ?? new Error(event.message), "window_error");
  };
  const onRejection = (event: Event) => report((event as PromiseRejectionEvent).reason, "unhandled_rejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

export function reactErrorHandlers(report: ExceptionReporter): RootOptions {
  const handler = (source: ErrorSource) => (error: unknown) => {
    report(error, source);
    // Preserve local diagnostics; console capture remains disabled in PostHog.
    console.error(error);
  };
  return { onUncaughtError: handler("react_uncaught"), onCaughtError: handler("react_caught"),
    onRecoverableError: handler("react_recoverable") };
}
