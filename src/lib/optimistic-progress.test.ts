import { expect, it } from "vitest";
import type { Group } from "../types";
import { createOptimisticProgressQueue } from "./optimistic-progress";

function groupWith(progress: Record<string, string> = {}): Group {
  return {
    id: "g", name: "Grupa", createdAt: "", startDate: "2026-10-01",
    frequency: { kind: "daily", days: [] }, planDays: [], members: [],
    progress: { a: progress, b: { other: "already-read" } },
  };
}

function deferredGroup() {
  let resolve!: (group: Group) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Group>((onSuccess, onFailure) => {
    resolve = onSuccess;
    reject = onFailure;
  });
  return { promise, resolve, reject };
}

function fixture(progress: Record<string, string> = {}) {
  const initial = groupWith(progress);
  let visible = initial;
  const requests: {
    segmentId: string;
    completed: boolean;
    task: ReturnType<typeof deferredGroup>;
  }[] = [];
  const saved: Group[] = [];
  const errors: unknown[] = [];
  const queue = createOptimisticProgressQueue({
    group: initial,
    memberId: "a",
    save: (segmentId, completed) => {
      const task = deferredGroup();
      requests.push({ segmentId, completed, task });
      return task.promise;
    },
    onChange: group => { visible = group; },
    onSave: group => { saved.push(group); },
    onError: error => { errors.push(error); },
  });
  return { queue, initial, requests, saved, errors, get visible() { return visible; } };
}

it("checks immediately before the server responds without mutating confirmed data", async () => {
  const f = fixture();
  const save = f.queue.toggle("s1");
  expect(Boolean(f.visible.progress.a.s1)).toBe(true);
  expect(f.initial.progress.a).toEqual({});
  expect(f.saved).toHaveLength(0);
  f.requests[0].task.resolve(groupWith({ s1: "server-time" }));
  await save;
  expect(f.visible.progress.a.s1).toBe("server-time");
  expect(f.saved).toHaveLength(1);
});

it("unchecks immediately and restores the original completion if saving fails", async () => {
  const f = fixture({ s1: "original-time" });
  const save = f.queue.toggle("s1").catch(() => undefined);
  expect(f.visible.progress.a.s1).toBeUndefined();
  f.requests[0].task.reject(new Error("offline"));
  await save;
  expect(f.visible.progress.a.s1).toBe("original-time");
  expect(f.errors).toHaveLength(1);
});

it("serializes writes and retains later optimistic changes after an earlier response", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1");
  const second = f.queue.toggle("s2");
  expect(f.requests).toHaveLength(1);
  expect(Boolean(f.visible.progress.a.s1)).toBe(true);
  expect(Boolean(f.visible.progress.a.s2)).toBe(true);
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await first;
  expect(f.requests).toHaveLength(2);
  expect(Boolean(f.visible.progress.a.s2)).toBe(true);
  f.requests[1].task.resolve(groupWith({ s1: "saved", s2: "saved" }));
  await second;
  expect(f.visible.progress.a).toEqual({ s1: "saved", s2: "saved" });
});

it("honors rapid check-uncheck clicks on the same fragment without flicker", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1");
  const second = f.queue.toggle("s1");
  expect(f.visible.progress.a.s1).toBeUndefined();
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await first;
  expect(f.visible.progress.a.s1).toBeUndefined();
  expect(f.requests.map(request => request.completed)).toEqual([true, false]);
  f.requests[1].task.resolve(groupWith());
  await second;
  expect(f.visible.progress.a.s1).toBeUndefined();
});

it("rolls back only a failed fragment and continues saving other clicks", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1").catch(() => undefined);
  const second = f.queue.toggle("s2");
  f.requests[0].task.reject(new Error("offline"));
  await first;
  expect(f.visible.progress.a.s1).toBeUndefined();
  expect(Boolean(f.visible.progress.a.s2)).toBe(true);
  expect(f.requests).toHaveLength(2);
  f.requests[1].task.resolve(groupWith({ s2: "saved" }));
  await second;
  expect(f.visible.progress.a).toEqual({ s2: "saved" });
});

