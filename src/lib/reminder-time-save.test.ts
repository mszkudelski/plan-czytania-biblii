import { expect, it } from "vitest";
import { createReminderTimeSaver } from "./reminder-time-save";
const value = (time: string) => ({ enabled: true, time, timeZone: "Europe/Warsaw" });
it("writes rapid input changes in order and leaves the server at the last selected time", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const times: string[] = [];
  const save = createReminderTimeSaver(async settings => {
    times.push(settings.time);
    if (times.length === 1) await gate;
    return settings;
  });
  const first = save(value("06:10")); const last = save(value("07:45"));
  await Promise.resolve(); expect(times).toEqual(["06:10"]);
  release(); await first; expect(await last).toEqual(value("07:45"));
  expect(times).toEqual(["06:10", "07:45"]);
});
it("allows the next change and a retry after a rejected write", async () => {
  let attempts = 0;
  const save = createReminderTimeSaver(async settings => {
    if (++attempts === 1) throw new Error("offline");
    return settings;
  });
  const failed = save(value("06:10")); const next = save(value("07:45"));
  await expect(failed).rejects.toThrow("offline");
  expect(await next).toEqual(value("07:45"));
  expect(await save(value("07:45"))).toEqual(value("07:45"));
});
