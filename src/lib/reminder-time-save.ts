import type { ReminderSettings } from "./notifications";

// Keep server writes in the order of input changes, even after a failed write.
export function createReminderTimeSaver(write: (settings: ReminderSettings) => Promise<ReminderSettings | null>) {
  let pending = Promise.resolve();
  return (settings: ReminderSettings) => {
    const result = pending.then(() => write(settings));
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
}
