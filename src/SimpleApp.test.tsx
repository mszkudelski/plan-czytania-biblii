import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayCard, TodayView } from "./SimpleApp";
import Onboarding from "./Onboarding";
import { getDailyReadingDay, getReadingHomeSummary } from "./lib/reading-home";
import type { Group } from "./types";

const TODAY = "2026-10-14";
const HINT = "Dziś dzień wolny w planie. Możesz czytać dalej we własnym tempie.";
function plan(): Group {
  return {
    id: "group", name: "Czytamy", createdAt: TODAY, startDate: "2026-10-13",
    frequency: { kind: "custom", days: [2, 4] },
    members: [{ id: "member", name: "Jan", isAdmin: true, color: "green" }],
    planDays: ["2026-10-13", "2026-10-15"].map((date, index) => ({
      id: `d${index}`, index, date, title: "",
      segments: [{ id: `s${index}`, label: `Rdz ${index + 1}`, section: "Biblia" }],
    })),
    progress: { member: {} },
  };
}
function render(group: Group, today = TODAY) {
  const day = getDailyReadingDay(group, "member", today)!;
  return renderToStaticMarkup(<DayCard day={day} progress={group.progress.member}
    onToggle={async () => undefined} restDay={getReadingHomeSummary(group, "member", today).restDay}
    header={<header><time>{day.date}</time></header>} />);
}

describe("rest-day hint inside the existing reading card", () => {
  it("keeps earlier unread reading directly editable and places the hint below its original date", () => {
    const group = plan();
    const html = render(group);
    expect(html).toContain(HINT);
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf(HINT));
    expect(html.indexOf(HINT)).toBeLessThan(html.indexOf('class="simple-readings"'));
    expect(html).toContain("2026-10-13");
    expect(html).toContain("Rdz 1");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Czytaj naprzód");
  });

  it("also allows the next future reading without an extra action when past work is finished", () => {
    const group = plan();
    group.progress.member.s0 = "done";
    const html = render(group);
    expect(html).toContain(HINT);
    expect(html).toContain("2026-10-15");
    expect(html).toContain("Rdz 2");
    expect(html).not.toContain("disabled");
  });

  it("does not invent a next date after the schedule ends while work remains", () => {
    const html = render(plan(), "2026-10-20");
    expect(html).toContain(HINT);
    expect(html).toContain("2026-10-13");
    expect(html).not.toContain("Najbliższe");
    expect(html).not.toContain("disabled");
  });

  it("does not appear on a scheduled day, before the start, or after completion", () => {
    expect(render(plan(), "2026-10-13")).not.toContain(HINT);
    expect(render(plan(), "2026-10-12")).not.toContain(HINT);
    const group = plan();
    group.progress.member = { s0: "done", s1: "done" };
    expect(render(group)).not.toContain(HINT);
  });
});

describe("catch-up controls after the backlog is cleared", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function renderHome(overdue: boolean, ahead = false) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    const group = plan();
    group.frequency = { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] };
    group.planDays.push({ id: "today", index: 2, date: TODAY, title: "",
      segments: [{ id: "today-reading", label: "Rdz 3", section: "Biblia" }] });
    group.planDays.sort((a, b) => a.date.localeCompare(b.date));
    if (!overdue) group.progress.member.s0 = "done";
    if (ahead) group.progress.member.s1 = "done";
    // A frozen portion still contains an extra even after its debt is read.
    const key = `reading-recovery:${group.id}:member`;
    const storage = new Map([
      [key, "enabled"],
      [`${key}:ordered:${TODAY}:day`, "d0"],
      [`${key}:ordered:${TODAY}:portion-v3`, JSON.stringify({
        day: { ...group.planDays[0], id: `recovery:${TODAY}`, date: TODAY },
        chapterIndices: { s0: [0] },
        extra: { segmentId: "today-reading", label: "Rdz 3", originalDate: TODAY, chapterIndex: 0, chapterCount: 1 },
      })],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null });
    vi.stubGlobal("window", { location: { search: "" } });
    const credentials = { groupId: group.id, memberId: "member", token: "test" };
    return renderToStaticMarkup(<Onboarding group={group} credentials={credentials} ready>
      <TodayView group={group} member={group.members[0]} credentials={credentials} promptReady active
        onToggle={async () => undefined} onError={() => undefined} onWaitForSegments={async () => undefined} />
    </Onboarding>);
  }

  it.each([false, true])("ignores a saved recovery flag and frozen extra with zero debt (ahead: %s)", ahead => {
    const html = renderHome(false, ahead);
    expect(html).not.toContain("reading-recovery-link");
    expect(html).not.toContain("Wyłącz nadrabianie");
    expect(html).not.toContain("reading-extra");
    expect(html).toContain(ahead ? "Do przodu" : "Na bieżąco");
    expect(html).toContain(`dateTime="${TODAY}"`);
  });

  it("keeps the stop control and extra chapter while actual debt remains", () => {
    const html = renderHome(true);
    expect(html).toContain("Wyłącz nadrabianie");
    expect(html).toContain("reading-extra");
  });
});
