import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

function worker() {
  const events: Record<string, (event: any) => void> = {};
  const registration = { showNotification: vi.fn().mockResolvedValue(undefined) };
  const existing = { url: "https://example.test/", navigate: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined) };
  const clients = { matchAll: vi.fn().mockResolvedValue([existing]), openWindow: vi.fn().mockResolvedValue(undefined) };
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL, URLSearchParams, self: { addEventListener: (type: string, callback: (event: any) => void) => { events[type] = callback; },
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
it("preserves the reading destination from a push and ignores foreign destinations", async () => {
  const { events, registration } = worker();
  let pending: Promise<unknown> = Promise.resolve();
  const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
  events.push({ data: { json: () => ({ url: "https://example.test/?reading=group&day=old-day" }) }, waitUntil });
  await pending;
  expect(registration.showNotification).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ data: { url: "/?reading=group&day=old-day" } }));
  events.push({ data: { json: () => ({ url: "https://evil.test/?reading=group&day=old-day" }) }, waitUntil });
  await pending;
  expect(registration.showNotification).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ data: { url: "/" } }));
});
it("opens the notified day by navigating and focusing an existing app or opening a new window", async () => {
  const { events, clients, existing } = worker();
  let pending: Promise<unknown> = Promise.resolve();
  const notification = { close: vi.fn(), data: { url: "/?reading=group&day=old-day" } };
  const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
  events.notificationclick({ notification, waitUntil }); await pending;
  expect(notification.close).toHaveBeenCalled();
  expect(existing.navigate).toHaveBeenCalledWith("/?reading=group&day=old-day");
  expect(existing.focus).toHaveBeenCalled();
  clients.matchAll.mockResolvedValueOnce([]);
  events.notificationclick({ notification, waitUntil }); await pending;
  expect(clients.openWindow).toHaveBeenCalledWith("/?reading=group&day=old-day");
});
it("opens old notifications safely and rejects tampered click destinations", async () => {
  const { events, clients } = worker();
  clients.matchAll.mockResolvedValue([]);
  for (const data of [undefined, { url: "https://evil.test/" }, { url: "/?reading=g" }]) {
    let pending: Promise<unknown> = Promise.resolve();
    events.notificationclick({ notification: { close: vi.fn(), data }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(clients.openWindow).toHaveBeenLastCalledWith("/");
  }
});
