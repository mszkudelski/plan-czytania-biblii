import type { Group } from "../types";

export type ReminderSettings = { enabled: boolean; time: string; timeZone: string };
export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } };

export function validReminderSettings(value: unknown): value is ReminderSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as ReminderSettings;
  if (typeof settings.enabled !== "boolean" || typeof settings.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time) || typeof settings.timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }).format();
    return settings.timeZone.length <= 100;
  } catch { return false; }
}

export function validPushSubscription(value: unknown): value is PushSubscriptionData {
  if (!value || typeof value !== "object") return false;
  const subscription = value as PushSubscriptionData;
  try {
    const url = new URL(subscription.endpoint);
    // Subscription endpoints are server destinations: reject arbitrary hosts,
    // ports, credentials and redirects, including private-network addresses.
    const allowed = url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") ||
      url.hostname === "wns.windows.com" || url.hostname.endsWith(".wns.windows.com");
    return allowed && url.protocol === "https:" && !url.port && !url.username && !url.password &&
      subscription.endpoint.length <= 2048 && Boolean(url.pathname.length > 1) &&
      typeof subscription.keys?.p256dh === "string" && /^[A-Za-z0-9_-]{87}=?$/.test(subscription.keys.p256dh) &&
      typeof subscription.keys.auth === "string" && /^[A-Za-z0-9_-]{22}={0,2}$/.test(subscription.keys.auth);
  } catch { return false; }
}

export function localReminderClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minute: +part("hour") * 60 + +part("minute") };
}

export function reminderIsDue(settings: ReminderSettings, now: Date) {
  if (!settings.enabled || !validReminderSettings(settings)) return false;
  const { minute } = localReminderClock(now, settings.timeZone);
  const [hour, minutes] = settings.time.split(":").map(Number);
  const elapsed = minute - (hour * 60 + minutes);
  // Small retry window for a delayed invocation; never send before the chosen time.
  return elapsed >= 0 && elapsed < 15;
}

function readingReminderPayload(group: Group, labels: string[], tag: string) {
  return {
    title: "Dzisiejsze czytanie Biblii",
    body: `${group.name}: ${labels.join(" · ")}`.slice(0, 700),
    tag,
  };
}

export function todaysReminder(group: Group, memberId: string, now: Date, timeZone: string) {
  if (!group.members.some(member => member.id === memberId)) return null;
  const { date } = localReminderClock(now, timeZone);
  const segments = group.planDays.filter(day => day.date === date).flatMap(day => day.segments);
  const remaining = segments.filter(segment => !group.progress[memberId]?.[segment.id]);
  if (!remaining.length) return null;
  return readingReminderPayload(group, remaining.map(segment => segment.label), `reading-${group.id}-${memberId}-${date}`);
}

export function testReminder(group: Group, memberId: string, deviceId: string, now: Date, timeZone: string) {
  if (!group.members.some(member => member.id === memberId)) return null;
  const tag = `reading-test-${deviceId}`;
  let payload = todaysReminder(group, memberId, now, timeZone);
  if (!payload) {
    // A test remains available on rest days and after completing today's reading.
    // Preview real fragments from the plan, using the production formatter.
    const unread = group.planDays.map(day => day.segments.filter(segment => !group.progress[memberId]?.[segment.id]));
    const sample = unread.find(segments => segments.length) ?? group.planDays.find(day => day.segments.length)?.segments;
    if (!sample?.length) return null;
    payload = readingReminderPayload(group, sample.map(segment => segment.label), tag);
  }
  return { ...payload, title: `${payload.title} (test)`, tag };
}
