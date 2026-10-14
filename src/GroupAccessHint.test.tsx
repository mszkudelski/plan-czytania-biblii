import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import GroupAccessHint from "./GroupAccessHint";
import type { Group, Member } from "./types";
const admin: Member = { id: "admin", name: "Anna", color: "green", isAdmin: true };
const person: Member = { id: "person", name: "Jan", color: "blue", isAdmin: false };
const group = { id: "group", members: [admin, person] } as Group;
afterEach(() => vi.unstubAllGlobals());
function render(member: Member, hidden = false) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => hidden ? "hidden" : null });
  return renderToStaticMarkup(<GroupAccessHint group={group} member={member} />);
}
it("offers the administrator an accessible dismissal and explains sole-admin recovery", () => {
  const html = render(admin);
  expect(html).toContain('aria-label="Ukryj informację o odzyskiwaniu dostępu"');
  expect(html).toContain("Jesteś jedynym administratorem");
});
it("does not render a previously dismissed administrator notice", () => {
  expect(render(admin, true)).toBe("");
});
it("does not render recovery help for a participant regardless of dismissal state", () => {
  expect(render(person)).toBe("");
  expect(render(person, true)).toBe("");
});
