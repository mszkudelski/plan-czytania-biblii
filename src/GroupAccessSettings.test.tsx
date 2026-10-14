import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GroupAccessSettings from "./GroupAccessSettings";
import type { Group, Member } from "./types";

const owner: Member = { id: "owner", name: "Marek", color: "green", isAdmin: true };
const admin: Member = { id: "admin", name: "Anna", color: "blue", isAdmin: true };
const participant: Member = { id: "participant", name: "Jan", color: "orange", isAdmin: false };
function render(member: Member, members: Member[]) {
  const group: Group = {
    id: "group", name: "Wspólne czytanie", createdAt: "2026-10-10T00:00:00Z",
    startDate: "2026-10-10", frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    planDays: [], members, progress: {},
  };
  return renderToStaticMarkup(<GroupAccessSettings group={group} member={member} />);
}

describe("odzyskiwanie dostępu w grupie", () => {
  it("directs the sole administrator to appoint a trusted second administrator", () => {
    const html = render(owner, [owner, participant]);
    expect(html).toContain("Jesteś jedynym administratorem");
    expect(html).toContain("Nadaj rolę administratora");
    expect(html).not.toContain("poproś administratora grupy (Marek)");
  });

  it("offers another administrator rather than the current profile for recovery", () => {
    const html = render(owner, [owner, admin, participant]);
    expect(html).toContain("poproś administratora grupy (Anna)");
    expect(html).not.toContain("Jesteś jedynym administratorem");
    expect(html).not.toContain("Marek");
    expect(html).not.toContain("Jan");
  });

  it("shows a participant the group administrators without exposing personal-code options", () => {
    const html = render(participant, [owner, admin, participant]);
    expect(html).toContain("poproś administratora grupy (Marek, Anna)");
    expect(html).toContain("Przywróci Twój profil i postęp");
    expect(html).not.toMatch(/<input|<button|<details|kod odzyskiwania|kod awaryjny/);
  });
});
