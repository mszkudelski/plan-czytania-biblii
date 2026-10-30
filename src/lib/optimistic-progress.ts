import type { Group } from "../types";
import { applyChapterProgress } from "./chapter-progress";

type ProgressOperation = {
  segmentId: string;
  indices?: number[];
  migrate?: boolean;
  completed: boolean;
  optimistic: boolean;
  previousValue?: string;
  previousChapters?: number[];
  timestamp: string;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type ProgressQueueOptions = {
  group: Group;
  memberId: string;
  save: (segmentId: string, completed: boolean, indices?: number[], migrate?: boolean) => Promise<Group>;
  onChange: (group: Group) => void;
  onSave: (group: Group, operation: { segmentId: string; completed: boolean }) => void;
  onError: (error: unknown) => void;
};

export function createOptimisticProgressQueue(options: ProgressQueueOptions) {
  let confirmedGroup = options.group;
  const pending: ProgressOperation[] = [];
  let saving = false;
  let active = true;
  let revision = 0;

  function snapshot() {
    if (!pending.length) return confirmedGroup;
    let group = confirmedGroup;
    const activeIds = new Set(group.planDays.flatMap(day => day.segments.map(segment => segment.id)));
    for (const operation of pending) {
      if (group.planVersion && !activeIds.has(operation.segmentId)) continue;
      if (!operation.optimistic) {
        const progress = { ...group.progress[options.memberId] };
        if (operation.previousValue) progress[operation.segmentId] = operation.previousValue;
        else delete progress[operation.segmentId];
        const chapters = { ...group.chapterProgress?.[options.memberId] };
        if (operation.previousChapters) chapters[operation.segmentId] = operation.previousChapters;
        else delete chapters[operation.segmentId];
        group = { ...group, progress: { ...group.progress, [options.memberId]: progress },
          chapterProgress: { ...group.chapterProgress, [options.memberId]: chapters } };
        continue;
      }
      group = applyChapterProgress(group, options.memberId, operation.segmentId,
        operation.completed, operation.indices, operation.timestamp);
    }
    return group;
  }

  function notify() {
    if (active) options.onChange(snapshot());
  }

  async function drain() {
    if (saving) return;
    saving = true;
    try {
      while (pending.length) {
        const operation = pending[0];
        let savedGroup: Group;
        try {
          savedGroup = await options.save(operation.segmentId, operation.completed, operation.indices, operation.migrate);
        } catch (error) {
          pending.shift();
          revision += 1;
          notify();
          if (active) options.onError(error);
          operation.reject(error);
          continue;
        }
        if ((savedGroup.planVersion ?? 0) >= (confirmedGroup.planVersion ?? 0)) confirmedGroup = savedGroup;
        pending.shift();
        revision += 1;
        if (active) options.onSave(confirmedGroup, { segmentId: operation.segmentId, completed: operation.completed });
        notify();
        operation.resolve();
      }
    } finally {
      saving = false;
    }
  }

  return {
    get revision() { return revision; },
    get hasPending() { return pending.length > 0; },
    snapshot,
    waitForSegments(segmentIds: string[]) {
      const writes = pending.filter(operation => segmentIds.includes(operation.segmentId));
      return Promise.all(writes.map(operation => operation.promise)).then(() => undefined);
    },
    setActive(nextActive: boolean) {
      active = nextActive;
      if (active) notify();
    },
    replaceGroup(group: Group, requestRevision = revision) {
      if ((group.planVersion ?? 0) < (confirmedGroup.planVersion ?? 0)) return confirmedGroup;
      // A read started before a click/save must not erase the confirmed changes.
      const nextGroup = requestRevision === revision || (group.planVersion ?? 0) > (confirmedGroup.planVersion ?? 0) ? group : {
        ...group,
        chapterProgress: { ...group.chapterProgress, [options.memberId]: confirmedGroup.chapterProgress?.[options.memberId] ?? {} },
        progress: {
          ...group.progress,
          [options.memberId]: confirmedGroup.progress[options.memberId] ?? {},
        },
      };
      if (confirmedGroup !== nextGroup) {
        confirmedGroup = nextGroup;
        notify();
      }
      return confirmedGroup;
    },
    toggle(segmentId: string, desiredCompleted?: boolean, optimistic = true, indices?: number[], migrate?: boolean) {
      const completed = desiredCompleted ?? !snapshot().progress[options.memberId]?.[segmentId];
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((onSuccess, onFailure) => {
        resolve = onSuccess;
        reject = onFailure;
      });
      pending.push({
        segmentId,
        indices,
        migrate,
        completed,
        optimistic,
        previousValue: snapshot().progress[options.memberId]?.[segmentId],
        previousChapters: snapshot().chapterProgress?.[options.memberId]?.[segmentId],
        timestamp: new Date().toISOString(),
        promise,
        resolve,
        reject,
      });
      revision += 1;
      notify();
      void drain();
      return promise;
    },
  };
}
