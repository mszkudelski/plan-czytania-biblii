import { useEffect, useState } from "react";
import type { Credentials } from "./types";
import { useOnboarding, usePromptOffer } from "./Onboarding";
import { getNotificationConfig, notificationSettings } from "./lib/api";
import { notificationDevice, reminderDeviceId, subscribeToReading } from "./lib/push-client";
import { devicePromptAllowed, parseDevicePreference, postponeDevicePrompt, reminderPromptKey, SETUP_KEY } from "./lib/onboarding";

export default function ReminderPrompt({ credentials }: { credentials: Credentials | null }) {
  const queue = useOnboarding();
  const [device, setDevice] = useState(notificationDevice);
  const [deviceId] = useState(reminderDeviceId);
  const [config, setConfig] = useState<{ publicKey: string | null; scheduled: boolean } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState("08:00");
  const [revision, setRevision] = useState(0);
  const key = credentials ? reminderPromptKey(credentials) : "";
  const [preference, setPreference] = useState(() => parseDevicePreference(key ? localStorage.getItem(key) : null));
  useEffect(() => {
    setPreference(parseDevicePreference(key ? localStorage.getItem(key) : null)); setDismissed(false); setError("");
  }, [key]);
  useEffect(() => {
    const refresh = () => setDevice(notificationDevice());
    const changed = () => setRevision(value => value + 1);
    const mode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("focus", refresh); window.addEventListener("appinstalled", refresh); mode.addEventListener("change", refresh);
    window.addEventListener("reading-notifications-changed", changed);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("appinstalled", refresh); mode.removeEventListener("change", refresh); window.removeEventListener("reading-notifications-changed", changed); };
  }, []);
  useEffect(() => {
    if (device.permission === "denied") return;
    setLoaded(false); setFailed(false); setConfig(null); setEnabled(true);
    if (!credentials || !queue.ready || !device.standalone || !device.supported) return;
    let cancelled = false;
    Promise.all([getNotificationConfig(), notificationSettings(credentials, deviceId, "read")]).then(([configuration, settings]) => {
      if (cancelled) return;
      setConfig(configuration); setEnabled(Boolean(settings?.enabled)); setTime(settings?.time ?? "08:00"); setLoaded(true);
      if (settings?.enabled) queue.finish("reminder");
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [credentials?.groupId, credentials?.memberId, credentials?.token, queue.ready, deviceId, device.standalone, device.supported, device.permission, revision, queue.finish]);
  const candidate = Boolean(credentials && loaded && config?.publicKey && device.standalone && !enabled && !dismissed &&
    (device.permission !== "denied" || Boolean(error)) && devicePromptAllowed(preference) && (queue.completed || localStorage.getItem(SETUP_KEY) === "true"));
  const pending = Boolean(credentials && queue.ready && device.standalone && device.supported && device.permission !== "denied" &&
    !loaded && !failed && !dismissed && devicePromptAllowed(preference) && (queue.completed || localStorage.getItem(SETUP_KEY) === "true"));
  const visible = usePromptOffer("reminder", pending ? null : candidate);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!credentials || !config?.publicKey || busy) return;
    setBusy(true); setError("");
    try {
      const subscription = await subscribeToReading(config.publicKey);
      const settings = await notificationSettings(credentials, deviceId, "save", {
        enabled: true, time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, subscription);
      if (!settings?.enabled) throw new Error("Nie udało się zapisać przypomnienia. Spróbuj ponownie.");
      setEnabled(true); localStorage.removeItem(SETUP_KEY); queue.finish("reminder");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Nie udało się włączyć przypomnienia. Spróbuj ponownie."); }
    finally { setBusy(false); }
  }
  function later() {
    if (busy) return;
    const next = postponeDevicePrompt(preference);
    localStorage.setItem(key, JSON.stringify(next)); localStorage.removeItem(SETUP_KEY);
    setPreference(next); setDismissed(true); queue.finish("reminder");
  }
  if (!visible || !candidate) return null;
  return <aside className="recovery-notice reminder-notice" aria-label="Propozycja przypomnienia">
    <div className="recovery-notice-inner"><div><h2>Przypomnieć Ci o czytaniu?</h2>
      <p>Wybierz godzinę codziennego przypomnienia.</p>
      {!config?.scheduled && <p>Wersja testowa zapisuje ustawienia, ale nie wysyła codziennych przypomnień.</p>}
      {error && <p className="recovery-choice-error" role="alert">{error}</p>}</div>
      <form className="reminder-prompt-form" onSubmit={save}>
        <label>Godzina przypomnienia<input type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></label>
        <span className="reminder-prompt-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        <button type="submit" className="main-button" disabled={busy}>{busy ? "Włączanie…" : "Włącz przypomnienia"}</button>
        <button type="button" className="link-button" disabled={busy} onClick={later}>Nie teraz</button>
      </form>
    </div>
  </aside>;
}
