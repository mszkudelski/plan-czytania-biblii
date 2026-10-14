import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import type { ReminderSettings, PushSubscriptionData } from "../../../src/lib/notifications";

export type StoredReminder = ReminderSettings & {
  groupId: string;
  memberId: string;
  deviceId: string;
  subscription: PushSubscriptionData;
  origin: string;
};

export function reminderStore() {
  return getStore({ name: "plan-czytania-notifications", consistency: "strong" });
}

export function reminderPrefix(scope: string) { return `subscriptions/${encodeURIComponent(scope)}/`; }
export function reminderKey(scope: string, deviceId: string, groupId: string, memberId: string) {
  return `${reminderPrefix(scope)}${groupId}/${memberId}/${deviceId}`;
}
export function pushConfigured() {
  return Boolean(Netlify.env.get("READING_PUSH_VAPID_PUBLIC_KEY") && Netlify.env.get("READING_PUSH_VAPID_PRIVATE_KEY"));
}

export function missingPushConfiguration() {
  return ["READING_PUSH_VAPID_PUBLIC_KEY", "READING_PUSH_VAPID_PRIVATE_KEY"].filter(key => !Netlify.env.get(key));
}

export async function sendReminder(reminder: StoredReminder, payload: { title: string; body: string; tag: string }) {
  return webpush.sendNotification(reminder.subscription, JSON.stringify({ ...payload, url: `${reminder.origin}/` }), {
    vapidDetails: {
      subject: "https://plan-czytania.netlify.app",
      publicKey: Netlify.env.get("READING_PUSH_VAPID_PUBLIC_KEY")!,
      privateKey: Netlify.env.get("READING_PUSH_VAPID_PRIVATE_KEY")!,
    },
    TTL: 60 * 60,
    timeout: 5000,
    urgency: "normal",
  });
}
