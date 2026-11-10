import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import { monday, nextTempo, projectPersonalTempo, tempoEffectiveFrom, validTempoDays } from "./personal-tempo";
import { todaysReminder } from "./notifications";
import { getReadingBalance, getNextDay } from "./metrics";
import { getReadingHomeSummary } from "./reading-home";
import { applyChapterProgress } from "./chapter-progress";
const member = { id: "m", name: "Tester", color: "green", isAdmin: true };
function group(): Group {
  return { id: "g", name: "Synthetic", createdAt: "2026-11-01", startDate: "2026-11-09",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] }, members: [member, { ...member, id: "other" }],
    planDays: ["2026-11-09", "2026-11-16", "2026-11-23"].map((date, i) => ({ id: `d${i}`, index: i, date, title: "Czytanie", segments: [{ id: `s${i}`, section: "Tekst", label: `Rdz ${i * 12 + 1}–${i * 12 + 12}`, referenceVersion: 1 }] })), progress: { m: {}, other: {} } };
}
function choose(g: Group, days: number[], today = "2026-11-08", version = 0) {
  const personalTempo = nextTempo(g, "m", days, today, version, g.planRevision ?? "");
  return { ...g, members: g.members.map(m => m.id === "m" ? { ...m, personalTempo } : m) };
}
describe("personal cadence projection", () => {
  it.each([[6], [1, 3, 5], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6], [2, 4], [0, 2, 4, 6], [0, 1, 2, 3, 4, 5]])("preserves weekly material, order and chosen days: %j", (...days) => {
    // Each row supplies its weekday values as arguments.
    const selected = days as number[];
    const base = group(); const projected = projectPersonalTempo(choose(base, selected), "m");
    const first = projected.planDays.filter(day => monday(day.date) === "2026-11-09");
    expect(first.every(day => selected.includes(new Date(day.date).getUTCDay()))).toBe(true);
    expect(first.flatMap(d => d.segments.map(s => s.label))).toEqual(Array.from({ length: 12 }, (_, i) => `Rdz ${i + 1}`));
    expect(new Set(projected.planDays.flatMap(d => d.segments.map(s => s.id))).size).toBe(36);
    const sizes = first.map(d => d.segments.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(base.members[0].personalTempo).toBeUndefined();
    expect(projectPersonalTempo(projected, "m")).toBe(projected);
    expect(projectPersonalTempo(projected, "other")).toBe(base === projected ? base : projected.personalProjection!.original);
  });
  it("retains old cadence and overdue dates when a midweek change becomes effective", () => {
    let g = choose(group(), [1, 3, 5]);
    const before = projectPersonalTempo(g, "m").planDays.filter(d => d.date < "2026-11-16");
    g = choose(g, [6], "2026-11-11", 1);
    const projected = projectPersonalTempo(g, "m");
    expect(projected.planDays.filter(d => d.date < "2026-11-16")).toEqual(before);
    expect(projected.planDays.filter(d => monday(d.date) === "2026-11-16").map(d => d.date)).toEqual(["2026-11-21"]);
    expect(getReadingBalance(projected, "m", "2026-11-17").overdueReadings).toBe(3);
  });
  it("projects partial marks without rewriting source IDs, and full completion survives any cadence", () => {
    const g = choose(applyChapterProgress(group(), "m", "s0", true, [0, 4]), [1, 3, 5]);
    const projected = projectPersonalTempo(g, "m");
    const units = projected.planDays.flatMap(d => d.segments);
    expect(units.filter(s => projected.progress.m[s.id]).map(s => s.label)).toEqual(["Rdz 1", "Rdz 5"]);
    expect(units.find(s => s.label === "Rdz 5")?.personalSource).toEqual({ segmentId: "s0", chapterIndex: 4, dayId: "d0" });
    const done = projectPersonalTempo(choose(applyChapterProgress(group(), "m", "s0", true), [6]), "m");
    expect(done.planDays[0].segments.every(s => done.progress.m[s.id])).toBe(true);
    expect(getNextDay(done, "m")?.date).toBe("2026-11-21");
  });
  it("does not split arbitrary CSV or create empty fake portions", () => {
    const g = group(); g.planDays = [{ ...g.planDays[0], segments: [{ id: "s0", label: "Przeczytaj wybrany tekst", section: "CSV" }] }];
    const projected = projectPersonalTempo(choose(g, [0, 1, 2, 3, 4, 5, 6]), "m");
    expect(projected.planDays).toHaveLength(1);
    expect(projected.planDays[0].segments[0].label).toBe("Przeczytaj wybrany tekst");
  });
  it("cancels only pending history and rejects stale writes and replaced plans", () => {
    let g = choose(group(), [1, 3, 5]); g = choose(g, [6], "2026-11-11", 1);
    const cancelled = nextTempo(g, "m", null, "2026-11-11", 2, "");
    expect(cancelled.changes).toHaveLength(1); expect(cancelled.changes[0].days).toEqual([1, 3, 5]);
    expect(() => nextTempo(g, "m", [1], "2026-11-11", 1, "")).toThrow(/innym urządzeniu/);
    expect(() => nextTempo(g, "m", [1], "2026-11-11", 2, "changed")).toThrow(/Plan/);
    const replaced = { ...g, planRevision: "replacement" };
    expect(projectPersonalTempo(replaced, "m")).toBe(replaced);
  });
  it("defers a first choice after start or a midweek join to the next full week", () => {
    expect(tempoEffectiveFrom(group(), "m", "2026-11-11")).toBe("2026-11-16");
    const g = group(); g.members[0] = { ...member, readingStart: { skippedSegmentIds: ["s0"] } };
    expect(tempoEffectiveFrom(g, "m", "2026-11-09")).toBe("2026-11-16");
    const projected = projectPersonalTempo(choose(g, [6], "2026-11-09"), "m");
    expect(projected.planDays.flatMap(d => d.segments).filter(s => s.personalSource?.segmentId === "s0")).toHaveLength(0);
  });
  it("uses the same projection for rest days, reminders, completion and backlog", () => {
    const g = choose(group(), [1, 3, 5]);
    expect(todaysReminder(g, "m", new Date("2026-11-10T12:00:00Z"), "UTC")).toBeNull();
    expect(getReadingHomeSummary(g, "m", "2026-11-10").restDay).toBe(true);
    const payload = todaysReminder(g, "m", new Date("2026-11-11T12:00:00Z"), "UTC");
    expect(payload?.body).toContain("Rdz 5"); expect(payload?.body).not.toContain("Rdz 1 ·");
    let done = g; for (const i of [4, 5, 6, 7]) done = applyChapterProgress(done, "m", "s0", true, [i]);
    expect(todaysReminder(done, "m", new Date("2026-11-11T12:00:00Z"), "UTC")).toBeNull();
    expect(getReadingBalance(done, "m", "2026-11-12").overdueReadings).toBe(1);
  });
  it("validates unique weekdays without accepting empty or nonnumeric input", () => {
    for (const value of [[], [0, 0], [7], [-1], ["1"], null, {}]) expect(validTempoDays(value)).toBe(false);
    expect(validTempoDays([2, 4, 6])).toBe(true);
    expect(() => nextTempo(group(), "m", [], "2026-11-08", 0, "")).toThrow();
  });
});
