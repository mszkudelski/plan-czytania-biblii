import type { Group, Member } from "./types";

export default function GroupAccessSettings({
  group, member,
}: { group: Group; member: Member }) {
  const otherAdmins = group.members.filter((person) => person.isAdmin && person.id !== member.id);

  return (
    <>
      <h2 className="settings-heading">Odzyskiwanie dostępu</h2>
      <section className="settings-card group-access-card" aria-label="Odzyskiwanie dostępu">
        {otherAdmins.length ? <p>
          Jeśli stracisz dostęp, poproś administratora grupy ({otherAdmins.map((person) => person.name).join(", ")})
          o jednorazowy link. Przywróci Twój profil i postęp.
        </p> : <p>
          Jesteś jedynym administratorem. Zaproś zaufaną osobę i nadaj jej rolę administratora:
          Grupa → Zarządzaj → Nadaj rolę administratora. Wtedy pomoże Ci odzyskać dostęp.
        </p>}
      </section>
    </>
  );
}
