import type { Group } from "../types";
import { applyChapterProgress } from "./chapter-progress";
import { splitReadingChapters } from "./recovery";

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
  nonce: string = crypto.randomUUID(),
) {
  return `${progressLogPrefix(groupId)}${memberId}/${segmentIndex}/${String(timestamp).padStart(13, "0")}-${nonce}/${completed ? "1" : "0"}`;
}

// Independent immutable writes avoid replacing the entire group for each click.
// Existing progress is the baseline, so no migration of existing plans is needed.
export function chapterProgressLogKey(groupId: string, memberId: string, segmentIndex: number,
  completed: boolean, indices: number[], migrate = false, timestamp = Date.now(), nonce: string = crypto.randomUUID()) {
  return progressLogKey(groupId, memberId, segmentIndex, completed, migrate ? 0 : timestamp, nonce)
    + ":" + [...new Set(indices)].sort((a, b) => a - b).map(index => index.toString(36)).join(".");
}

export function applyProgressLog<T extends Group>(group: T, keys: string[]): T {
  const prefix = progressLogPrefix(group.id);
  const segments = group.planDays.flatMap(day => day.segments);
  const segmentIds = group.progressSegmentIds ?? segments.map(segment => segment.id);
  const activeIds = new Set(segments.map(segment => segment.id));
  const progress = Object.fromEntries(group.members.map(member => [
    member.id, Object.fromEntries(Object.entries(group.progress[member.id] ?? {}).filter(([id]) => activeIds.has(id))),
  ]));
  const chapterProgress = Object.fromEntries(group.members.map(member => [member.id,
    Object.fromEntries(Object.entries(group.chapterProgress?.[member.id] ?? {}).filter(([id]) => activeIds.has(id))),
  ]));
  let result = { ...group, progress, chapterProgress } as T;
  for (const key of [...keys].sort()) {
    if (!key.startsWith(prefix)) continue;
    const [memberId, indexText, version, action, ...rest] = key.slice(prefix.length).split("/");
    const index = Number(indexText);
    const [completed, chapterText] = action?.split(":") ?? [];
    if (rest.length || !/^\d+$/.test(indexText) || !Number.isSafeInteger(index) ||
        !/^\d{13}-[a-f0-9-]+$/.test(version) ||
        !Object.hasOwn(progress, memberId) || !segmentIds[index] || !activeIds.has(segmentIds[index]) ||
        !["0", "1"].includes(completed)) continue;
    const segmentId = segmentIds[index];
    const indices = chapterText === undefined ? undefined : chapterText.split(".").map(value => parseInt(value, 36));
    const count = splitReadingChapters(segments.find(segment => segment.id === segmentId)!.label).length;
    if (action.split(":").length > 2 || indices && (!/^[0-9a-z]+(\.[0-9a-z]+)*$/.test(chapterText!) ||
      indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= count))) continue;
    // Legacy imports are lower priority than every real server operation and
    // must not alter an already completed baseline fragment.
    if (version.startsWith("0000000000000-") && group.progress[memberId]?.[segmentId]) continue;
    result = applyChapterProgress(result, memberId, segmentId, completed === "1", indices,
      new Date(Number(version.slice(0, 13))).toISOString());
  }
  return result;
}
