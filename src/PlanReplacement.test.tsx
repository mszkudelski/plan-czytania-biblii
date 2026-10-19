import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import PlanReplacement from "./PlanReplacement";
import type { Group } from "./types";
const group: Group = { id: "g", name: "G", createdAt: "", startDate: "2026-10-19", frequency: { kind: "daily", days: [] },
  planDays: [], progress: {}, members: [ { id: "a", name: "A", color: "", isAdmin: true }, { id: "b", name: "B", color: "", isAdmin: false } ] };
it("offers replacement only to an administrator and blocks it during pending progress writes", () => {
  const render = (memberId: string, disabled = false) => renderToStaticMarkup(<PlanReplacement group={group}
    credentials={{ groupId: "g", memberId, token: "" }} disabled={disabled} onReplace={() => {}} />);
  expect(render("b")).toBe("");
  expect(render("a")).toContain("Podmień plan");
  expect(render("a", true)).toContain('disabled=""');
});
