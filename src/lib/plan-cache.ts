import type { Group } from "../types";

export type CachedGroup = {
  group: Group;
  savedAt: string;
};

const CACHE_KEY_PREFIX = "plan-czytania-biblii-group-";

function cacheKey(groupId: string) {
  return `${CACHE_KEY_PREFIX}${groupId}`;
}

export function loadCachedGroup(groupId: string): CachedGroup | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(cacheKey(groupId)) ?? "null",
    ) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const cached = parsed as {
      group?: unknown;
      savedAt?: unknown;
    };
    if (
      !cached.group ||
      typeof cached.group !== "object" ||
      (cached.group as { id?: unknown }).id !== groupId ||
      typeof cached.savedAt !== "string"
    ) {
      return null;
    }
    return {
      group: cached.group as Group,
      savedAt: cached.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveCachedGroup(group: Group) {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(
      cacheKey(group.id),
      JSON.stringify({ group, savedAt }),
    );
  } catch {
    // A full or unavailable local storage must not block the live app.
  }
  return savedAt;
}

export function clearCachedGroup(groupId: string) {
  try {
    localStorage.removeItem(cacheKey(groupId));
  } catch {
    // A cleared cache is best-effort only.
  }
}
