import { expect, it } from "vitest";
import type { Group } from "../types";
import { applyProgressLog, progressLogKey } from "./progress-log";
const timestamp = Date.parse("2026-10-03T12:00:00Z");
function fixture(): Group {
  return {
    id: "g", name: "G", createdAt: "", startDate: "2026-10-01",
    frequency: { kind: "daily", days: [] },
    members: [
      { id: "a", name: "A", color: "", isAdmin: true },
      { id: "b", name: "B", color: "", isAdmin: false },
    ],
    planDays: [{ id: "d", index: 0, date: "2026-10-01", title: "", segments: [
      { id: "s0", label: "Rdz 1", section: "" },
      { id: "s1", label: "Mt 1", section: "" },
    ] }],
    progress: { a: { s0: "legacy" }, b: {} },
  };
}
it("preserves concurrent independent readings and member isolation without mutating the baseline", () => {
  const group = fixture();
  const keys = [
    progressLogKey("g", "a", 0, true, timestamp, "a"),
    progressLogKey("g", "a", 1, true, timestamp, "b"),
    progressLogKey("g", "b", 0, true, timestamp, "c"),
  ];
  const original = JSON.stringify(group);
  const result = applyProgressLog(group, keys.reverse());
  expect(Object.keys(result.progress.a).sort()).toEqual(["s0", "s1"]);
  expect(Object.keys(result.progress.b)).toEqual(["s0"]);
  expect(JSON.stringify(group)).toBe(original);
});
it("replays check, uncheck and recheck in order regardless of listing order", () => {
  const keys = [
    progressLogKey("g", "a", 0, true, timestamp, "a"),
    progressLogKey("g", "a", 0, false, timestamp + 1, "b"),
    progressLogKey("g", "a", 0, true, timestamp + 2, "c"),
  ];
  expect(applyProgressLog(fixture(), keys.slice(0, 2).reverse()).progress.a.s0).toBeUndefined();
  expect(applyProgressLog(fixture(), keys.reverse()).progress.a.s0).toBe(new Date(timestamp + 2).toISOString());
});
it("keeps legacy readings and ignores corrupt, foreign or removed-member entries", () => {
  const group = fixture();
  const keys = [
    progressLogKey("other-group", "a", 0, false, timestamp, "a"),
    progressLogKey("g", "removed", 0, true, timestamp, "b"),
    progressLogKey("g", "a", 99, true, timestamp, "c"),
    "progress-v1/g/a/0/bad/0",
    "progress-v1/g/a/0/" + timestamp + "-d/2",
  ];
  expect(applyProgressLog(group, keys).progress).toEqual(group.progress);
});
