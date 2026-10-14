import { useState } from "react";
import type { Group, Member } from "./types";

export default function GroupAccessHint({ group, member }: { group: Group; member: Member }) {
  const key = `reading-group-access-hint:${group.id}:${member.id}:admin`;
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && localStorage.getItem(key) === "hidden");
  const admins = group.members.filter(person => person.isAdmin);
  if (member.isAdmin && hidden) return null;
  return <aside className={`group-access-help${member.isAdmin ? " has-close" : ""}`} aria-label="Informacja o odzyskiwaniu dostępu">
    {member.isAdmin && <button type="button" className="group-access-help-close" aria-label="Ukryj informację o odzyskiwaniu dostępu" onClick={() => {
      setHidden(true); localStorage.setItem(key, "hidden");
    }}><span aria-hidden="true">×</span></button>}
    <strong>{member.isAdmin ? "Grupa pomaga odzyskać dostęp" : "Potrzebujesz odzyskać dostęp?"}</strong>
    <p>{member.isAdmin
      ? "Wybierz Zarządzaj przy właściwej osobie, aby przywrócić jej profil jednorazowym linkiem lub QR."
      : `Poproś administratora (${admins.map(person => person.name).join(", ")}) o jednorazowy link. Otworzy Twój profil z dotychczasowym postępem.`}</p>
    {member.isAdmin && admins.length === 1 && <p>Jesteś jedynym administratorem. Nadaj tę rolę zaufanej osobie, aby mogła pomóc również Tobie.</p>}
  </aside>;
}
