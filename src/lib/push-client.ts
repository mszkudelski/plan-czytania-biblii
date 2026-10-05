import { isIosSafariBrowser, isStandaloneApp } from "./install";
import type { PushSubscriptionData } from "./notifications";

export function reminderDeviceId() {
  const key = "reading-notification-device";
  let id = localStorage.getItem(key);
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function notificationSupportMessage() {
  const standalone = isStandaloneApp(window.matchMedia("(display-mode: standalone)").matches, Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIosSafariBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  if (ios && !standalone) return "Na iPhonie lub iPadzie dodaj aplikację do ekranu początkowego i otwórz ją z jej ikony, aby włączyć powiadomienia.";
  if (!window.isSecureContext || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return "Ta przeglądarka nie obsługuje powiadomień push. Otwórz aplikację w przeglądarce obsługującej powiadomienia.";
  }
  return "";
}

export function applicationServerKey(publicKey: string) {
  const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

export async function subscribeToReading(publicKey: string): Promise<PushSubscriptionData> {
  // Call directly from the click/submit gesture, before any network request.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Zezwól na powiadomienia w ustawieniach przeglądarki, a następnie spróbuj ponownie.");
  await navigator.serviceWorker.register("/sw.js");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Nie udało się uruchomić powiadomień. Odśwież aplikację i spróbuj ponownie.")), 10000); }),
    ]);
    const existing = await registration.pushManager.getSubscription();
    if (existing?.options.applicationServerKey) {
      const saved = new Uint8Array(existing.options.applicationServerKey);
      const expected = applicationServerKey(publicKey);
      if (saved.length !== expected.length || saved.some((byte, index) => byte !== expected[index])) await existing.unsubscribe();
    }
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey),
    });
    const value = subscription.toJSON();
    if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error("Nie udało się zapisać subskrypcji powiadomień.");
    return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
  } finally { clearTimeout(timeout); }
}
