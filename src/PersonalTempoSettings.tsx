import { useEffect, useRef, useState } from "react";
import type { Credentials, Group, Member } from "./types";
import { savePersonalTempo } from "./lib/api";
import { nextTempo, projectPersonalTempo, tempoFor } from "./lib/personal-tempo";
import { formatPolishDate, todayIso } from "./lib/schedule";

const labels = ["N", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const fullLabels = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
export default function PersonalTempoSettings({ group, member, credentials, onSaved, disabled = false }: {
  group: Group; member: Member; credentials: Credentials; onSaved: (group: Group) => void; disabled?: boolean;
}) {
  const today = todayIso();
  const tempo = tempoFor(group, member.id);
  const active = [...(tempo?.changes ?? [])].reverse().find(change => change.effectiveFrom <= today);
  const pending = tempo?.changes.find(change => change.effectiveFrom > today);
  const inherited = group.frequency.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6] : group.frequency.kind === "weekdays" ? [1, 2, 3, 4, 5] : group.frequency.days;
  const current = pending?.days ?? active?.days ?? inherited;
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(current);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (editing) heading.current?.focus(); }, [editing]);
  const editVersion = useRef(0);
  const editRevision = useRef("");
  let candidate = group;
  let effective = "";
  if (editing && days.length) {
    const next = nextTempo(group, member.id, days, today, tempo?.version ?? 0, group.planRevision ?? "");
    effective = next.changes.at(-1)!.effectiveFrom;
    candidate = { ...group, members: group.members.map(m => m.id === member.id ? { ...m, personalTempo: next } : m) };
  }
  const preview = projectPersonalTempo(candidate, member.id).planDays.filter(day => day.date >= (effective || today));
  async function save(value: number[] | null) {
    setBusy(true); setError(""); setMessage("");
    try {
      const next = await savePersonalTempo(credentials, value, editing ? editVersion.current : tempo?.version ?? 0,
        editing ? editRevision.current : group.planRevision ?? "", Intl.DateTimeFormat().resolvedOptions().timeZone);
      onSaved(next); setEditing(false); setMessage(value ? "Zapisano dni czytania." : "Anulowano oczekującą zmianę.");
    } catch { setError("Nie udało się zapisać. Odśwież dane i spróbuj ponownie."); }
    finally { setBusy(false); }
  }
  return <section className="settings-card personal-tempo" aria-label="Moje dni czytania">
    {editing ? <>
      <h2 tabIndex={-1} ref={heading}>Moje dni czytania</h2>
      {effective && effective > today && Boolean(tempo?.changes.length || today > (group.planDays[0]?.date ?? group.startDate) || member.readingStart?.skippedSegmentIds.length || member.readingStart?.autoRecoveryAt) && <p>Od {formatPolishDate(effective, "shortYear")}</p>}
      <fieldset disabled={busy} aria-label="Wybierz dni czytania">
        <div className="simple-segmented">{[[6], [1, 3, 5], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]].map(preset => <button type="button" key={preset.length} onClick={() => setDays(preset)}>{preset.length} {preset.length === 1 ? "dzień" : "dni"}</button>)}</div>
        <div className="simple-days">{labels.map((label, day) => <button type="button" key={day} aria-label={fullLabels[day]} aria-pressed={days.includes(day)} className={days.includes(day) ? "active" : ""} onClick={() => setDays(current => current.includes(day) ? current.filter(d => d !== day) : [...current, day])}>{label}</button>)}</div>
      </fieldset>
      {!days.length && <p role="alert">Wybierz co najmniej jeden dzień.</p>}
      <details><summary>Podgląd czytań</summary><ol className="tempo-preview">{preview.map(day => <li key={day.id}><b>{formatPolishDate(day.date, "shortYear")}</b>: {day.segments.map(s => s.label).join(" · ")}</li>)}</ol></details>
      <div className="tempo-actions"><button type="button" className="small-button" disabled={busy || !days.length || disabled} onClick={() => void save(days)}>Zapisz</button><button type="button" className="link-button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Anuluj</button></div>
    </> : <>
      <button type="button" className="tempo-setting-button" disabled={disabled || busy} onClick={() => {
        editVersion.current = tempo?.version ?? 0; editRevision.current = group.planRevision ?? "";
        setDays(current); setError(""); setMessage(""); setEditing(true);
      }}><strong>Moje dni czytania</strong><span>{[1, 2, 3, 4, 5, 6, 0].filter(day => current.includes(day)).map(day => labels[day]).join(" · ")}</span></button>
      {pending && <div><p>Od {formatPolishDate(pending.effectiveFrom, "shortYear")}</p><button type="button" className="link-button" disabled={busy} onClick={() => void save(null)}>Anuluj oczekującą zmianę</button></div>}
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
