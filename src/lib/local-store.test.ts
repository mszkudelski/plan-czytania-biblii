import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  localCreateGroup,
  localJoinGroup,
  localRemoveMember,
  localUpdateProgress,
} from "./local-store";

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

  it("loguje tę samą osobę na kolejnym urządzeniu i zachowuje oba dostępy", () => {
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

    expect(secondDevice.credentials.memberId).toBe(
      firstDevice.credentials.memberId,
    );
    expect(secondDevice.group.progress[firstDevice.credentials.memberId]).toEqual(
      expect.objectContaining({ "segment-1": expect.any(String) }),
    );
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
