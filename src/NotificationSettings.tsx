import { useEffect, useState, type FormEvent } from "react";
import { getNotificationConfig, notificationSettings } from "./lib/api";
import { notificationDevice, reminderDeviceId, subscribeToReading } from "./lib/push-client";
import type { ReminderSettings } from "./lib/notifications";
import type { Credentials } from "./types";
import NotificationTestControls, { notificationTestsAllowed } from "./NotificationTestControls";

export default function NotificationSettings({ credentials }: { credentials: Credentials }) {
  const [deviceId] = useState(reminderDeviceId);
  const [device, setDevice] = useState(notificationDevice);
  const [settings, setSettings] = useState<ReminderSettings>({
    enabled: false, time: "08:00", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [savedTime, setSavedTime] = useState("");
  const [config, setConfig] = useState<{ publicKey: string | null; scheduled: boolean } | null>(null);
  const [operation, setOperation] = useState<"loading" | "save" | "disable" | "test" | null>("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [testSent, setTestSent] = useState(false);
  const denied = device.permission === "denied";
  const ready = !device.needsInstall && device.supported;
  const busy = operation !== null;
  const canSave = loaded && !!config?.publicKey && ready && !denied;
  const canTest = notificationTestsAllowed(config?.scheduled);

  function refreshDevice() { setDevice(notificationDevice()); }

  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("focus", refreshDevice);
    window.addEventListener("appinstalled", refreshDevice);
    document.addEventListener("visibilitychange", refreshDevice);
    mode.addEventListener("change", refreshDevice);
    return () => {
      window.removeEventListener("focus", refreshDevice);
      window.removeEventListener("appinstalled", refreshDevice);
      document.removeEventListener("visibilitychange", refreshDevice);
      mode.removeEventListener("change", refreshDevice);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setOperation("loading"); setError(""); setLoaded(false);
    void Promise.all([getNotificationConfig(), notificationSettings(credentials, deviceId, "read")])
      .then(([configuration, saved]) => {
        if (!active) return;
        setConfig(configuration);
        if (saved) { setSettings(saved); setSavedTime(saved.time); }
        else { setSettings(current => ({ ...current, enabled: false })); setSavedTime(""); }
        setLoaded(true);
      }).catch(() => { if (active) setError("Nie udało się wczytać ustawień. Sprawdź połączenie z internetem i spróbuj ponownie."); })
      .finally(() => { if (active) setOperation(null); });
    return () => { active = false; };
  }, [credentials, deviceId, retry]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave || busy || !config?.publicKey) return;
    setOperation("save"); setError(""); setMessage("");
    try {
      const subscription = await subscribeToReading(config.publicKey);
      const value = await notificationSettings(credentials, deviceId, "save", { ...settings, enabled: true }, subscription);
      if (value) { setSettings(value); setSavedTime(value.time); }
      setMessage(`Zapisano godzinę ${settings.time}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się włączyć powiadomień. Spróbuj ponownie.");
    } finally { setOperation(null); refreshDevice(); }
  }

  async function action(kind: "disable" | "test") {
    if (kind === "test" && !canTest) return;
    setOperation(kind); setError(""); setMessage("");
    try {
      await notificationSettings(credentials, deviceId, kind);
      if (kind === "disable") {
        setSettings(current => ({ ...current, enabled: false })); setTestSent(false);
        setMessage("Przypomnienia na tym urządzeniu są wyłączone. Możesz je włączyć ponownie w dowolnej chwili.");
      } else {
        setTestSent(true);
        setMessage("Wysłano powiadomienie testowe. Sprawdź ekran blokady lub centrum powiadomień.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się wykonać tej czynności. Spróbuj ponownie.");
    } finally { setOperation(null); }
  }

  const timeForm = <form onSubmit={save}>
    <label className="simple-field">
      <span>Godzina przypomnienia</span>
      <input type="time" required value={settings.time} disabled={busy} onChange={event => setSettings(current => ({ ...current, time: event.target.value }))} aria-describedby="reminder-time-zone" />
    </label>
    <p id="reminder-time-zone" className="notification-hint">Czas: {settings.timeZone}.</p>
    {!settings.enabled && <p>Po kliknięciu przycisku wybierz <strong>„Zezwól”</strong> w oknie przeglądarki.</p>}
    <button className="main-button" disabled={busy || !canSave}>{operation === "save" ? "Zapisywanie…" : settings.enabled ? "Zapisz godzinę" : "Włącz przypomnienia"}</button>
  </form>;

  let content;
  if (device.needsInstall) {
    content = <>
      <h3>Chcesz włączyć powiadomienia?</h3>
      <p>Dodaj aplikację do ekranu głównego i otwórz ją z ikony.</p>
      <details className="notification-help">
        <summary>Jak zainstalować aplikację?</summary>
        <ol className="notification-install-steps">
          <li>W {device.browser === "chrome" ? "Chrome" : "Safari"} stuknij <strong>Udostępnij</strong> <svg className="notification-share" aria-label="kwadrat ze strzałką w górę" role="img" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 15V2m-4 4 4-4 4 4M7 9H4v12h16V9h-3" /></svg>. {device.browser === "safari" && "Jeśli przycisk jest schowany, otwórz menu „Więcej”."}</li>
          <li>Wybierz <strong>Dodaj do ekranu początkowego</strong> (lub „Dodaj do ekranu głównego”).</li>
          <li>Jeśli widzisz opcję <strong>Otwórz jako aplikację webową</strong>, włącz ją. Potem stuknij <strong>Dodaj</strong>.</li>
          <li>Na ekranie głównym otwórz ikonę <strong>Plan czytania Biblii</strong> i wróć do <strong>Ustawienia → Powiadomienia o czytaniu</strong>.</li>
        </ol>
        {device.browser === "other" && <p>Nie widzisz tych opcji? Otwórz stronę w Safari.</p>}
        <details className="notification-help">
          <summary>Po instalacji nie widzę swojego planu</summary>
          <p>W przeglądarce wybierz <strong>Ustawienia → Przeniesienie sesji</strong> i utwórz kod. W aplikacji wybierz <strong>„Mam już plan na innym urządzeniu → przenieś sesję”</strong> i wpisz kod.</p>
        </details>
      </details>
    </>;
  } else if (!device.supported) {
    content = <>
      <h3>Ta przeglądarka nie obsługuje powiadomień</h3>
      <p>{device.ios ? "Zaktualizuj iOS lub iPadOS do wersji 16.4 lub nowszej i otwórz aplikację z ikony." : "Otwórz plan w aktualnej wersji Chrome, Edge, Firefox lub Safari, w zwykłym oknie."}</p>
    </>;
  } else if (!loaded) {
    content = operation === "loading" ? <p role="status">Sprawdzamy ustawienia…</p> : <>
      <p role="alert">{error}</p>
      <button className="small-button" onClick={() => setRetry(current => current + 1)}>Spróbuj ponownie</button>
    </>;
  } else if (!config?.publicKey) {
    content = <>
      <h3>Powiadomienia są chwilowo niedostępne</h3>
      <p>Spróbuj ponownie za chwilę. Możesz dalej czytać i zapisywać postępy.</p>
      <button className="small-button" disabled={busy} onClick={() => setRetry(current => current + 1)}>Sprawdź dostępność ponownie</button>
    </>;
  } else if (denied) {
    content = <>
      <h3>Powiadomienia są zablokowane</h3>
      <p>{device.ios ? <>Wybierz <strong>Ustawienia urządzenia → Powiadomienia → Plan czytania Biblii</strong> i włącz <strong>Dopuszczaj powiadomienia</strong>.</> : device.browser === "safari" ? <>Wybierz <strong>Safari → Ustawienia → Witryny → Powiadomienia</strong> i przy tej stronie ustaw <strong>Pozwól</strong>.</> : <>Kliknij ikonę ustawień strony obok adresu i przy <strong>Powiadomieniach</strong> wybierz <strong>Zezwalaj</strong>.</>}</p>
      <button className="main-button" onClick={refreshDevice}>Sprawdź zgodę ponownie</button>
    </>;
  } else if (settings.enabled) {
    content = <>
      <h3>Przypomnienia włączone na tym urządzeniu</h3>
      <p>{config.scheduled ? `Przypomnimy Ci o czytaniu o ${savedTime}.` : `Zapisana godzina: ${savedTime}. Wersja testowa nie wysyła codziennych przypomnień.`}</p>
      <details className="notification-help">
        <summary>Zmień godzinę</summary>
        {timeForm}
      </details>
      <NotificationTestControls scheduled={config.scheduled} busy={busy} testSent={testSent} onTest={() => void action("test")} />
      <button className="small-button" disabled={busy} onClick={() => void action("disable")}>{operation === "disable" ? "Wyłączanie…" : "Wyłącz przypomnienia"}</button>
    </>;
  } else {
    content = <>
      <h3>O której przypomnieć Ci o czytaniu?</h3>
      {config.scheduled ? <p>Jeśli już przeczytasz, pominiemy przypomnienie.</p> : <p className="notification-hint">Wersja testowa — codzienne przypomnienia są wyłączone.</p>}
      {timeForm}
    </>;
  }

  return <>
    <h2 className="settings-heading">Powiadomienia o czytaniu</h2>
    <section className="settings-card notification-card" aria-label="Powiadomienia o czytaniu" aria-busy={busy}>
      <div className="notification-current-step">{content}</div>
      {loaded && ready && config?.publicKey && error && <p className="simple-alert" role="alert">{error}</p>}
      {loaded && ready && message && <p className="notification-feedback" role="status">{message}</p>}
    </section>
  </>;
}