it("preserves a newer click on the same fragment when an intermediate save fails", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1");
  const second = f.queue.toggle("s1").catch(() => undefined);
  const third = f.queue.toggle("s1");
  f.requests[0].task.resolve(groupWith({ s1: "saved-first" }));
  await first;
  f.requests[1].task.reject(new Error("offline"));
  await second;
  expect(Boolean(f.visible.progress.a.s1)).toBe(true);
  expect(f.requests.map(request => request.completed)).toEqual([true, false, true]);
  f.requests[2].task.resolve(groupWith({ s1: "saved-last" }));
  await third;
  expect(f.visible.progress.a.s1).toBe("saved-last");
});

it("overlays pending changes on refreshed group data", async () => {
  const f = fixture();
  const save = f.queue.toggle("s1");
  const refreshed = groupWith();
  refreshed.name = "Nowa nazwa";
  refreshed.progress.b.other = "new-time";
  f.queue.replaceGroup(refreshed);
  expect(f.visible.name).toBe("Nowa nazwa");
  expect(Boolean(f.visible.progress.a.s1)).toBe(true);
  expect(f.visible.progress.b.other).toBe("new-time");
  refreshed.progress.a.s1 = "saved";
  f.requests[0].task.resolve(refreshed);
  await save;
});

it("ignores stale own progress from a read started before the click", async () => {
  const f = fixture();
  const requestRevision = f.queue.revision;
  const save = f.queue.toggle("s1");
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await save;
  const staleRead = groupWith();
  staleRead.progress.b.other = "fresh-other-progress";
  const merged = f.queue.replaceGroup(staleRead, requestRevision);
  expect(merged.progress.a.s1).toBe("saved");
  expect(f.visible.progress.a.s1).toBe("saved");
  expect(f.visible.progress.b.other).toBe("fresh-other-progress");
});

it("ignores a delayed read started while the save was still pending", async () => {
  const f = fixture();
  const save = f.queue.toggle("s1");
  const requestRevision = f.queue.revision;
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await save;
  f.queue.replaceGroup(groupWith(), requestRevision);
  expect(f.visible.progress.a.s1).toBe("saved");
});

it("accepts current external progress without changing other members", () => {
  const f = fixture();
  f.queue.replaceGroup(groupWith({ s2: "read-on-another-device" }));
  expect(f.visible.progress.a.s2).toBe("read-on-another-device");
  expect(f.visible.progress.b.other).toBe("already-read");
});

it("does not update a departed session but finishes its queued writes", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1");
  const second = f.queue.toggle("s2");
  const lastVisible = f.visible;
  f.queue.setActive(false);
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await first;
  f.requests[1].task.resolve(groupWith({ s1: "saved", s2: "saved" }));
  await second;
  expect(f.saved).toHaveLength(0);
  expect(f.visible).toBe(lastVisible);
  f.queue.setActive(true);
  expect(f.visible.progress.a).toEqual({ s1: "saved", s2: "saved" });
});

it("waits for the base portion while allowing unrelated clicks to stay pending", async () => {
  const f = fixture();
  const first = f.queue.toggle("s1");
  const baseSaved = f.queue.waitForSegments(["s1"]);
  const second = f.queue.toggle("s2");
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await first;
  await baseSaved;
  expect(Boolean(f.visible.progress.a.s2)).toBe(true);
  f.requests[1].task.resolve(groupWith({ s1: "saved", s2: "saved" }));
  await second;
});

it("rejects a dependent recovery chapter if saving its base portion fails", async () => {
  const f = fixture();
  const save = f.queue.toggle("s1").catch(() => undefined);
  const error = new Error("offline");
  const baseSaved = f.queue.waitForSegments(["s1"]).catch(caught => caught);
  f.requests[0].task.reject(error);
  await save;
  expect(await baseSaved).toBe(error);
});

it("can reactivate after effect cleanup without leaving the UI disabled", async () => {
  const f = fixture();
  f.queue.setActive(false);
  f.queue.setActive(true);
  const save = f.queue.toggle("s1");
  expect(Boolean(f.visible.progress.a.s1)).toBe(true);
  f.requests[0].task.resolve(groupWith({ s1: "saved" }));
  await save;
  expect(f.saved).toHaveLength(1);
});
