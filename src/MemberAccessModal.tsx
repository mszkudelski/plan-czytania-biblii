import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, createMemberAccess } from "./lib/api";
import { createMemberAccessLink } from "./lib/invite";
import type { Credentials, Member } from "./types";

export default function MemberAccessModal({
  credentials, person, progressPercent, onRoleChange, onClose, copyText, renderQr,
}: {
  credentials: Credentials;
  person: Member;
  progressPercent: string;
  onRoleChange: (memberId: string, isAdmin: boolean) => Promise<void>;
  onClose: () => void;
  copyText: (value: string) => Promise<void>;
  renderQr: (value: string) => ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [access, setAccess] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRole, setConfirmRole] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ) ?? [])];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  async function issue() {
    setBusy(true); setError(""); setCopied(false);
    try { setAccess(await createMemberAccess(credentials, person.id)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Nie udało się utworzyć linku dostępu. Spróbuj ponownie."); }
    finally { setBusy(false); }
  }

  async function changeRole() {
    setBusy(true); setError("");
    try { await onRoleChange(person.id, !person.isAdmin); setConfirmRole(false); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Nie udało się zmienić roli. Spróbuj ponownie."); }
    finally { setBusy(false); }
  }

  return (
    <div className="simple-modal-bg" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialog} className="simple-modal member-access-modal" role="dialog"
        aria-modal="true" aria-labelledby="member-access-title">
        <button className="icon-button modal-close" onClick={onClose} disabled={busy} aria-label="Zamknij zarządzanie profilem">×</button>
        <h2 id="member-access-title">{person.name}</h2>
        <p className="member-access-meta">{person.isAdmin ? "Administrator" : "Uczestnik"} · {progressPercent}% planu</p>
        {error && <div className="simple-alert" role="alert">{error}</div>}
        <section className="member-access-section" aria-label="Przywróć dostęp">
          <h3>Przywróć dostęp</h3>
          <p>Link otworzy ten profil z dotychczasowym postępem. Przed wysłaniem potwierdź, że o dostęp prosi właściwa osoba.</p>
          {access && <div className="member-access-result">
            {renderQr(createMemberAccessLink(access.code))}
            <label>Link dostępu<input readOnly value={createMemberAccessLink(access.code)} onFocus={(event) => event.target.select()} /></label>
            <output aria-label="Jednorazowy kod dostępu">{access.code}</output>
            <p>Jednorazowy · ważny do {new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(access.expiresAt))}</p>
            <button className="small-button" onClick={async () => {
              try { await copyText(createMemberAccessLink(access.code)); setCopied(true); }
              catch { setError("Nie udało się skopiować linku. Zaznacz go i skopiuj ręcznie."); }
            }}>{copied ? "Skopiowano link" : "Kopiuj link dostępu"}</button>
          </div>}
          <button className={access ? "small-button" : "main-button"} disabled={busy} onClick={() => void issue()}>
            {busy ? "Zapisywanie…" : access ? "Utwórz nowy link dostępu" : "Utwórz link dostępu"}
          </button>
          {!access && <p className="muted">Link i kod QR będą ważne przez 10 minut. Osoba nie musi wcześniej zapisywać żadnego kodu.</p>}
        </section>
        <section className="member-access-section" aria-label="Rola w grupie">
          <h3>Rola w grupie</h3>
          <p>Administrator może zapraszać osoby, zarządzać ich rolami i przywracać dostęp do ich profili.</p>
          {confirmRole ? <div className="role-confirm">
            <p>{person.isAdmin ? `Odebrać rolę administratora osobie ${person.name}?` : `Nadać osobie ${person.name} rolę administratora? Wybierz osobę, której ufasz.`}</p>
            <div className="access-actions">
              <button className="small-button" disabled={busy} onClick={() => void changeRole()}>{person.isAdmin ? "Potwierdź odebranie roli" : "Potwierdź nadanie roli"}</button>
              <button className="link-button" disabled={busy} onClick={() => setConfirmRole(false)}>Anuluj</button>
            </div>
          </div> : <button className="small-button" disabled={busy} onClick={() => setConfirmRole(true)}>
            {person.isAdmin ? "Odbierz rolę administratora" : "Nadaj rolę administratora"}
          </button>}
        </section>
      </section>
    </div>
  );
}
