import { useEffect, useState, type FormEvent } from "react";
import { getNotificationConfig, notificationSettings } from "./lib/api";
import { notificationSupportMessage, reminderDeviceId, subscribeToReading } from "./lib/push-client";
import type { ReminderSettings } from "./lib/notifications";
import type { Credentials } from "./types";

export default function NotificationSettings({ credentials }: { credentials: Credentials }) {
  const [deviceId] = useState(reminderDeviceId);
  const [settings, setSettings] = useState<ReminderSettings>({
    enabled: false, time: "08:00", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [config, setConfig] = useState<{ publicKey: string | null; scheduled: boolean } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const support = notificationSupportMessage();
  const denied = "Notification" in window && Notification.permission === "denied";
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getNotificationConfig(), notificationSettings(credentials, deviceId, "read")])
      .then(([configuration, saved]) => {
        if (!active) return;
        setConfig(configuration);
        if (saved) setSettings(saved);
        setLoaded(true);
      }).catch(() => { if (active) setError("Nie udało się wczytać ustawień powiadomień. Otwórz ponownie Ustawienia, aby spróbować jeszcze raz."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [credentials, deviceId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!config?.publicKey) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const subscription = await subscribeToReading(config.publicKey);
      const value = await notificationSettings(credentials, deviceId, "save", { ...settings, enabled: true }, subscription);
      if (value) setSettings(value);
      setMessage("Zapisano przypomnienie na tym urządzeniu.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się włączyć powiadomień.");
    } finally { setBusy(false); }
  }

  async function action(kind: "disable" | "test") {
    setBusy(true); setError(""); setMessage("");
    try {
      await notificationSettings(credentials, deviceId, kind);
      if (kind === "disable") {
        setSettings(current => ({ ...current, enabled: false }));
        setMessage("Przypomnienia na tym urządzeniu są wyłączone.");
      } else setMessage("Wysłano powiadomienie testowe.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się zmienić powiadomień.");
    } finally { setBusy(false); }
  }

  return <>
    <h2 className="settings-heading">Powiadomienia o czytaniu</h2>
    <section className="settings-card notification-card" aria-label="Powiadomienia o czytaniu">
      <p>Przypomnij mi o dzisiejszym czytaniu, także po zamknięciu aplikacji. Po ukończeniu dzisiejszych fragmentów przypomnienie nie zostanie wysłane.</p>
      <p className="notification-status">Status: {settings.enabled ? "włączone na tym urządzeniu" : "wyłączone"}</p>
      {support && <p>{support}</p>}
      {denied && <p role="alert">Powiadomienia są zablokowane. Zezwól na nie w ustawieniach przeglądarki.</p>}
      {config && !config.publicKey && <p>Powiadomienia nie są jeszcze skonfigurowane na serwerze.</p>}
      {config && !config.scheduled && <p className="notification-preview">Wersja testowa: możesz zapisać ustawienia i wysłać test. Automatyczne przypomnienia działają w wersji produkcyjnej.</p>}
      <form onSubmit={save}>
        <label className="simple-field">
          <span>Godzina przypomnienia</span>
          <input type="time" required value={settings.time} disabled={busy} onChange={event => setSettings(current => ({ ...current, time: event.target.value }))} />
        </label>
        <p>Strefa czasowa: {settings.timeZone}. Ustawienie dotyczy wyłącznie Ciebie i tego urządzenia.</p>
        <button className="main-button" disabled={busy || !loaded || !!support || denied || !config?.publicKey}>
          {busy ? "Proszę czekać…" : settings.enabled ? "Zapisz godzinę" : "Włącz przypomnienia"}
        </button>
      </form>
      {settings.enabled && <div className="notification-actions">
        <button className="small-button" disabled={busy || !!support || denied} onClick={() => void action("test")}>Wyślij powiadomienie testowe</button>
        <button className="small-button" disabled={busy} onClick={() => void action("disable")}>Wyłącz przypomnienia</button>
      </div>}
      {error && <div className="simple-alert" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
    </section>
  </>;
}
