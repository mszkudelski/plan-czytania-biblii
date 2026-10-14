import { beforeEach, expect, it, vi } from "vitest";
import { notificationSupportMessage, reminderDeviceId, subscribeToReading } from "./push-client";
beforeEach(() => {
  vi.stubGlobal("window", { isSecureContext: true, Notification: {}, PushManager: {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("navigator", { userAgent: "Desktop", platform: "Linux", maxTouchPoints: 0, serviceWorker: { register: vi.fn() } });
});
it("uses a stable device identity without storing session credentials", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  expect(reminderDeviceId()).toBe(reminderDeviceId());
  expect([...values.keys()]).toEqual(["reading-notification-device"]);
});
it("explains the iOS home screen prerequisite and unsupported browsers", () => {
  Object.assign(navigator, { userAgent: "iPhone AppleWebKit", platform: "iPhone" });
  expect(notificationSupportMessage()).toContain("ekranu początkowego");
  Object.assign(navigator, { userAgent: "Desktop", platform: "Linux" });
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  expect(notificationSupportMessage()).toContain("nie obsługuje");
});
it("does not subscribe or register a worker after permission is refused", async () => {
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
  await expect(subscribeToReading("abc")).rejects.toThrow("Zezwól");
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});
it("registers a worker after consent and replaces a subscription for a different VAPID key", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const data = { endpoint: "https://fcm.googleapis.com/test", keys: { p256dh: "public", auth: "auth" } };
  const subscribe = vi.fn().mockResolvedValue({ toJSON: () => data });
  const registration = { pushManager: {
    getSubscription: vi.fn().mockResolvedValueOnce({ options: { applicationServerKey: new Uint8Array([9]).buffer }, unsubscribe }).mockResolvedValueOnce(null),
    subscribe,
  } };
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
  Object.assign(navigator.serviceWorker, { ready: Promise.resolve(registration) });
  expect(await subscribeToReading("AQI")).toEqual(data);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2]) });
});
it("recognizes an iPad desktop user agent outside Safari as requiring installation", () => {
  Object.assign(navigator, { userAgent: "Mozilla/5.0 Macintosh AppleWebKit CriOS/130.0", platform: "MacIntel", maxTouchPoints: 5 });
  expect(notificationSupportMessage()).toContain("ekranu początkowego");
});
it("does not require installation in an iOS home-screen app", () => {
  Object.assign(navigator, { userAgent: "iPhone AppleWebKit", platform: "iPhone", standalone: true });
  expect(notificationSupportMessage()).toBe("");
});
it("lets the user retry a dismissed permission prompt without changing system settings", async () => {
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("default") });
  await expect(subscribeToReading("abc")).rejects.toThrow("Kliknij ponownie");
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});
