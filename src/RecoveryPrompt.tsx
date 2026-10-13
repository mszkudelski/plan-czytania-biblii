import { useOnboarding, usePromptOffer } from "./Onboarding";
import { useEffect, useRef, useState } from "react";
import type { Credentials } from "./types";
import type { RecoveryPortion } from "./lib/recovery";
import { recoveryPromptSettings } from "./lib/api";
import { recoveryPromptPreference, shouldSuggestRecovery, type RecoveryPromptPreference, type RecoveryPromptAction } from "./lib/recovery-prompt";

export default function RecoveryPrompt({ credentials, overdue, enabled, ready, active, open, example, onOpen, onClose, onEnable }: {
  credentials: Credentials; overdue: number; enabled: boolean; ready: boolean; active: boolean; open: boolean;
  example?: RecoveryPortion; onOpen: () => void; onClose: () => void; onEnable: () => void;
}) {
  const queue = useOnboarding();
  const [preference, setPreference] = useState<RecoveryPromptPreference | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const revision = useRef(0);
  useEffect(() => {
    setLoaded(false);
    if (!ready || !active) return;
    let cancelled = false;
    const requestedRevision = revision.current;
    recoveryPromptSettings(credentials, "read").then(value => {
      if (!cancelled && requestedRevision === revision.current) { setPreference(value); setLoaded(true); }
    }).catch(() => { /* A failed read must not propose recovery from stale preferences. */ });
    return () => { cancelled = true; };
  }, [credentials.groupId, credentials.memberId, credentials.token, ready, active]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && active) {
      if (!node.open) node.showModal();
    } else if (node.open) node.close();
  }, [open, active]);

  const previousEnabled = useRef(enabled);
  useEffect(() => {
    const stopped = previousEnabled.current && !enabled;
    previousEnabled.current = enabled;
    if (stopped) void choose("stop");
  }, [enabled]);

  async function choose(action: RecoveryPromptAction) {
    if (busy) return;
    const previous = preference;
    const wasOpen = open;
    revision.current++; setBusy(true); setError("");
    setPreference(action === "stop" && previous?.disabled ? previous : recoveryPromptPreference(action)); setLoaded(true); setDismissed(true); onClose();
    try {
      const value = await recoveryPromptSettings(credentials, action);
      setPreference(value); queue.finish("recovery");
    } catch {
      setPreference(previous); setDismissed(false);
      setError("Nie udało się zapisać wyboru. Spróbuj ponownie.");
      if (wasOpen) onOpen();
    }
    finally { setBusy(false); }
  }

  function enable() {
    if (busy) return;
    setDismissed(true); setError(""); queue.finish("recovery"); onEnable(); onClose();
  }
  const candidate = Boolean(active && ready && loaded && preference && !dismissed && !open && queue.recoveryAllowed &&
    shouldSuggestRecovery(overdue, enabled, preference));
  const offered = usePromptOffer("recovery", candidate);
  const showNotice = offered && candidate;
  return <>
    {busy && <span role="status" className="recovery-save-status">Zapisuję wybór…</span>}
    {showNotice && <aside className="recovery-notice" aria-label="Propozycja nadrabiania">
      <div className="recovery-notice-inner">
        <div><h2>Nadrabiaj po trochu</h2><p>Do zwykłego czytania dodamy 1 rozdział dziennie.</p>
          {error && <p className="recovery-choice-error" role="alert">{error}</p>}</div>
        <div className="recovery-notice-actions">
          <button type="button" className="small-button recovery-enable" disabled={busy} onClick={enable}>Włącz</button>
          <button type="button" className="small-button" disabled={busy} onClick={() => { setError(""); onOpen(); }}>Pokaż szczegóły</button>
          <button type="button" className="link-button" disabled={busy} onClick={() => void choose("later")}>Nie teraz</button>
        </div>
      </div>
    </aside>}
    <dialog className="recovery-dialog" ref={dialog} aria-labelledby="recovery-dialog-title" onCancel={event => {
      event.preventDefault(); if (!busy) void choose("later");
    }}>
      <h2 id="recovery-dialog-title">Chcesz włączyć nadrabianie?</h2>
      <p>Do zwykłego czytania dodamy jeden rozdział dziennie.</p>
      {example && <section className="recovery-example" aria-label="Przykładowy dzień">
        <span>Przykładowy dzień</span>
        <div className="recovery-example-reading">
          <div>{example.day.segments.map(segment => <span key={segment.id}>{segment.label}</span>)}</div>
          {example.extra && <strong>+ {example.extra.label}</strong>}
        </div>
      </section>}
      {error && <p className="recovery-choice-error" role="alert">{error}</p>}
      <div className="recovery-dialog-actions">
        <button type="button" className="main-button" disabled={busy} onClick={enable}>Włącz</button>
        <button type="button" className="small-button" disabled={busy} onClick={() => void choose("later")}>Nie teraz</button>
      </div>
      <button type="button" className="link-button recovery-never" disabled={busy} onClick={() => void choose("never")}>Nie pokazuj więcej</button>
    </dialog>
  </>;
}
