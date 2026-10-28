import { test, expect } from './fixtures.mjs';
import {
  enableRecovery, expectWeek, createPlan, createParallelPlan, openPlan, saveProgress, expectSaved, readGroup, reading,
  extraReading, browseReading, tab, recoveryKey, TODAY, NOW, holdNextProgress, progressPath,
} from './helpers.mjs';

test('standard reading is optimistic, saves to backend and survives reload', async ({ page, request }) => {
  const analyticsRequests = [];
  page.on('request', req => { if (new URL(req.url()).hostname.endsWith('posthog.com')) analyticsRequests.push(req.url()); });
  const session = await createPlan(request, 'standard');
  await openPlan(page, session);
  const held = await holdNextProgress(page, session);
  try {
    await reading(page, 'Rdz 1').click();
    await held.started;
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(reading(page, 'Rdz 1')).toBeEnabled();
    await expectSaved(request, session, []);
  } finally { held.release(); }
  await expectSaved(request, session, ['s0']);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, []);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  // Even reported JS errors/rejected promises in a synthetic browser must not
  // load PostHog or send exceptions. These dispatched events do not crash reading.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('E2E error tracking exclusion'),
      message: 'E2E error tracking exclusion' }));
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(), reason: new Error('E2E rejected promise exclusion'),
    }));
  });
  // Synthetic test activity on immutable deploys must never reach analytics.
  expect(analyticsRequests).toEqual([]);
});

test('rapid toggles and an independent click persist the final intent', async ({ page, request }) => {
  const session = await createPlan(request, 'rapid');
  await openPlan(page, session);
  const held = await holdNextProgress(page, session);
  try {
    await reading(page, 'Rdz 1').click();
    await held.started;
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  } finally { held.release(); }
  await expectSaved(request, session, ['s1']);
  await page.reload();
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
});

test('backend rejection rolls back only the failed click and allows retry', async ({ page, request }) => {
  const session = await createPlan(request, 'rollback');
  await openPlan(page, session);
  // Only this isolated test's first write has an invalid token; the 401 comes from the real backend.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    const data = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...data, token: 'invalid' }) });
  }, { times: 1 });
  try {
    await reading(page, 'Rdz 1').click();
    await reading(page, 'Mt 1').click();
    await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
    await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  } finally { release(); }
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s1']);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recovery starts at personal progress and adds only one extra row', async ({ page, request }) => {
  const session = await createPlan(request, 'recovery');
  await saveProgress(request, session, 's0');
  await openPlan(page, session);
  await expect(page.getByRole('button', { name: 'Nadrabianie', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Chcesz włączyć nadrabianie?' })).not.toBeVisible();
  await enableRecovery(page);
  await expect(page.locator('.simple-readings button')).toHaveCount(3);
  await expect(reading(page, 'Rdz 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(reading(page, 'Mt 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Mt 1').click();
  await expect(extraReading(page)).toBeEnabled();
  await extraReading(page).click();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.simple-readings button')).toHaveCount(3);
  await extraReading(page).click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Wyłącz nadrabianie' }).click();
  await expect(extraReading(page)).toHaveCount(0);
});

test('reload after backend commit preserves the extra while its response is pending', async ({ page, request }) => {
  const session = await createPlan(request, 'extra-reload-response');
  await saveProgress(request, session, 's0');
  await saveProgress(request, session, 's1');
  // Keep the daily portion at d0 even though its base is already completed.
  await openPlan(page, session, {
    [recoveryKey(session)]: TODAY,
    [recoveryKey(session) + ':ordered:' + TODAY + ':day']: 'd0',
  });
  await expect(extraReading(page)).toContainText('Rdz 2');
  let release;
  let committed;
  const gate = new Promise(resolve => { release = resolve; });
  const saved = new Promise(resolve => { committed = resolve; });
  await page.route('**' + progressPath(session), async route => {
    const response = await route.fetch();
    committed(response.status());
    await gate;
    try { await route.fulfill({ response }); } catch {
      // The old page's request may already have been cancelled by reload.
    }
  }, { times: 1 });
  try {
    await extraReading(page).click();
    expect(await saved).toBe(200);
    await expectSaved(request, session, ['s0', 's1', 's2']);
    await page.reload();
    await expect(extraReading(page)).toContainText('Rdz 2');
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  } finally { release(); }
  await page.reload();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1', 's2']);
});

test('extra waits for the standard writes and rolls back if the base fails', async ({ page, request }) => {
  const session = await createPlan(request, 'base-failure');
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await expectSaved(request, session, ['s0']);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
  }, { times: 1 });
  try {
    await reading(page, 'Mt 1').click();
    await extraReading(page).click();
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(extraReading(page)).toHaveAttribute('aria-busy', 'true');
    await expectSaved(request, session, ['s0']);
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toBeDisabled();
  await expectSaved(request, session, ['s0']);
});

test('extra rollback remains correct when leaving and returning to Today during save', async ({ page, request }) => {
  const session = await createPlan(request, 'extra-tab-race');
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + progressPath(session), async route => {
    await gate;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), token: 'invalid' }) });
  }, { times: 1 });
  try {
    await extraReading(page).click();
    await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(extraReading(page)).toHaveAttribute('aria-busy', 'true');
    await tab(page, 'Plan').click();
    await tab(page, 'Czytaj').click();
  } finally { release(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
  await expectSaved(request, session, ['s0', 's1']);
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'false');
});

