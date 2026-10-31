import { describe, expect, it } from "vitest";
import type { Group, PlanDay } from "../types";
import { PLAN_RESTORE_TTL, restoreGroupPlan, replaceGroupPlan, replacementSummary } from "./plan-replacement";
import { applyProgressLog, progressLogKey } from "./progress-log";

const time = Date.parse("2026-10-19T12:00:00Z");
function plan(labels: string[]): PlanDay[] {
  return labels.map((label, i) => ({ id: `d${i}`, index: i, date: "2026-10-20", title: "Nowy dzień",
    segments: [{ id: `s${i}`, label, section: "Nowy nagłówek" }] }));
}
function fixture(): Group {
  return { id: "g", name: "Grupa", createdAt: "", startDate: "2026-10-01",
    frequency: { kind: "daily", days: [] }, planDays: plan(["Rdz 1", "Mt 1-2", "Ps 1", "Ps 1"]),
    members: [{ id: "a", name: "A", color: "", isAdmin: true }, { id: "b", name: "B", color: "", isAdmin: false }],
    progress: { a: { s0: "legacy", s3: "second psalm" }, b: { s1: "other member" } } };
}
function replace(group: Group, labels: string[], revision = "v1") {
  return replaceGroupPlan(group, { planDays: plan(labels), startDate: "2026-10-20",
    frequency: { kind: "weekdays", days: [] }, expectedRevision: group.planRevision ?? "" }, revision);
}

describe("plan replacement", () => {
  it("retains dates and per-member timestamps by reading rather than position or CSV heading", () => {
    const group = fixture();
    const original = JSON.stringify(group);
    const next = replace(group, ["mt 1 – 2", "J 1", "  RDZ   1  "]);
    expect(next.planDays.map(day => day.segments[0].id)).toEqual(["s1", "plan-v1-segment-2", "s0"]);
    expect(next.progress).toEqual({ a: { s0: "legacy" }, b: { s1: "other member" } });
    expect(next.startDate).toBe("2026-10-20");
    expect(next.planDays[0].date).toBe("2026-10-20");
    expect(next.members).toEqual(group.members);
    expect(JSON.stringify(group)).toBe(original);
  });
  it("matches repeated readings one-to-one in occurrence order, without copying completion to new repeats", () => {
    const next = replace(fixture(), ["Ps 1", "Ps 1", "Ps 1"]);
    expect(next.planDays.map(day => day.segments[0].id)).toEqual(["s2", "s3", "plan-v1-segment-3"]);
    expect(next.progress.a).toEqual({ s3: "second psalm" });
    expect(replacementSummary(fixture(), plan(["Rdz 1", "J 1"]))).toEqual({
      matched: 1, total: 2, members: [
        { memberId: "a", name: "A", retained: 1, unmatched: 1, completedDays: 1 },
        { memberId: "b", name: "B", retained: 0, unmatched: 1, completedDays: 0 },
      ],
    });
  });
  it("counts complete new days per member, excluding partial days, new repeats and new passages", () => {
    const group = fixture();
    group.progress.a.s1 = "read Matthew";
    const next = plan(["Rdz 1", "Ps 1", "Ps 1", "Ps 1", "J 1"]);
    // A completed old day may now be partial; readings from separate days may form one complete day.
    next[0].segments.push({ id: "extra", label: "Mt 1-2", section: "Reading" });
    next[2].segments.push({ id: "new", label: "J 2", section: "Reading" });
    const summary = replacementSummary(group, next);
    expect(summary.members[0]).toMatchObject({ retained: 3, completedDays: 1 });
    expect(summary.members[1]).toMatchObject({ retained: 1, completedDays: 0 });
    const replaced = replaceGroupPlan(group, { planDays: next, startDate: "2026-10-20",
      frequency: group.frequency, expectedRevision: "" });
    for (const person of summary.members) {
      expect(person.completedDays).toBe(replaced.planDays.filter(day =>
        day.segments.every(segment => replaced.progress[person.memberId]?.[segment.id])).length);
    }
    expect(replacementSummary(group, []).members.every(person => person.completedDays === 0)).toBe(true);
  });
  it("does not guess different abbreviations, removed passages or split/merged readings", () => {
    const next = replace(fixture(), ["Rodzaju 1", "Mt 1", "Mt 2"]);
    expect(next.progress).toEqual({ a: {}, b: {} });
    expect(replacementSummary(fixture(), next.planDays).matched).toBe(0);
  });
  it("replays old logs and in-flight writes using their original indices after reorder and removal", () => {
    const next = replace(fixture(), ["Mt 1-2", "J 1", "Rdz 1"]);
    const result = applyProgressLog(next, [
      progressLogKey("g", "a", 0, false, time, "a"),
      progressLogKey("g", "b", 1, true, time, "b"),
      progressLogKey("g", "a", 2, true, time, "c"), // removed Psalm must not mark Rdz 1
      progressLogKey("g", "a", 4, true, time, "d"), // newly added J 1
    ]);
    expect(result.progress.a).toEqual({ "plan-v1-segment-2": new Date(time).toISOString() });
    expect(result.progress.b).toEqual({ s1: new Date(time).toISOString() });
  });
  it("keeps the log index append-only across repeated replacements, including logs absent from the snapshot", () => {
    const first = replace(fixture(), ["J 1", "Rdz 1"]);
    const second = replace(first, ["Rdz 1", "J 1", "J 2"], "v2");
    expect(second.progressSegmentIds).toEqual(["s0", "s1", "s2", "s3", "plan-v1-segment-1", "plan-v2-segment-3"]);
    expect(second.planVersion).toBe(2);
    const result = applyProgressLog(second, [progressLogKey("g", "b", 4, true, time, "a")]);
    expect(result.progress.b).toEqual({ "plan-v1-segment-1": new Date(time).toISOString() });
    expect(() => replaceGroupPlan(second, { planDays: plan(["J 1"]), startDate: second.startDate,
      frequency: second.frequency, expectedRevision: "v1" })).toThrow(/podmieniony/);
  });
});

