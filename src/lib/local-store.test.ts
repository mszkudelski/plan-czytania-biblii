import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  localCreateGroup,
  localCreateRecoveryCode,
  localCreateMemberAccess,
  localJoinGroup,
  localRemoveMember,
  localRecoveryCodeStatus,
  localRedeemRecoveryCode,
  localRedeemMemberAccess,
  localUpdateMemberRole,
  localUpdateProgress,
} from "./local-store";
import { hashRecoveryCode, normalizeRecoveryCode } from "./access-recovery";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("członkowie grupy", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("tworzy oddzielne profile i postęp dla takiego samego imienia", () => {
    const created = localCreateGroup({
      name: "Plan czytania Biblii",
      ownerName: "Marek",
      startDate: "2026-09-21",
      frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
      planDays: [
        {
          id: "day-1",
          index: 0,
          date: "2026-09-21",
          title: "",
          segments: [
            { id: "segment-1", label: "Rdz 1", section: "Stary Testament" },
          ],
        },
      ],
    });
    const invite = {
      groupId: created.credentials.groupId,
      inviteToken: created.credentials.inviteToken!,
    };

    const firstDevice = localJoinGroup(invite, "Anna");
    localUpdateProgress(firstDevice.credentials, "segment-1", true);
    const secondDevice = localJoinGroup(invite, "ANNA");

    expect(secondDevice.credentials.memberId).not.toBe(
      firstDevice.credentials.memberId,
    );
    expect(secondDevice.group.progress[firstDevice.credentials.memberId]).toEqual(
      expect.objectContaining({ "segment-1": expect.any(String) }),
    );
    expect(secondDevice.group.progress[secondDevice.credentials.memberId]).toEqual({});
    expect(secondDevice.group.members).toHaveLength(3);
    expect(() =>
      localUpdateProgress(firstDevice.credentials, "segment-1", false),
    ).not.toThrow();
    expect(() =>
      localUpdateProgress(secondDevice.credentials, "segment-1", true),
    ).not.toThrow();
  });

  it("odróżnia osoby o tym samym imieniu po imieniu i nazwisku", () => {
    const created = localCreateGroup({
      name: "Plan czytania Biblii",
      ownerName: "Marek Kowalski",
      startDate: "2026-09-21",
      frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
      planDays: [
        {
          id: "day-1",
          index: 0,
          date: "2026-09-21",
          title: "",
          segments: [
            { id: "segment-1", label: "Rdz 1", section: "Stary Testament" },
          ],
        },
      ],
    });
    const invite = {
      groupId: created.credentials.groupId,
      inviteToken: created.credentials.inviteToken!,
    };

    const first = localJoinGroup(invite, "  Szymon   Kowalski ");
    const second = localJoinGroup(invite, "Szymon Nowak");

    expect(first.credentials.memberId).not.toBe(second.credentials.memberId);
    expect(second.group.members.map((member) => member.name)).toEqual([
      "Marek Kowalski",
      "Szymon Kowalski",
      "Szymon Nowak",
    ]);
  });

  it("usuwa osobę i unieważnia jej dostęp", () => {
    const created = localCreateGroup({
      name: "Plan czytania Biblii",
      ownerName: "Marek",
      startDate: "2026-09-21",
      frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
      planDays: [
        {
          id: "day-1",
          index: 0,
          date: "2026-09-21",
          title: "",
          segments: [
            { id: "segment-1", label: "Rdz 1", section: "Stary Testament" },
          ],
        },
      ],
    });
    const joined = localJoinGroup(
      {
        groupId: created.credentials.groupId,
        inviteToken: created.credentials.inviteToken!,
      },
      "Anna",
    );

    const group = localRemoveMember(
      created.credentials,
      joined.credentials.memberId,
    );

    expect(group.members.map((member) => member.name)).toEqual(["Marek"]);
    expect(() =>
      localUpdateProgress(joined.credentials, "segment-1", true),
    ).toThrow("Nieprawidłowy link członka.");
  });
});

