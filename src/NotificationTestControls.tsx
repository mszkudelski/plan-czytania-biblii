export function notificationTestsAllowed(scheduled: boolean | undefined, deployContext = import.meta.env.VITE_DEPLOY_CONTEXT) {
  return scheduled === false && deployContext !== "production";
}

export default function NotificationTestControls({ scheduled, busy, testSent, onTest, deployContext }: {
  scheduled: boolean | undefined;
  busy: boolean;
  testSent: boolean;
  onTest: () => void;
  deployContext?: string;
}) {
  if (!notificationTestsAllowed(scheduled, deployContext)) return null;
  return <details className="notification-help notification-test-tools">
    <summary>Narzędzia testowe</summary>
    <div className="notification-current-step">
      <p>Wersja testowa: codzienne przypomnienia są wyłączone. Możesz sprawdzić, czy urządzenie pokazuje powiadomienia.</p>
      <button className="small-button" disabled={busy} onClick={onTest}>Wyślij powiadomienie testowe</button>
      {testSent && <p>Sprawdź ekran blokady lub centrum powiadomień. Jeśli nic nie dotarło, sprawdź połączenie i tryb „Nie przeszkadzać”.</p>}
    </div>
  </details>;
}