describe("seven-day plan recovery", () => {
  it("saves a separate snapshot and restores lost marks and timestamps for current members only", () => {
    const before = fixture();
    const replaced = replaceGroupPlan(before, { planDays: plan(["Rdz 1", "J 1"]),
      startDate: "2026-10-20", frequency: { kind: "weekdays", days: [] }, expectedRevision: "" }, "new", time);
    expect(replaced.planRestore).toEqual({ savedAt: new Date(time).toISOString(), expiresAt: new Date(time + PLAN_RESTORE_TTL).toISOString() });
    replaced.progress.a.s0 = "later";
    replaced.members = [ { ...before.members[0], name: "Renamed", isAdmin: true }, { id: "c", name: "New", color: "", isAdmin: false } ];
    const restored = restoreGroupPlan(replaced, "new", "restore", time + PLAN_RESTORE_TTL - 1);
    expect(restored.startDate).toBe(before.startDate);
    expect(restored.frequency).toEqual(before.frequency);
    expect(restored.planDays.map(day => ({ ...day, id: "", segments: day.segments.map(segment => ({ ...segment, id: "" })) })))
      .toEqual(before.planDays.map(day => ({ ...day, id: "", segments: day.segments.map(segment => ({ ...segment, id: "" })) })));
    expect(restored.progress).toEqual({ a: { "plan-restore-segment-1": "legacy", "plan-restore-segment-4": "second psalm" }, c: {} });
    expect(restored.members).toEqual(replaced.members);
    expect(restored.planVersion).toBe(2);
    expect(restored.previousPlan).toBeUndefined();
    expect(restored.planRestore).toBeUndefined();
    expect(() => restoreGroupPlan(restored, "restore")).toThrow(/Brak poprzedniego/);
  });
  it("rejects stale requests and expires at exactly seven days; a later replacement backs up the immediate previous plan", () => {
    const first = replaceGroupPlan(fixture(), { planDays: plan(["J 1"]), startDate: "2026-10-20",
      frequency: { kind: "daily", days: [] }, expectedRevision: "" }, "first", time);
    expect(() => restoreGroupPlan(first, "stale", "r", time)).toThrow(/Odśwież/);
    expect(() => restoreGroupPlan(first, "first", "r", time + PLAN_RESTORE_TTL)).toThrow(/Minęło 7 dni/);
    const second = replaceGroupPlan(first, { planDays: plan(["J 2"]), startDate: "2026-10-21",
      frequency: first.frequency, expectedRevision: "first" }, "second", time + 1000);
    expect(second.previousPlan.planDays).toEqual(first.planDays);
    expect(second.previousPlan.expiresAt).toBe(new Date(time + 1000 + PLAN_RESTORE_TTL).toISOString());
  });
  it("ignores all old and late log writes after restoration while accepting new check and uncheck operations", () => {
    const replaced = replace(fixture(), ["Rdz 1", "J 1"]);
    const restored = restoreGroupPlan(replaced, "v1", "restored");
    const logs = [progressLogKey("g", "a", 0, false, time, "a"), progressLogKey("g", "a", 4, true, time + 2, "b")];
    expect(applyProgressLog(restored, logs).progress).toEqual(restored.progress);
    const index = restored.progressSegmentIds!.indexOf(restored.planDays[0].segments[0].id);
    const unchecked = applyProgressLog(restored, [...logs, progressLogKey("g", "a", index, false, time + 3, "c")]);
    expect(Object.values(unchecked.progress.a)).toEqual(["second psalm"]);
    const checked = applyProgressLog(restored, [...logs, progressLogKey("g", "a", index, true, time + 4, "d")]);
    expect(checked.progress.a[restored.planDays[0].segments[0].id]).toBe(new Date(time + 4).toISOString());
  });
});
