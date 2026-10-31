import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Credentials, Frequency, Group } from "./types";
import { parsePlanCsv } from "./lib/csv";
import { BASIC_PLAN_CSV } from "./lib/basic-plan";
import { buildSchedule } from "./lib/schedule";
import { planRestoreAvailable, replacementPlanError, replacementSummary } from "./lib/plan-replacement";
import { replacePlan, restorePlan } from "./lib/api";

export default function PlanReplacement({ group, credentials, disabled, onReplace }: {
  group: Group;
  credentials: Credentials;
  disabled: boolean;
  onReplace: (group: Group) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    setClock(Date.now());
    setConfirmRestore(false);
    if (!group.planRestore) return;
    const timeout = setTimeout(() => setClock(Date.now()), Math.min(2147483647,
      Math.max(0, Date.parse(group.planRestore.expiresAt) - Date.now())));
    return () => clearTimeout(timeout);
  }, [group.planRestore?.expiresAt, group.planRevision]);
  const canRestore = planRestoreAvailable(group.planRestore, clock);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [startDate, setStartDate] = useState(group.startDate);
  const [frequency, setFrequency] = useState<Frequency>(group.frequency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRead = useRef(0);
  const rows = useMemo(() => parsePlanCsv(csv), [csv]);
  const datesValid = Boolean(startDate && !Number.isNaN(Date.parse(startDate)));
  const frequencyValid = frequency.kind !== "custom" || frequency.days.length > 0;
  const days = useMemo(() => datesValid && frequencyValid ? buildSchedule(rows, startDate, frequency) : [],
    [rows, startDate, frequency, datesValid, frequencyValid]);
  const validationError = days.length ? replacementPlanError(days) : "";
  const summary = replacementSummary(group, days);
  const unmatched = summary.members.reduce((sum, member) => sum + member.unmatched, 0);
  const locked = busy || disabled;
  const member = group.members.find(person => person.id === credentials.memberId);
  if (!member?.isAdmin) return null;

  function reset() {
    fileRead.current++;
    setCsv(""); setFileName(""); setError("");
    setStartDate(group.startDate); setFrequency(group.frequency);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!days.length || locked || validationError) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const next = await replacePlan(credentials, {
        planDays: days, startDate, frequency, expectedRevision: group.planRevision ?? "",
      });
      onReplace(next);
      setOpen(false); reset();
      setSuccess("Plan został podmieniony. Dopasowany postęp grupy został zachowany.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się podmienić planu. Spróbuj ponownie.");
    } finally { setBusy(false); }
  }

  async function restore() {
    if (locked || !canRestore) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const next = await restorePlan(credentials, group.planRevision ?? "");
      onReplace(next);
      setConfirmRestore(false); setOpen(false); reset();
      setSuccess("Poprzedni plan i postęp grupy sprzed podmiany zostały przywrócone.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się przywrócić planu. Spróbuj ponownie.");
    } finally { setBusy(false); }
  }

  return <section className="settings-card plan-replacement">
    {success && <p role="status">{success}</p>}
    {error && !open && <p className="simple-alert" role="alert">{error}</p>}
    {canRestore && <div className="plan-restore">
      <h3>Poprzedni plan i postęp</h3>
      <p>Możesz przywrócić plan i zaznaczenia całej grupy ze stanu sprzed ostatniej podmiany.</p>
      <p>Dostępne do <strong>{new Date(group.planRestore!.expiresAt).toLocaleString("pl-PL", {
        dateStyle: "long", timeStyle: "short",
      })}</strong> — przez 7 dni od podmiany.</p>
      {confirmRestore ? <div role="group" aria-label="Potwierdź przywrócenie planu">
        <p className="replacement-warning">Przywrócenie zastąpi aktualny plan i postęp całej grupy stanem sprzed podmiany. Późniejsze zaznaczenia zostaną cofnięte. Skład grupy i uprawnienia pozostaną aktualne. Tej operacji nie można cofnąć.</p>
        <div className="access-actions replacement-actions">
          <button type="button" className="main-button" disabled={locked} onClick={restore}>{busy ? "Przywracanie…" : "Przywróć plan i postęp grupy"}</button>
          <button type="button" className="link-button" disabled={locked} onClick={() => { setConfirmRestore(false); setError(""); }}>Anuluj przywracanie</button>
        </div>
      </div> : <button type="button" className="small-button" disabled={locked} onClick={() => {
        setOpen(false); reset(); setSuccess(""); setConfirmRestore(true);
      }}>Przywróć poprzedni plan</button>}
    </div>}
    {!open ? <button type="button" className="small-button" disabled={locked} onClick={() => {
      reset(); setConfirmRestore(false); setSuccess(""); setOpen(true);
    }}>Podmień plan</button> : <form onSubmit={submit}>
      <div className="replacement-intro">
        <h3>Podmień plan dla całej grupy</h3>
        <p>Zachowamy postęp wszystkich osób dla fragmentów, które znajdziemy w nowym planie.</p>
        <p>Przez 7 dni od podmiany administrator będzie mógł przywrócić poprzedni plan wraz z całym postępem sprzed zmiany. Każda kolejna podmiana zastępuje tę kopię.</p>
      </div>
      <fieldset disabled={locked}>
        <label className="simple-field replacement-file-field">
          <span>Nowy plan CSV</span>
          <span className="replacement-upload">
          <input type="file" aria-label="Nowy plan CSV" accept=".csv,text/csv" onChange={async event => {
            const file = event.target.files?.[0];
            const attempt = ++fileRead.current;
            setCsv(""); setError(""); setFileName(file?.name ?? "");
            if (!file) return;
            try {
              const text = await file.text();
              if (attempt !== fileRead.current) return;
              if (!parsePlanCsv(text).length) setError("Plik nie zawiera czytań. Sprawdź nagłówki i zawartość CSV.");
              setCsv(text);
            } catch { if (attempt === fileRead.current) setError("Nie udało się odczytać pliku."); }
          }} />
            <span className="replacement-file-name">{fileName || "Wybierz plik CSV"}</span>
            <span className="replacement-file-action" aria-hidden="true">Wybierz</span>
          </span>
        </label>
        <button type="button" className="link-button" onClick={() => {
          fileRead.current++; setCsv(BASIC_PLAN_CSV); setFileName("Plan podstawowy · M’Cheyne · 365 dni"); setError("");
        }}>Użyj planu podstawowego · 365 dni</button>
        <div className="replacement-schedule">
        <label className="simple-field"><span>Data rozpoczęcia</span>
          <input type="date" value={startDate} required onChange={event => setStartDate(event.target.value)} />
        </label>
        <label className="simple-field"><span>Dni czytania</span>
          <select value={frequency.kind} onChange={event => setFrequency({
            kind: event.target.value as Frequency["kind"], days: group.frequency.days,
          })}>
            <option value="daily">Codziennie</option>
            <option value="weekdays">Od poniedziałku do piątku</option>
            <option value="custom">Wybrane dni tygodnia</option>
          </select>
        </label>
        </div>
        {frequency.kind === "custom" && <div className="replacement-weekdays">
          {["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"].map((label, day) =>
            <label key={day}><input type="checkbox" checked={frequency.days.includes(day)} onChange={event => setFrequency({
              ...frequency, days: event.target.checked ? [...frequency.days, day] : frequency.days.filter(value => value !== day),
            })} />{label}</label>)}
        </div>}
        {!frequencyValid && <p role="alert">Wybierz przynajmniej jeden dzień tygodnia.</p>}
        {rows.some(row => row.date) && <p className="field-help">Daty zapisane w CSV mają pierwszeństwo przed datą rozpoczęcia i dniami tygodnia.</p>}
        {days.length > 0 && <div className="replacement-preview" aria-label="Podgląd zachowanego postępu">
          <strong>{fileName} · {days.length} dni</strong>
          <p>Dopasowane fragmenty: {summary.matched} z {summary.total}.</p>
          <details><summary>Jak dopasowujemy postęp?</summary><p>Porównujemy zapis fragmentu, pomijając wielkość liter, odstępy i rodzaj myślnika. Innych skrótów ksiąg oraz podzielonych lub połączonych fragmentów nie dopasowujemy. Powtórzenia łączymy kolejno, każde osobno.</p></details>
          <div className="replacement-table"><table>
            <caption>Postęp po podmianie — zaznaczenia i dni</caption>
            <thead><tr><th>Osoba</th><th>Zachowane</th><th>Utracone</th><th>Pełne dni</th></tr></thead>
            <tbody>{summary.members.map(person => <tr key={person.memberId}>
              <td>{person.name}</td><td>{person.retained}</td><td>{person.unmatched}</td><td>{person.completedDays} z {days.length}</td>
            </tr>)}</tbody>
          </table></div>
          <p>Dzień nowego planu liczymy jako ukończony, jeśli wszystkie jego fragmenty są już przeczytane. Zachowamy też zaznaczenia w częściowo przeczytanych dniach.</p>
          {unmatched > 0 && <p className="replacement-warning" role="alert">Zaznaczenia bez dopasowania: {unmatched}. Nie zostaną przeniesione do nowego planu.</p>}
          <p>Zmiana obejmie całą grupę. Dostęp, członkowie i ich role zostaną zachowane.</p>
        </div>}
        {validationError && <p className="simple-alert" role="alert">{validationError}</p>}
        {error && <p className="simple-alert" role="alert">{error}</p>}
        <div className="access-actions replacement-actions">
          <button type="submit" className="main-button" disabled={!days.length || Boolean(validationError)}>{busy ? "Podmienianie…" : "Podmień plan dla całej grupy"}</button>
          <button type="button" className="link-button" onClick={() => { reset(); setOpen(false); }}>Anuluj</button>
        </div>
      </fieldset>
    </form>}
  </section>;
}