test('partial extra chapter persists locally; tomorrow resumes remaining chapters', async ({ page, request }) => {
  const session = await createPlan(request, 'partial-chapter', true);
  await openPlan(page, session);
  await enableRecovery(page);
  await reading(page, 'Rdz 1').click();
  await reading(page, 'Mt 1').click();
  await expectSaved(request, session, ['s0', 's1']);
  await extraReading(page).click();
  await expect(extraReading(page)).toContainText('Rdz 2');
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(request, session, ['s0', 's1']); // No whole segment completed yet.
  await page.reload();
  await expect(extraReading(page)).toHaveAttribute('aria-pressed', 'true');
  await page.clock.setSystemTime(new Date(NOW.getTime() + 86400000));
  await page.reload();
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await expect(reading(page, 'Rdz 4')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraReading(page)).toContainText('Rdz 5');
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(extraReading(page)).toBeDisabled();
  await reading(page, 'Rdz 4').click();
  await expectSaved(request, session, ['s0', 's1', 's2', 's3']);
  await expect(extraReading(page)).toBeEnabled();
});

test('stale recovery anchor and unfinished extra cannot skip earlier progress', async ({ page, request }) => {
  const session = await createPlan(request, 'stale-anchor');
  const key = recoveryKey(session);
  await openPlan(page, session, {
    [key]: TODAY,
    [key + ':ordered:' + TODAY + ':day']: 'd3',
    [key + ':ordered:' + TODAY]: JSON.stringify({
      reading: { segmentId: 's5', originalDate: session.group.planDays[4].date, label: 'Rdz 6', chapterIndex: 0, chapterCount: 1 },
      completed: false,
    }),
  });
  await expect(reading(page, 'Rdz 1')).toBeVisible();
  await expect(reading(page, 'Mt 1')).toBeVisible();
  await expect(extraReading(page)).toContainText('Rdz 2');
});