function createLocalPlan() {
  return localCreateGroup({
    name: "Plan odzyskiwania", ownerName: "Marek", startDate: "2026-10-10",
    frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
    planDays: [{ id: "day-1", index: 0, date: "2026-10-10", title: "",
      segments: [{ id: "segment-1", label: "Rdz 1", section: "ST" }] }],
  });
}

describe("odzyskiwanie przez administratora", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage()); });
  afterEach(() => { vi.useRealTimers(); });
  const join = (owner: ReturnType<typeof createLocalPlan>, name = "Anna") => localJoinGroup({
    groupId: owner.group.id, inviteToken: owner.credentials.inviteToken!,
  }, name);

  it("przywraca wybrany profil mimo powtórzonego imienia, bez uprawnień wystawiającego", async () => {
    const owner = createLocalPlan();
    const first = join(owner, "Marek");
    const second = join(owner, "Marek");
    localUpdateProgress(first.credentials, "segment-1", true);
    const access = await localCreateMemberAccess(owner.credentials, first.credentials.memberId);
    const stored = localStorage.getItem("plan-czytania-biblii-local-member-access")!;
    expect(stored.includes(access.code.replaceAll("-", ""))).toBe(false);
    const recovered = await localRedeemMemberAccess(access.code.toLowerCase().replaceAll("-", " "));
    expect(recovered.credentials.memberId).toBe(first.credentials.memberId);
    expect(recovered.credentials.token).not.toBe(first.credentials.token);
    expect(recovered.credentials.inviteToken).toBeUndefined();
    expect(recovered.group.members).toHaveLength(3);
    expect(recovered.group.members.find((person) => person.id === first.credentials.memberId)?.isAdmin).toBe(false);
    expect(recovered.group.progress[first.credentials.memberId]["segment-1"]).toBeTruthy();
    expect(recovered.group.progress[second.credentials.memberId]).toEqual({});
    expect(() => localUpdateProgress(first.credentials, "segment-1", false)).not.toThrow();
    expect(() => localUpdateProgress(recovered.credentials, "segment-1", true)).not.toThrow();
  });

  it("drugi administrator przywraca pierwotnego administratora bez wcześniejszego kodu", async () => {
    const owner = createLocalPlan();
    const second = join(owner);
    localUpdateMemberRole(owner.credentials, second.credentials.memberId, true);
    localUpdateProgress(owner.credentials, "segment-1", true);
    const access = await localCreateMemberAccess(second.credentials, owner.credentials.memberId);
    const recovered = await localRedeemMemberAccess(access.code);
    expect(recovered.credentials.memberId).toBe(owner.credentials.memberId);
    expect(recovered.group.members.find((person) => person.id === owner.credentials.memberId)?.isAdmin).toBe(true);
    expect(recovered.group.progress[owner.credentials.memberId]["segment-1"]).toBeTruthy();
    expect(localRecoveryCodeStatus(owner.credentials).hasCode).toBe(false);
  });

  it("blokuje zarządzanie przez uczestnika i odebranie ostatniego administratora", async () => {
    const owner = createLocalPlan();
    const person = join(owner);
    await expect(localCreateMemberAccess(person.credentials, owner.credentials.memberId)).rejects.toThrow("Tylko administrator");
    expect(() => localUpdateMemberRole(person.credentials, person.credentials.memberId, true)).toThrow("Tylko administrator");
    expect(() => localUpdateMemberRole(owner.credentials, owner.credentials.memberId, false)).toThrow("co najmniej jednego administratora");
    localUpdateMemberRole(owner.credentials, person.credentials.memberId, true);
    localUpdateMemberRole(person.credentials, owner.credentials.memberId, false);
    expect(() => localUpdateMemberRole(person.credentials, person.credentials.memberId, false)).toThrow("co najmniej jednego administratora");
    await expect(localCreateMemberAccess(owner.credentials, person.credentials.memberId)).rejects.toThrow("Tylko administrator");
    expect(() => localUpdateProgress(owner.credentials, "segment-1", true)).not.toThrow();
  });

  it("jednorazowy kod może zostać użyty tylko raz również przy równoczesnych żądaniach", async () => {
    const owner = createLocalPlan();
    const person = join(owner);
    const access = await localCreateMemberAccess(owner.credentials, person.credentials.memberId);
    const results = await Promise.allSettled([
      localRedeemMemberAccess(access.code), localRedeemMemberAccess(access.code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(localRedeemMemberAccess(access.code)).rejects.toThrow("nieprawidłowy lub wygasł");
  });

  it("nie gubi kodów wystawionych równocześnie dla różnych profili", async () => {
    const owner = createLocalPlan();
    const first = join(owner);
    const second = join(owner);
    const codes = await Promise.all([
      localCreateMemberAccess(owner.credentials, first.credentials.memberId),
      localCreateMemberAccess(owner.credentials, second.credentials.memberId),
    ]);
    const recovered = await Promise.all(codes.map((access) => localRedeemMemberAccess(access.code)));
    expect(recovered.map((session) => session.credentials.memberId)).toEqual([first.credentials.memberId, second.credentials.memberId]);
  });

  it("odrzuca kod po 10 minutach oraz dłuższy kod z poprawnym początkiem", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    const owner = createLocalPlan();
    const person = join(owner);
    const access = await localCreateMemberAccess(owner.credentials, person.credentials.memberId);
    expect(Date.parse(access.expiresAt) - Date.now()).toBe(600_000);
    await expect(localRedeemMemberAccess(access.code + "-ABCD")).rejects.toThrow("format");
    vi.setSystemTime(Date.now() + 600_000);
    await expect(localRedeemMemberAccess(access.code)).rejects.toThrow("nieprawidłowy lub wygasł");
  });

  it("nie pozwala odzyskać usuniętej osoby lub użyć linku wystawionego przez zdegradowanego administratora", async () => {
    const owner = createLocalPlan();
    const person = join(owner);
    const access = await localCreateMemberAccess(owner.credentials, person.credentials.memberId);
    localRemoveMember(owner.credentials, person.credentials.memberId);
    await expect(localRedeemMemberAccess(access.code)).rejects.toThrow("nie ma już dostępu");
    const second = join(owner);
    localUpdateMemberRole(owner.credentials, second.credentials.memberId, true);
    const ownerAccess = await localCreateMemberAccess(second.credentials, owner.credentials.memberId);
    localUpdateMemberRole(owner.credentials, second.credentials.memberId, false);
    await expect(localRedeemMemberAccess(ownerAccess.code)).rejects.toThrow("nie ma już uprawnień");
  });

  it("wymaga ważnego tokenu i istniejącego profilu w tej samej grupie", async () => {
    const owner = createLocalPlan();
    const foreign = createLocalPlan();
    await expect(localCreateMemberAccess({ ...owner.credentials, token: "invalid" }, owner.credentials.memberId)).rejects.toThrow();
    await expect(localCreateMemberAccess(owner.credentials, foreign.credentials.memberId)).rejects.toThrow("Nie znaleziono osoby");
    expect(() => localUpdateMemberRole(owner.credentials, foreign.credentials.memberId, true)).toThrow("Nie znaleziono osoby");
  });
});

