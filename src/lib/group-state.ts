// Metadata changes claim a new immutable revision. Two requests cannot replace
// the same snapshot, and an interrupted request cannot leave a persistent lock.
export type GroupStateStore<T> = {
  baseline: () => Promise<T | null>;
  versions: () => Promise<number[]>;
  read: (version: number) => Promise<T | null>;
  create: (version: number, group: T) => Promise<boolean>;
};

export async function readGroupState<T>(store: GroupStateStore<T>) {
  const baseline = await store.baseline();
  if (!baseline) return null;
  const versions = (await store.versions()).filter((version) => Number.isSafeInteger(version) && version > 0);
  let version = Math.max(0, ...versions);
  let group = version ? await store.read(version) : baseline;
  if (!group) throw new Error("Nie można odczytać aktualnej wersji grupy.");
  // A listing can precede another request's commit. Probe the next immutable
  // slot so a stale list cannot be used as the basis of a successful write.
  for (;;) {
    const next = await store.read(version + 1);
    if (!next) return { group, version };
    group = next;
    version++;
  }
}

export async function changeGroupState<T>(
  store: GroupStateStore<T>,
  change: (group: T) => Promise<Response | void>,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await readGroupState(store);
    if (!state) return Response.json({ error: "Nie znaleziono grupy." }, { status: 404 });
    const rejected = await change(state.group);
    if (rejected) return rejected;
    if (await store.create(state.version + 1, state.group)) return null;
  }
  return Response.json({ error: "Plan został właśnie zmieniony. Spróbuj ponownie." }, { status: 409 });
}