test('normal partial reading keeps its label and date when checked and unchecked', async ({ page, request }) => {
  const session = await createPlan(request, 'partial-stable-label', true);
  for (const id of ['s0', 's1']) await saveProgress(request, session, id);
  await openPlan(page, session, { [recoveryKey(session) + ':chapters']: JSON.stringify({ s2: 1 }) });
  const selectedDate = await page.locator('.reading-card-head time').getAttribute('dateTime');
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'false');
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1', 's2']);
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.reading-card-head time')).toHaveAttribute('dateTime', selectedDate);
  await reading(page, 'Rdz 3').click();
  await expectSaved(request, session, ['s0', 's1']);
  await expect(reading(page, 'Rdz 3')).toHaveAttribute('aria-…33667 tokens truncated…n" meta={`${group.planDays.length} dni · plan grupy`} />
      <section className="plan-dates">
        <div>
          <span>Start</span>
          <strong>{formatPolishDate(startDate, "shortYear")}</strong>
        </div>
        <div>
          <span>Koniec</span>
          <strong>{formatPolishDate(endDate, "shortYear")}</strong>
        </div>
      </section>
      <div className="plan-overview">
        <div className="plan-overview-label">
          <span>Cały plan</span>
          <strong>{formatProgressPercent(percent)}%</strong>
        </div>
        <div className="wide-progress" role="progressbar" aria-label="Postęp całego planu" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
      <section className="reading-week" aria-label="Postęp tygodnia">
        <div><span>{week.weeklyTotal > 0 && week.weeklyCompleted === week.weeklyTotal ? "Tydzień ukończony" : "W tym tygodniu"}</span>
          <strong data-testid="weekly-readings">{week.weeklyCompleted} z {week.weeklyTotal} czytań</strong></div>
        {week.weeklyTotal > 0 && <div className="reading-week-track" role="progressbar" aria-label="Ukończone czytania w tym tygodniu"
          aria-valuenow={week.weeklyCompleted} aria-valuemin={0} aria-valuemax={week.weeklyTotal}>
          {Array.from({ length: week.weeklyTotal }, (_, index) => <span key={index} className={index < week.weeklyCompleted ? "done" : ""} />)}
        </div>}
      </section>
      <section className="plan-days">
        {group.planDays.map((day) => {
          const completed = day.segments.filter(
            (segment) => progress[segment.id],
          ).length;
          return (
            <div
              className={`plan-day-row ${
                completed === day.segments.length ? "complete" : ""
              }`}
              key={day.id}
            >
              <strong>{formatPolishDate(day.date, "short")}</strong>
              <span>
                {day.segments.map((segment) => segment.label).join(" · ")}
              </span>
              <b>
                {completed}/{day.segments.length}
              </b>
            </div>
          );
        })}
      </section>
    </>
  );
}

