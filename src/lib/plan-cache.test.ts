import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../types";
import {
  clearCachedGroup,
  loadCachedGroup,
  saveCachedGroup,
} from "./plan-cache";

const group: Group = {
  id: "group-1",
  name: "Plan",
  createdAt: "2026-09-22T08:00:00.000Z",
  startDate: "2026-09-22",
  frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
  planDays: [],
  members: [
    { id: "member-1", name: "Marek", color: "#45634d", isAdmin: true },
  ],
  progress: { "member-1": {} },
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
}

describe("plan cache", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("saves and loads the latest group snapshot", () => {
    const savedAt = saveCachedGroup(group);

    expect(loadCachedGroup(group.id)).toEqual({ group, savedAt });
  });

  it("ignores a snapshot stored under another group id", () => {
    saveCachedGroup(group);

    expect(loadCachedGroup("another-group")).toBeNull();
  });

  it("clears a group snapshot", () => {
    saveCachedGroup(group);
    clearCachedGroup(group.id);

    expect(loadCachedGroup(group.id)).toBeNull();
  });
});
