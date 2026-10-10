import { describe, expect, it } from "vitest";
import { changeGroupState, readGroupState, type GroupStateStore } from "./group-state";

type State = { members: { id: string; isAdmin: boolean }[]; progress: { owner: string[] } };
function fixture() {
  const baseline: State = { members: [{ id: "owner", isAdmin: true }, { id: "second", isAdmin: true }], progress: { owner: ["s0"] } };
  const revisions = new Map<number, State>();
  const store: GroupStateStore<State> = {
    baseline: async () => structuredClone(baseline),
    versions: async () => [...revisions.keys()],
    read: async (version) => revisions.has(version) ? structuredClone(revisions.get(version)!) : null,
    create: async (version, group) => {
      if (revisions.has(version)) return false;
      revisions.set(version, structuredClone(group));
      return true;
    },
  };
  return { store, revisions, baseline };
}

describe("immutable group metadata", () => {
  it("reads existing groups without requiring migration", async () => {
    const { store, baseline } = fixture();
    expect(await readGroupState(store)).toEqual({ group: baseline, version: 0 });
  });

  it("preserves independent simultaneous changes rather than reporting lost writes as successful", async () => {
    const { store, baseline } = fixture();
    const results = await Promise.all(["owner", "second"].map((id) => changeGroupState(store, async (group) => {
      group.members.find((person) => person.id === id)!.isAdmin = false;
    })));
    expect(results).toEqual([null, null]);
    const state = await readGroupState(store);
    expect(state?.version).toBe(2);
    expect(state?.group.members.every((person) => !person.isAdmin)).toBe(true);
    expect(state?.group.progress).toEqual(baseline.progress);
    expect(baseline.members.every((person) => person.isAdmin)).toBe(true);
  });

  it("rechecks the last-administrator rule on a competing revision", async () => {
    const { store } = fixture();
    const results = await Promise.all(["owner", "second"].map((id) => changeGroupState(store, async (group) => {
      if (!group.members.some((person) => person.id !== id && person.isAdmin)) {
        return new Response("Last administrator", { status: 409 });
      }
      group.members.find((person) => person.id === id)!.isAdmin = false;
    })));
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(results.filter((result) => result?.status === 409)).toHaveLength(1);
    expect((await readGroupState(store))?.group.members.filter((person) => person.isAdmin)).toHaveLength(1);
  });

  it("finds newer revisions even if a listing is stale", async () => {
    const { store } = fixture();
    await changeGroupState(store, async (group) => { group.members[0].isAdmin = false; });
    store.versions = async () => [];
    await changeGroupState(store, async (group) => { group.progress.owner.push("s1"); });
    const state = await readGroupState(store);
    expect(state?.version).toBe(2);
    expect(state?.group.members[0].isAdmin).toBe(false);
    expect(state?.group.progress.owner).toEqual(["s0", "s1"]);
  });

  it("rejects missing groups and failed validation without writing", async () => {
    const { store, revisions } = fixture();
    expect((await changeGroupState(store, async () => new Response("Denied", { status: 403 })))?.status).toBe(403);
    store.baseline = async () => null;
    expect((await changeGroupState(store, async () => undefined))?.status).toBe(404);
    expect(revisions.size).toBe(0);
  });

  it("does not claim success after exhausting competing writes", async () => {
    const { store } = fixture();
    store.create = async () => false;
    expect((await changeGroupState(store, async () => undefined))?.status).toBe(409);
    expect((await readGroupState(store))?.version).toBe(0);
  });
});
