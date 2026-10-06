import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getNotificationConfig, notificationSettings } from "./lib/api";
import { notificationDevice, reminderDeviceId, subscribeToReading } from "./lib/push-client";
import type { ReminderSettings } from "./lib/notifications";
import type { Credentials } from "./types";

function SetupStep({ number, title, state, children }: {
  number: number; title: string; state: "done" | "current" | "later"; children: ReactNode;
}) {
  return <li className={`notification-step notification-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
    <span className="notification-step-number" aria-hidden="true">{state === "done" ? "✓" : number}</span>
    <div className="notification-step-content">
      <div className="notification-step-heading"><h3>{title}</h3><span>{state === "done" ? "Gotowe" : state === "current" ? "Teraz" : "Następnie"}</span></div>
      {children}
    </div>
  </li>;
}

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
      setMessage(config.scheduled ? `Gotowe! Przypomnienie ustawione na ${settings.time}.` : `Zapisano godzinę ${settings.time}. Teraz wyślij testowe powiadomienie.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się włączyć powiadomień. Spróbuj ponownie.");
    } finally { setOperation(null); refreshDevice(); }
  }

  async function action(kind: "disable" | "test") {
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

  return <>
    <h2 className="settings-heading">Powiadomienia o czytaniu</h2>
    <section className="settings-card notification-card" aria-label="Powiadomienia o czytaniu" aria-busy={busy}>
      <header className="notification-intro">
        <span className="notification-bell" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></span>
        <div><h3>Znajdź chwilę na Słowo</h3><p>Przypomnimy Ci o dzisiejszym czytaniu o wybranej godzinie. Jeśli już przeczytasz, pominiemy przypomnienie.</p></div>
      </header>
      {loaded && <p className={`notification-status ${settings.enabled && !denied ? "notification-status--on" : ""}`}>
        <span aria-hidden="true" />{denied ? "Wymagana zgoda na powiadomienia" : settings.enabled ? `Przypomnienia włączone na tym urządzeniu · ${savedTime}` : "Przypomnienia wyłączone · zacznij poniżej"}
      </p>}
      {config && !config.scheduled && <aside className="notification-notice"><strong>Wersja testowa</strong><p>Tutaj ustawisz godzinę i wyślesz test. Codzienne przypomnienia będą dostępne w wersji produkcyjnej.</p></aside>}
      {operation === "loading" && <p role="status">Sprawdzamy ustawienia powiadomień…</p>}
      {error && <div className="simple-alert" role="alert">{error}</div>}
      {!loaded && !busy && <button className="small-button" onClick={() => setRetry(current => current + 1)}>Spróbuj ponownie</button>}
      {loaded && !config?.publicKey && <aside className="notification-notice" role="alert"><strong>Powiadomienia są chwilowo niedostępne</strong><p>Konfiguracja po naszej stronie nie jest jeszcze gotowa. Możesz dalej czytać i zapisywać postępy.</p><button className="small-button" disabled={busy} onClick={() => setRetry(current => current + 1)}>Sprawdź dostępność ponownie</button></aside>}
      <ol className="notification-steps" aria-label="Konfiguracja przypomnień krok po kroku">
        <SetupStep number={1} title={device.needsInstall ? "Dodaj aplikację do ekranu początkowego" : device.standalone ? "Aplikacja jest otwarta" : "Przygotuj urządzenie"} state={ready ? "done" : "current"}>
          {device.needsInstall ? <>
            <p>Na iPhonie i iPadzie powiadomienia działają po otwarciu aplikacji z jej ikony. Zrobisz to bez App Store.</p>
            <ol className="notification-install-steps">
              <li>W {device.browser === "chrome" ? "Chrome" : "Safari"} stuknij <strong>Udostępnij</strong> <svg className="notification-share" aria-label="kwadrat ze strzałką w górę" role="img" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 15V2m-4 4 4-4 4 4M7 9H4v12h16V9h-3" /></svg>. {device.browser === "safari" && "Jeśli przycisk jest schowany, otwórz menu „Więcej”."}</li>
              <li>Przewiń menu i wybierz <strong>Dodaj do ekranu początkowego</strong> (lub „Dodaj do ekranu głównego”).</li>
              <li>Jeśli widzisz opcję <strong>Otwórz jako aplikację webową</strong>, włącz ją. Potem stuknij <strong>Dodaj</strong>.</li>
              <li>Wróć na ekran początkowy i otwórz ikonę <strong>Plan czytania Biblii</strong>. Wejdź w <strong>Ustawienia → Powiadomienia o czytaniu</strong>.</li>
            </ol>
            {device.browser === "other" && <p className="notification-hint">Nie widzisz tych opcji? Otwórz tę stronę w Safari i wykonaj powyższe kroki.</p>}
            <details className="notification-help"><summary>Po instalacji nie widzę swojego planu</summary><p>Wróć do przeglądarki, w której masz plan. Wybierz <strong>Ustawienia → Przeniesienie sesji</strong> i utwórz kod. W aplikacji wybierz <strong>„Mam już plan na innym urządzeniu → przenieś sesję”</strong>, a potem wpisz ten kod.</p></details>
          </> : !device.supported ? <div className="notification-notice" role="alert"><strong>Ta przeglądarka nie obsługuje powiadomień</strong><p>{device.ios ? "Zaktualizuj iOS lub iPadOS (wymagana wersja 16.4 lub nowsza) i otwórz aplikację z ikony na ekranie początkowym." : "Otwórz plan w aktualnej wersji Chrome, Edge, Firefox lub Safari. Jeśli korzystasz z trybu prywatnego, przejdź do zwykłego okna."}</p></div>
            : <p>{device.standalone ? "Możesz przejść do ustawienia przypomnienia." : "Możesz odbierać powiadomienia w tej przeglądarce. Instalacja aplikacji nie jest wymagana."}</p>}
        </SetupStep>
        <SetupStep number={2} title="Wybierz godzinę i włącz przypomnienia" state={!ready ? "later" : settings.enabled && !denied ? "done" : "current"}>
          {!ready ? <p>Po wykonaniu pierwszego kroku ustawisz godzinę i zezwolisz na powiadomienia.</p> : <>
            {denied && <div className="notification-notice notification-notice--warning" role="alert"><strong>Powiadomienia są zablokowane</strong>
              <ol><li>{device.ios ? <>Otwórz <strong>Ustawienia urządzenia → Powiadomienia → Plan czytania Biblii</strong> i włącz <strong>Dopuszczaj powiadomienia</strong>.</> : device.browser === "safari" ? <>Otwórz <strong>Safari → Ustawienia → Witryny → Powiadomienia</strong>. Przy tej stronie wybierz <strong>Pozwól</strong>.</> : <>Kliknij ikonę ustawień strony obok adresu. W jej uprawnieniach znajdź <strong>Powiadomienia</strong> i usuń blokadę lub wybierz <strong>Zezwalaj</strong>.</>}</li><li>Wróć tutaj i sprawdź zgodę ponownie.</li></ol>
              <button className="small-button" onClick={refreshDevice}>Sprawdź zgodę ponownie</button>
            </div>}
            <form onSubmit={save}>
              <label className="simple-field"><span>Godzina przypomnienia</span><input type="time" required value={settings.time} disabled={busy} onChange={event => setSettings(current => ({ ...current, time: event.target.value }))} aria-describedby="reminder-time-zone" /></label>
              <p id="reminder-time-zone" className="notification-hint">Czas: {settings.timeZone}. To ustawienie dotyczy tylko Ciebie i tego urządzenia.</p>
              {!settings.enabled && !denied && <p>Po kliknięciu przycisku wybierz <strong>„Zezwól”</strong> lub <strong>„Pozwól”</strong> w oknie przeglądarki.</p>}
              <button className="main-button" disabled={busy || !canSave}>{operation === "save" ? "Zapisywanie…" : settings.enabled ? "Zapisz godzinę" : "Włącz przypomnienia"}</button>
            </form>
          </>}
        </SetupStep>
        <SetupStep number={3} title="Sprawdź, czy powiadomienie dociera" state={settings.enabled && ready && !denied ? "current" : "later"}>
          {settings.enabled && ready && !denied ? <><p>Wyślij sobie krótkie powiadomienie. Dzięki temu sprawdzisz, czy urządzenie je pokazuje.</p><button className="small-button" disabled={busy || !config?.publicKey} onClick={() => void action("test")}>{operation === "test" ? "Wysyłanie…" : "Wyślij powiadomienie testowe"}</button>
            {testSent && <details className="notification-help"><summary>Powiadomienie nie dotarło?</summary><p>Sprawdź centrum powiadomień, połączenie z internetem i ustawienia trybu skupienia / „Nie przeszkadzać”. W ustawieniach urządzenia upewnij się, że aplikacja lub przeglądarka może pokazywać powiadomienia.</p></details>}
          </> : <p>Przycisk testu pojawi się po włączeniu przypomnień.</p>}
        </SetupStep>
      </ol>
      {message && <p className="notification-feedback" role="status">{message}</p>}
      {settings.enabled && <div className="notification-footer"><p>Możesz wyłączyć przypomnienia w każdej chwili.</p><button className="small-button" disabled={busy} onClick={() => void action("disable")}>{operation === "disable" ? "Wyłączanie…" : "Wyłącz przypomnienia"}</button></div>}
    </section>
  </>;
}
