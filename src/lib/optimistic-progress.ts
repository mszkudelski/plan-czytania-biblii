import type { Group } from "../types";

type ProgressOperation = {
  segmentId: string;
  completed: boolean;
  timestamp: string;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type ProgressQueueOptions = {
  group: Group;
  memberId: string;
  save: (segmentId: string, completed: boolean) => Promise<Group>;
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
    const progress = { ...confirmedGroup.progress[options.memberId] };
    const activeIds = new Set(confirmedGroup.planDays.flatMap(day => day.segments.map(segment => segment.id)));
    for (const operation of pending) {
      if (confirmedGroup.planVersion && !activeIds.has(operation.segmentId)) continue;
      if (operation.completed) progress[operation.segmentId] = operation.timestamp;
      else delete progress[operation.segmentId];
    }
    return {
      ...confirmedGroup,
      progress: { ...confirmedGroup.progress, [options.memberId]: progress },
    };
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
          savedGroup = await options.save(operation.segmentId, operation.completed);
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
    toggle(segmentId: string, desiredCompleted?: boolean) {
      const completed = desiredCompleted ?? !snapshot().progress[options.memberId]?.[segmentId];
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((onSuccess, onFailure) => {
        resolve = onSuccess;
        reject = onFailure;
      });
      pending.push({
        segmentId,
        completed,
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