describe("tożsamość i kod odzyskiwania", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage()); });

  it("dołączenie z imieniem administratora nie przyznaje jego tożsamości ani uprawnień", () => {
    const owner = createLocalPlan();
    const joined = localJoinGroup({ groupId: owner.group.id, inviteToken: owner.credentials.inviteToken! }, "  MAREK ");
    expect(joined.credentials.memberId).not.toBe(owner.credentials.memberId);
    expect(joined.group.members.find((member) => member.id === joined.credentials.memberId)?.isAdmin).toBe(false);
    expect(() => localRemoveMember(joined.credentials, owner.credentials.memberId)).toThrow("Tylko administrator");
    expect(() => localUpdateProgress({ ...joined.credentials, memberId: owner.credentials.memberId }, "segment-1", true)).toThrow();
  });

  it("przy limicie grupy takie samo imię nie omija limitu", () => {
    const owner = createLocalPlan();
    const invite = { groupId: owner.group.id, inviteToken: owner.credentials.inviteToken! };
    for (let index = 1; index < 100; index++) localJoinGroup(invite, "Marek");
    expect(() => localJoinGroup(invite, "Marek")).toThrow("limit 100 osób");
  });

  it("odzyskuje ten sam profil, rolę i postęp; kod zapisuje tylko jako hash", async () => {
    const owner = createLocalPlan();
    localUpdateProgress(owner.credentials, "segment-1", true);
    // Legacy local plans stored a single token rather than an array.
    const legacy = JSON.parse(localStorage.getItem("plan-czytania-biblii-local-groups")!);
    legacy[owner.group.id].tokens[owner.credentials.memberId] = owner.credentials.token;
    localStorage.setItem("plan-czytania-biblii-local-groups", JSON.stringify(legacy));
    expect(localRecoveryCodeStatus(owner.credentials)).toEqual({ hasCode: false });
    const { code } = await localCreateRecoveryCode(owner.credentials);
    expect(localRecoveryCodeStatus(owner.credentials)).toEqual({ hasCode: true });
    const stored = localStorage.getItem("plan-czytania-biblii-local-recovery")!;
    expect(stored.includes(code)).toBe(false);
    expect(stored.includes(normalizeRecoveryCode(code)!)).toBe(false);
    expect(stored.includes(await hashRecoveryCode(normalizeRecoveryCode(code)!))).toBe(true);
    const recovered = await localRedeemRecoveryCode(code.toLowerCase().replaceAll("-", " "));
    expect(recovered.credentials.memberId).toBe(owner.credentials.memberId);
    expect(recovered.credentials.token).not.toBe(owner.credentials.token);
    expect(recovered.group.members).toEqual(owner.group.members);
    expect(recovered.group.progress[owner.credentials.memberId]["segment-1"]).toBeTruthy();
    expect(JSON.stringify(recovered.group).includes("codeHash")).toBe(false);
    expect(() => localUpdateProgress(owner.credentials, "segment-1", false)).not.toThrow();
    expect(() => localUpdateProgress(recovered.credentials, "segment-1", true)).not.toThrow();
    expect((await localRedeemRecoveryCode(code)).credentials.memberId).toBe(owner.credentials.memberId);
  });

  it("nowy kod unieważnia poprzedni, zachowując dostęp urządzeń i innych profili", async () => {
    const owner = createLocalPlan();
    const member = localJoinGroup({ groupId: owner.group.id, inviteToken: owner.credentials.inviteToken! }, "Anna");
    const other = await localCreateRecoveryCode(member.credentials);
    const first = await localCreateRecoveryCode(owner.credentials);
    const device = await localRedeemRecoveryCode(first.code);
    const replacement = await localCreateRecoveryCode(device.credentials);
    await expect(localRedeemRecoveryCode(first.code)).rejects.toThrow("zastąpiony nowym");
    expect((await localRedeemRecoveryCode(replacement.code)).credentials.memberId).toBe(owner.credentials.memberId);
    expect((await localRedeemRecoveryCode(other.code)).credentials.memberId).toBe(member.credentials.memberId);
    expect(() => localUpdateProgress(owner.credentials, "segment-1", true)).not.toThrow();
    expect(() => localUpdateProgress(device.credentials, "segment-1", false)).not.toThrow();
  });

  it("nie pozwala wystawić kodu bez dostępu ani odzyskać usuniętej osoby", async () => {
    const owner = createLocalPlan();
    const member = localJoinGroup({ groupId: owner.group.id, inviteToken: owner.credentials.inviteToken! }, "Anna");
    const issued = await localCreateRecoveryCode(member.credentials);
    const invalid = { ...member.credentials, token: "invalid" };
    await expect(localCreateRecoveryCode(invalid)).rejects.toThrow("Nieprawidłowy dostęp");
    expect(() => localRecoveryCodeStatus(invalid)).toThrow("Nieprawidłowy dostęp");
    await expect(localRedeemRecoveryCode("ABCD-EFGH")).rejects.toThrow("format");
    await expect(localRedeemRecoveryCode("2".repeat(32))).rejects.toThrow("nieprawidłowy");
    localRemoveMember(owner.credentials, member.credentials.memberId);
    await expect(localRedeemRecoveryCode(issued.code)).rejects.toThrow("nieprawidłowy");
  });
});