function GroupView({
  credentials,
  group,
  member,
  onInvite,
  onRemove,
  onRoleChange,
  busyMember,
}: {
  credentials: Credentials;
  group: Group;
  member: Member;
  onInvite: () => void;
  onRemove: (member: Member) => void;
  onRoleChange: (memberId: string, isAdmin: boolean) => Promise<void>;
  busyMember: string;
}) {
  const [managedId, setManagedId] = useState<string | null>(null);
  const managedPerson = group.members.find((person) => person.id === managedId);
  const ranking = group.members
    .map((person) => ({
      ...person,
      metrics: getMemberMetrics(group, person.id),
    }))
    .sort(
      (a, b) =>
        b.metrics.paceDays - a.metrics.paceDays ||
        b.metrics.progressPercent - a.metrics.progressPercent,
    );

  return (
    <>
      <PageTitle
        title="Grupa"
        meta={`${group.members.length} ${
          group.members.length === 1 ? "osoba" : "osoby"
        }`}
        action={
          member.isAdmin ? (
            <button className="small-button" onClick={onInvite}>
              <Icon name="plus" size={17} /> Zaproś
            </button>
          ) : undefined
        }
      />
      <GroupAccessHint key={`${group.id}:${member.id}`} group={group} member={member} />
      <section className="simple-list">
        {ranking.map((person, index) => (
          <div className="member-row" key={person.id}>
            <span className="rank-number">{index + 1}</span>
            <span className="simple-avatar" style={{ background: person.color }}>
              {initials(person.name)}
            </span>
            <div>
              <strong>
                {person.name}
                {person.id === member.id && <small> Ty</small>}
              </strong>
              {person.isAdmin && <span className="admin-badge">Administrator</span>}
              <span>
                {formatProgressPercent(person.metrics.progressPercent)}% planu
              </span>
              <span className="member-progress" aria-hidden="true">
                <i style={{ width: `${person.metrics.progressPercent}%` }} />
              </span>
            </div>
            <div className="member-actions">
              <b
                className={`pace-${getPaceTone(person.metrics.paceDays)}`}
              >
                {person.metrics.paceDays > 0 ? "+" : ""}
                {person.metrics.paceDays} d.
              </b>
              {member.isAdmin && person.id !== member.id && <button
                className="small-button manage-member-button"
                aria-label={`Zarządzaj profilem ${person.name}`}
                onClick={() => setManagedId(person.id)}>Zarządzaj</button>}
              {member.isAdmin && !person.isAdmin && person.id !== member.id && (
                <button
                  className="remove-member-button"
                  disabled={busyMember === person.id}
                  onClick={() => onRemove(person)}
                  aria-label={`Usuń ${person.name}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      {member.isAdmin && managedPerson && <MemberAccessModal
        key={managedPerson.id}
        credentials={credentials}
        person={managedPerson}
        progressPercent={formatProgressPercent(getMemberMetrics(group, managedPerson.id).progressPercent)}
        onRoleChange={onRoleChange}
        onClose={() => setManagedId(null)}
        copyText={copyText}
        renderQr={(value) => <QrCode value={value} label="Kod QR do przywrócenia dostępu" />}
      />}
    </>
  );
}

function SettingsView({
  credentials,
  group,
  member,
  onLeave,
  savingProgress,
  onReplace,
}: {
  credentials: Credentials;
  group: Group;
  member: Member;
  onLeave: () => void;
  savingProgress: boolean;
  onReplace: (group: Group) => void;
}) {
  const startDate = group.planDays[0]?.date ?? group.startDate;
  const endDate = group.planDays.at(-1)?.date ?? group.startDate;
  const frequency = formatFrequency(group.frequency);
  const onboarding = useOnboarding();
  const [transfer, setTransfer] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [copied, setCopied] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  async function prepareTransfer() {
    setTransferBusy(true);
    setTransferError("");
    setCopied(false);
    try {
      setTransfer(await createSessionTransfer(credentials));
    } catch {
      setTransferError("Nie udało się utworzyć kodu połączenia.");
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Ustawienia" />
      <h2 className="settings-heading">Grupa</h2>
      <section className="settings-card">
        <Setting label="Grupa" value={group.name} />
        <Setting label="Użytkownik" value={member.name} />
      </section>
      <h2 className="settings-heading">Plan</h2>
      <section className="settings-card">
        <Setting
          label="Start"
          value={formatPolishDate(startDate, "shortYear")}
        />
        <Setting
          label="Koniec"
          value={formatPolishDate(endDate, "shortYear")}
        />
        <Setting label="Dni czytania" value={frequency} />
        <div className="plan-download">
          <button type="button" className="small-button" onClick={() => downloadPlanCsv(group)}>Pobierz plan CSV</button>
        </div>
      </section>
      <PlanReplacement group={group} credentials={credentials} disabled={savingProgress} onReplace={onReplace} />
      {onboarding.installAvailable &&
        <section className="settings-card"><button type="button" className="small-button" onClick={() => window.dispatchEvent(new Event("reading-install-request"))}>
          Dodaj aplikację do ekranu głównego
        </button></section>}
      <NotificationSettings credentials={credentials} />
      <GroupAccessSettings group={group} member={member} />
      <h2 className="settings-heading">Połącz inne urządzenie</h2>
      <section className="settings-card transfer-card">
        <p>
          Utwórz jednorazowy kod, a następnie zeskanuj go na drugim urządzeniu.
          Kod jest ważny przez 10 minut. Oba urządzenia zachowają dostęp do tego samego profilu.
        </p>
        {transferError && <div className="simple-alert">{transferError}</div>}
        {transfer ? (
          <div className="transfer-result">
            <QrCode
              value={createSessionTransferLink(transfer.code)}
              label="Kod QR do połączenia urządzenia"
            />
            <strong>{transfer.code}</strong>
            <span>
              Ważny do{" "}
              {new Intl.DateTimeFormat("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(transfer.expiresAt))}
            </span>
            <div className="transfer-actions">
              <button
                className="small-button"
                onClick={async () => {
                  await copyText(transfer.code);
                  setCopied(true);
                }}
              >
                <Icon name="copy" size={16} />
                {copied ? "Skopiowano" : "Kopiuj kod"}
              </button>
              <button
                className="small-button transfer-refresh"
                disabled={transferBusy}
                onClick={prepareTransfer}
              >
                {transferBusy ? "Tworzenie…" : "Utwórz nowy kod"}
              </button>
            </div>
            <p className="transfer-help">
              Zeskanuj kod QR drugim urządzeniem. Kod tekstowy pozostaje
              awaryjną opcją.
            </p>
          </div>
        ) : (
          <button
            className="main-button"
            disabled={transferBusy}
            onClick={prepareTransfer}
          >
            {transferBusy ? "Tworzenie…" : "Utwórz kod połączenia"}
          </button>
        )}
      </section>
      <h2 className="settings-heading">Konto</h2>
      <section className="settings-card">
        {logoutConfirm ? <div className="logout-confirm" role="alert">
          <p>Po wylogowaniu możesz wrócić przez link od administratora grupy lub połączenie z innym urządzeniem. Samo imię nie przywróci dostępu.</p>
          {member.isAdmin && !group.members.some((person) => person.isAdmin && person.id !== member.id) &&
            <p>Jesteś jedynym administratorem. Zanim się wylogujesz, wyznacz drugiego administratora lub połącz inne urządzenie.</p>}
          <div className="access-actions">
            <button className="logout-button" onClick={onLeave}>Wyloguj z tego urządzenia</button>
            <button className="link-button" onClick={() => setLogoutConfirm(false)}>Anuluj</button>
          </div>
        </div> : <button className="logout-button" onClick={() => setLogoutConfirm(true)}>
          <Icon name="logout" size={18} /> Wyloguj
        </button>}
      </section>
    </>
  );
}

export function DayCard({
  day,
  progress,
  onToggle,
  extraReading,
  header,
  restDay = false,
  pendingReading = "",
  disabled = false,
}: {
  header?: ReactNode;
  restDay?: boolean;
  pendingReading?: string;
  disabled?: boolean;
  day: PlanDay;
  progress: Record<string, string>;
  onToggle: (segmentId: string) => Promise<void>;
  extraReading?: {
    reading: RecoveryReading;
    completed: boolean;
    disabled: boolean;
    onToggle: () => Promise<void>;
  };
}) {
  return (
    <section className="simple-day">
      {header}
      {restDay && <p className="reading-rest-hint" role="note">
        Dziś dzień wolny w planie. Możesz czytać dalej we własnym tempie.
      </p>}
      <div className="simple-readings">
        {day.segments.map((segment) => (
          <ReadingRow
            key={segment.id}
            label={segment.label}
            section={segment.section}
            completed={Boolean(progress[segment.id])}
            disabled={disabled}
            pending={pendingReading === segment.id}
            onToggle={() => onToggle(segment.id)}
          />
        ))}
        {extraReading && (
          <ReadingRow
            label={extraReading.reading.label}
            section="Nadrabianie"
            completed={extraReading.completed}
            disabled={disabled || extraReading.disabled}
            pending={pendingReading === "extra"}
            onToggle={extraReading.onToggle}
            isExtra
          />
        )}
      </div>
    </section>
  );
}

function ReadingRow({
  label,
  section,
  completed,
  disabled,
  onToggle,
  isExtra = false,
  pending = false,
}: {
  label: string;
  section: string;
  completed: boolean;
  disabled: boolean;
  onToggle: () => Promise<void>;
  isExtra?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${completed ? "checked" : ""} ${isExtra ? "reading-extra" : ""}`}
      disabled={disabled}
      onClick={() => { void onToggle().catch(() => undefined); }}
      aria-pressed={completed}
      aria-busy={pending || undefined}
      title={pending ? "Zapisywanie dnia…" : isExtra && disabled && !completed
        ? "Najpierw dokończ fragmenty powyżej."
        : undefined}
    >
      <span className="simple-checkbox">
        {pending ? <span className="reading-row-spinner" role="status" aria-label="Zapisywanie dnia" />
          : completed && <Icon name="check" size={16} />}
      </span>
      <span>
        {isExtra && <small><span className="reading-extra-label">
          <Icon name="plus" size={12} />{section} · 1 rozdział
        </span></small>}
        <strong>{label}</strong>
      </span>
    </button>
  );
}

function InviteModal({
  credentials,
  onClose,
  onCredentialsChange,
}: {
  credentials: Credentials;
  onClose: () => void;
  onCredentialsChange: (credentials: Credentials) => void;
}) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ensureInvite(credentials)
      .then((nextCredentials) => {
        if (cancelled) return;
        onCredentialsChange(nextCredentials);
        setLink(createJoinLink(nextCredentials));
      })
      .catch(() => {
        if (!cancelled) setError("Nie udało się utworzyć linku.");
      });
    return () => {
      cancelled = true;
    };
  }, [
    credentials.groupId,
    credentials.memberId,
    credentials.token,
    onCredentialsChange,
  ]);

  return (
    <div className="simple-modal-bg" onMouseDown={onClose}>
      <section
        className="simple-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button" onClick={onClose} aria-label="Zamknij">
          <Icon name="close" />
        </button>
        <h2>Link zaproszenia</h2>
        {error ? (
          <div className="simple-alert">{error}</div>
        ) : link ? (
          <div className="invite-link">
            <QrCode value={link} label="Kod QR zaproszenia do planu" />
            <p className="invite-help">
              Zeskanuj kod QR aparatem telefonu, aby otworzyć zaproszenie.
            </p>
            <input value={link} readOnly aria-label="Link zaproszenia" />
            <button
              className="main-button"
              onClick={async () => {
                await copyText(link);
                setCopied(true);
              }}
            >
              <Icon name="copy" size={17} />
              {copied ? "Skopiowano" : "Kopiuj link"}
            </button>
          </div>
        ) : (
          <div className="simple-loader inline-loader">Tworzenie linku…</div>
        )}
      </section>
    </div>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Nie udało się skopiować tekstu.");
  } finally {
    input.remove();
  }
}

function TabButton({
  item,
  active,
  setTab,
}: {
  item: { id: Tab; label: string; icon: IconName };
  active: Tab;
  setTab: (tab: Tab) => void;
}) {
  return (
    <button
      className={active === item.id ? "active" : ""}
      onClick={() => setTab(item.id)}
    >
      <Icon name={item.icon} size={18} />
      {item.label}
    </button>
  );
}

function Brand() {
  return (
    <div className="simple-brand">
      <span><Icon name="book" size={20} /></span>
      <b>Plan czytania Biblii</b>
    </div>
  );
}

function PageTitle({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {meta && <span>{meta}</span>}
      </div>
      {action}
    </div>
  );
}

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      aria-label={dark ? "Włącz tryb jasny" : "Włącz tryb ciemny"}
      onClick={() => onChange(dark ? "light" : "dark")}
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="simple-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatFrequency(frequency: Frequency) {
  if (frequency.kind === "daily") return "Codziennie";
  if (frequency.kind === "weekdays") return "Pon–pt";
  const names = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
  return frequency.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => names[day])
    .join(", ");
}
