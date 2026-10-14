import type { Config } from "@netlify/functions";
import { storedGroup } from "./api.mjs";
import { localReminderClock, reminderIsDue, todaysReminder } from "../../src/lib/notifications";
import { reminderStore, reminderPrefix, pushConfigured, sendReminder, type StoredReminder } from "./_shared/notifications";

export async function dispatchReminders(now = new Date()) {
  if (!pushConfigured()) throw new Error("Reading push configuration is missing.");
  const store = reminderStore();
  const groups = new Map<string, ReturnType<typeof storedGroup>>();
  // Netlify's iterator follows pagination; branch/test subscriptions are excluded.
  for await (const page of store.list({ prefix: reminderPrefix("production"), paginate: true })) {
    await Promise.all(page.blobs.map(async ({ key }) => {
      const record = await store.getWithMetadata(key, { type: "json" });
      if (!record) return;
      const reminder = record.data as StoredReminder;
      if (!reminderIsDue(reminder, now)) return;
      let groupPromise = groups.get(reminder.groupId);
      if (!groupPromise) {
        groupPromise = storedGroup(reminder.groupId);
        groups.set(reminder.groupId, groupPromise);
      }
      const group = await groupPromise;
      if (!group || !group.members.some(member => member.id === reminder.memberId)) {
        await store.delete(key);
        return;
      }
      const payload = todaysReminder(group, reminder.memberId, now, reminder.timeZone);
      if (!payload) return;
      const date = localReminderClock(now, reminder.timeZone).date;
      const claimKey = `deliveries/${reminder.groupId}/${reminder.memberId}/${reminder.deviceId}/${date}`;
      const claim = await store.set(claimKey, "sent", { onlyIfNew: true });
      if (!claim.modified) return;
      try {
        // Re-read after claiming so a disable/change during a cron invocation wins.
        const current = await store.getWithMetadata(key, { type: "json" });
        if (!current || current.etag !== record.etag) { await store.delete(claimKey); return; }
        await sendReminder(reminder, payload);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await store.delete(key);
        else await store.delete(claimKey);
        // Never log endpoints, payloads, keys or member tokens.
        console.error("Reading push delivery failed", { status: status ?? "network" });
      }
    }));
  }
}

export default async () => { await dispatchReminders(); };
export const config: Config = { schedule: "* * * * *" };
