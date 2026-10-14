import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayCard } from "./SimpleApp";
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
