import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

function worker() {
  const events: Record<string, (event: any) => void> = {};
  const registration = { showNotification: vi.fn().mockResolvedValue(undefined) };
  const existing = { url: "https://example.test/", navigate: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined) };
  const clients = { matchAll: vi.fn().mockResolvedValue([existing]), openWindow: vi.fn().mockResolvedValue(undefined) };
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { addEventListener: (type: string, callback: (event: any) => void) => { events[type] = callback; },
      registration, clients, location: { origin: "https://example.test" } },
  });
  return { events, registration, clients, existing };
}
it("shows a push notification and safely handles invalid payloads", async () => {
  const { events, registration } = worker();
  let pending: Promise<unknown> = Promise.resolve();
  const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
  events.push({ data: { json: () => ({ title: "Czytanie", body: "Rdz 1", tag: "day", url: "https://evil.test" }) }, waitUntil });
  await pending;
  expect(registration.showNotification).toHaveBeenCalledWith("Czytanie", expect.objectContaining({ body: "Rdz 1", tag: "day", data: { url: "/" } }));
  events.push({ data: { json: () => { throw new Error("bad JSON"); } }, waitUntil });
  await pending;
  expect(registration.showNotification).toHaveBeenLastCalledWith("Czytanie Biblii", expect.objectContaining({ body: "Czas na dzisiejsze czytanie." }));
});
it("opens today's view by navigating and focusing an existing app or opening a new window", async () => {
  const { events, clients, existing } = worker();
  let pending: Promise<unknown> = Promise.resolve();
  const notification = { close: vi.fn() };
  const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
  events.notificationclick({ notification, waitUntil }); await pending;
  expect(notification.close).toHaveBeenCalled();
  expect(existing.navigate).toHaveBeenCalledWith("/");
  expect(existing.focus).toHaveBeenCalled();
  clients.matchAll.mockResolvedValueOnce([]);
  events.notificationclick({ notification, waitUntil }); await pending;
  expect(clients.openWindow).toHaveBeenCalledWith("/");
});
