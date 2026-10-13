import type { Credentials, Group } from "../types";

export type PromptKind = "install" | "reminder" | "recovery";
export type Visit = { id: string; lastActivity: number; offered: PromptKind[] };
export type DevicePreference = { dismissals: number; until: number; disabled: boolean };
export const VISIT_KEY = "reading-onboarding-visit";
export const INSTALL_KEY = "reading-onboarding-install";
export const SETUP_KEY = "reading-onboarding-install-started";
export const WEEK = 7 * 86400000;
export const VISIT_GAP = 30 * 60000;
export const DEFAULT_DEVICE_PREFERENCE: DevicePreference = { dismissals: 0, until: 0, disabled: false };
export const profileKey = (credentials: Pick<Credentials, "groupId" | "memberId">) =>
  `reading-onboarding:${credentials.groupId}:${credentials.memberId}`;
export const reminderPromptKey = (credentials: Pick<Credentials, "groupId" | "memberId">) =>
  `${profileKey(credentials)}:reminder`;

export function parseVisit(value: string | null): Visit | null {
  try {
    const v = JSON.parse(value ?? "null");
    return v && typeof v.id === "string" && Number.isFinite(v.lastActivity) && Array.isArray(v.offered) &&
      v.offered.every((k: unknown) => ["install", "reminder", "recovery"].includes(k as string)) ? v : null;
  } catch { return null; }
}
export function continueVisit(previous: Visit | null, now: number, newId: string): Visit {
  return previous && now >= previous.lastActivity && now - previous.lastActivity < VISIT_GAP
    ? { ...previous, lastActivity: now } : { id: newId, lastActivity: now, offered: [] };
}
export function nextPrompt(eligible: Partial<Record<PromptKind, boolean | null>>, visit: Visit, setupPending = false): PromptKind | null {
  if (!visit.offered.length) {
    for (const kind of ["install", "reminder", "recovery"] as const) {
      if (eligible[kind] === null) return null;
      if (eligible[kind]) return kind;
    }
    return null;
  }
  // A reminder is an optional continuation of an installation the user initiated.
  return setupPending && visit.offered.length === 1 && visit.offered[0] === "install" && eligible.reminder
    ? "reminder" : null;
}
export function parseDevicePreference(value: string | null): DevicePreference {
  try {
    const p = JSON.parse(value ?? "null");
    if (p && Number.isInteger(p.dismissals) && p.dismissals >= 0 && Number.isFinite(p.until) && typeof p.disabled === "boolean") return p;
  } catch { /* Use the default when browser storage is corrupt. */ }
  return { ...DEFAULT_DEVICE_PREFERENCE };
}
export function postponeDevicePrompt(preference: DevicePreference, now = Date.now()): DevicePreference {
  const dismissals = preference.dismissals + 1;
  return { dismissals, until: now + WEEK, disabled: dismissals >= 2 };
}
export function devicePromptAllowed(preference: DevicePreference, now = Date.now()) {
  return !preference.disabled && preference.until <= now;
}
export function hasCompletedReading(group: Group | null, memberId?: string) {
  if (!group || !memberId) return false;
  const progress = group.progress[memberId] ?? {};
  return group.planDays.some(day => day.segments.length > 0 && day.segments.every(segment => Boolean(progress[segment.id])));
}
export function startOnboarding(credentials: Credentials) {
  const visit = continueVisit(parseVisit(localStorage.getItem(VISIT_KEY)), Date.now(), crypto.randomUUID());
  localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  localStorage.setItem(profileKey(credentials), JSON.stringify({ firstVisit: visit.id }));
}
