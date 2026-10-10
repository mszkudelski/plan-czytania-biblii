import { useEffect, useState } from "react";
import { createRecoveryCode, recoveryCodeStatus } from "./lib/api";
import type { Credentials, Group, Member } from "./types";

export default function RecoveryCodeSettings({
  credentials, group, member, copyText,
}: { credentials: Credentials; group: Group; member: Member; copyText: (value: string) => Promise<void> }) {
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const otherAdmins = group.members.filter((person) => person.isAdmin && person.id !== member.id);

  useEffect(() => {
    let cancelled = false;
    setHasCode(null);
    setStatusError("");
    recoveryCodeStatus(credentials)
      .then((status) => { if (!cancelled) setHasCode(status.hasCode); })
      .catch(() => { if (!cancelled) setStatusError("Nie udało się sprawdzić kodu odzyskiwania."); });
    return () => { cancelled = true; };
  }, [credentials.groupId, credentials.memberId, credentials.token, retry]);

  async function generate() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await createRecoveryCode(credentials);
      setCode(result.code);
      setHasCode(true);
      setConfirmRotation(false);
    } catch {
      setError("Nie udało się utworzyć kodu odzyskiwania. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Odzyskiwanie dostępu</h2>
      <section className="settings-card recovery-code-card" aria-label="Odzyskiwanie dostępu">
        {otherAdmins.length ? <p>
          Jeśli stracisz dostęp, poproś administratora grupy ({otherAdmins.map((person) => person.name).join(", ")})
          o jednorazowy link. Przywróci Twój profil i postęp. Nie musisz wcześniej zapisywać kodu.
        </p> : <p>
          Jesteś jedynym administratorem. Zaproś zaufaną osobę i nadaj jej rolę administratora:
          Grupa → Zarządzaj → Nadaj rolę administratora. Wtedy pomoże Ci odzyskać dostęp.
        </p>}
        <details className="backup-access">
          <summary>Osobisty kod awaryjny (opcjonalnie)</summary>
          <div className="backup-access-content">
        <p>Kod przyda się, jeśli żaden administrator ani Twoje inne urządzenie nie może pomóc. Zapisz go poza tą aplikacją.</p>
        {statusError ? (
          <div className="simple-alert" role="alert">
            <p>{statusError}</p>
            <button className="small-button" onClick={() => setRetry((value) => value + 1)}>
              Spróbuj ponownie
            </button>
          </div>
        ) : hasCode === null ? (
          <p className="muted" role="status">Sprawdzanie kodu…</p>
        ) : (
          <>
            {error && <div className="simple-alert" role="alert">{error}</div>}
            {code ? (
              <div className="recovery-code-result">
                <strong>Zapisz ten kod w bezpiecznym miejscu</strong>
                <output className="recovery-code" aria-label="Twój kod odzyskiwania">{code}</output>
                <p>Kod daje dostęp do Twojego profilu. Zachowaj go dla siebie. Działa do utworzenia nowego kodu.</p>
                <div className="access-actions">
                  <button className="small-button" onClick={async () => {
                    try { await copyText(code); setCopied(true); }
                    catch { setError("Nie udało się skopiować kodu. Zaznacz go i skopiuj ręcznie."); }
                  }}>
                    {copied ? "Skopiowano kod" : "Kopiuj kod odzyskiwania"}
                  </button>
                  <button className="link-button" onClick={() => { setCode(""); setCopied(false); }}>
                    Ukryj kod
                  </button>
                </div>
              </div>
            ) : hasCode ? (
              <p className="muted">Masz już kod odzyskiwania. Jeśli go nie zapisałeś, możesz utworzyć nowy.</p>
            ) : null}
            {confirmRotation ? (
              <div className="simple-alert" role="alert">
                <p>Poprzedni kod przestanie działać. Dostęp na połączonych urządzeniach zostanie zachowany.</p>
                <div className="access-actions">
                  <button className="small-button" disabled={busy} onClick={() => void generate()}>
                    {busy ? "Tworzenie…" : "Zastąp poprzedni kod"}
                  </button>
                  <button className="link-button" disabled={busy} onClick={() => setConfirmRotation(false)}>Anuluj</button>
                </div>
              </div>
            ) : (
              <button className={hasCode ? "small-button" : "main-button"} disabled={busy} onClick={() => {
                if (hasCode) setConfirmRotation(true);
                else void generate();
              }}>
                {busy ? "Tworzenie…" : hasCode ? "Utwórz nowy kod odzyskiwania" : "Utwórz kod odzyskiwania"}
              </button>
            )}
          </>
        )}
          </div>
        </details>
      </section>
    </>
  );
}
