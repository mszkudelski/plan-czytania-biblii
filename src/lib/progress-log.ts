import type { Group } from "../types";

const PREFIX = "progress-v1/";
export function progressLogPrefix(groupId: string) {
  return PREFIX + groupId + "/";
}

export function progressLogKey(
  groupId: string,
  memberId: string,
  segmentIndex: number,
  completed: boolean,
  timestamp = Date.now(),
  nonce = crypto.randomUUID(),
) {
  return `${progressLogPrefix(groupId)}${memberId}/${segmentIndex}/${String(timestamp).padStart(13, "0")}-${nonce}/${completed ? "1" : "0"}`;
}

// Independent immutable writes avoid replacing the entire group for each click.
// Existing progress is the baseline, so no migration of existing plans is needed.
export function applyProgressLog<T extends Group>(group: T, keys: string[]): T {
  const prefix = progressLogPrefix(group.id);
  const segments = group.planDays.flatMap(day => day.segments);
  const progress = Object.fromEntries(group.members.map(member => [
    member.id, { ...group.progress[member.id] },
  ]));
  for (const key of [...keys].sort()) {
    if (!key.startsWith(prefix)) continue;
    const [memberId, indexText, version, completed, ...rest] = key.slice(prefix.length).split("/");
    const index = Number(indexText);
    if (rest.length || !/^\d+$/.test(indexText) || !Number.isSafeInteger(index) ||
        !/^\d{13}-[a-f0-9-]+$/.test(version) ||
        !Object.hasOwn(progress, memberId) || !segments[index] ||
        !["0", "1"].includes(completed)) continue;
    const segmentId = segments[index].id;
    if (completed === "1") {
      progress[memberId][segmentId] = new Date(Number(version.slice(0, 13))).toISOString();
    } else {
      delete progress[memberId][segmentId];
    }
  }
  return { ...group, progress };
}
