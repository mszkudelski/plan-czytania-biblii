import { getRecoveryDay, splitReadingChapters, parseReadChapters, validateDailyRecoveryReading, type RecoveryReading, projectRecoveryPortions, parseChapterMarks, isRecoveryChapterRead, setRecoveryChapters, type ReadChapterMarks, parseRecoveryPortion, type RecoveryPortion } from "./lib/recovery";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  clearCredentials,
  clearSession,
  createGroup,
  createSessionTransfer,
  ensureInvite,
  getGroup,
  joinGroup,
  loadCredentials,
  redeemSessionTransfer,
  removeMember,
  saveCredentials,
  saveSession,
  restoreSession,
  updateProgress,
  updateMemberRole,
} from "./lib/api";
import { parsePlanCsv } from "./lib/csv";
import GroupAccessSettings from "./GroupAccessSettings";
import MemberAccessModal from "./MemberAccessModal";
import { BASIC_PLAN_CSV } from "./lib/basic-plan";
import QRCode from "qrcode";
import {
  createJoinLink,
  createSessionTransferLink,
  parseJoinLink,
  parseSessionTransfer,
  readJoinFromHash,
  readSessionTransferFromHash,
} from "./lib/invite";
import {
  isIosSafariBrowser,
  isMobileDevice,
  isStandaloneApp,
} from "./lib/install";
import {
  clearCachedGroup,
  loadCachedGroup,
  saveCachedGroup,
} from "./lib/plan-cache";
import QrScanner from "qr-scanner";
import NotificationSettings from "./NotificationSettings";
import { reminderDeviceId } from "./lib/push-client";
import { notificationSettings } from "./lib/api";
import {
  calculateProgressPercent,
  formatProgressPercent,
  getMemberMetrics,
  getNextDay,
  getPaceTone,
} from "./lib/metrics";
import { cleanPersonName, normalizePersonName } from "./lib/name";
import { createOptimisticProgressQueue } from "./lib/optimistic-progress";
import { buildSchedule, formatPolishDate, todayIso } from "./lib/schedule";
import { formatReadingCount, getDailyReadingDay, getReadingHomeSummary, getReadingWeekSummary } from "./lib/reading-home";
import type {
  Credentials,
  Frequency,
  FrequencyKind,
  Group,
  JoinInvite,
  Member,
  PlanDay,
} from "./types";

type Tab = "today" | "plan" | "group" | "settings";
type Theme = "light" | "dark";
type IconName =
  | "book"
  | "today"
  | "plan"
  | "group"
  | "settings"
  | "check"
  | "plus"
  | "close"
  | "copy"
  | "trash"
  | "logout"
  | "moon"
  | "sun"
  | "left"
  | "right"
  | "double-left"
  | "double-right"
  | "install"
  | "share"
  | "refresh";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    ),
    today: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
    plan: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    group: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.37.34.71.6 1 .26.28.62.4 1 .4h.09v4H21a1.7 1.7 0 0 0-1.6.6Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: (
      <>
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5M21 12H9" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
    "double-left": <path d="m11 17-5-5 5-5m7 10-5-5 5-5" />,
    "double-right": <path d="m6 17 5-5-5-5m7 10 5-5-5-5" />,
    install: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2" />
      </>
    ),
    share: (
      <>
        <path d="M12 3v12M8 7l4-4 4 4" />
        <path d="M5 10H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.7-4L4 9" />
        <path d="M4 4v5h5M4 13a8 8 0 0 0 14.7 4L20 15" />
        <path d="M20 20v-5h-5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function QrCode({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSource("");
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
    })
      .then((nextSource) => {
        if (!cancelled) setSource(nextSource);
      })
      .catch(() => {
        if (!cancelled) setSource("");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!source) {
    return <div className="qr-code-placeholder">Tworzenie kodu QR…</div>;
  }

  return <img className="qr-code" src={source} alt={label} />;
}

export default function SimpleApp() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("plan-czytania-biblii-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [joinInvite, setJoinInvite] = useState<JoinInvite | null>(() =>
    readJoinFromHash(),
  );
  const [transferCode, setTransferCode] = useState<string | null>(() =>
    readSessionTransferFromHash(),
  );
  const [transferPurpose, setTransferPurpose] = useState<"recovery" | "pairing">(() => /^#restore=/i.test(window.location.hash) ? "recovery" : "pairing");
  const [credentials, setCredentials] = useState<Credentials | null>(() =>
    loadCredentials(),
  );
  const [initialCachedGroup] = useState(() => {
    const savedCredentials = loadCredentials();
    return savedCredentials ? loadCachedGroup(savedCredentials.groupId) : null;
  });
  const [group, setGroup] = useState<Group | null>(
    () => initialCachedGroup?.group ?? null,
  );
  const [cachedAt, setCachedAt] = useState<string | null>(
    () => initialCachedGroup?.savedAt ?? null,
  );
  const [loading, setLoading] = useState(() => !initialCachedGroup);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [accessView, setAccessView] = useState<"recover" | "transfer" | "admin" | null>(null);
  const [retry, setRetry] = useState(0);
  const skipSessionRestore = useRef(false);
  const groupWriteVersion = useRef(0);
  const latestGroup = useRef<Group | null>(initialCachedGroup?.group ?? null);

  useEffect(() => {
    function readAccessLink() {
      setTransferCode(readSessionTransferFromHash());
      setTransferPurpose(/^#restore=/i.test(window.location.hash) ? "recovery" : "pairing");
      setJoinInvite(readJoinFromHash());
      setAccessView(null);
    }
    window.addEventListener("hashchange", readAccessLink);
    return () => window.removeEventListener("hashchange", readAccessLink);
  }, []);

  const setGroupAndCache = useCallback((nextGroup: Group) => {
    latestGroup.current = nextGroup;
    setGroup(nextGroup);
    setCachedAt(saveCachedGroup(nextGroup));
  }, []);

  const commitGroup = useCallback((nextGroup: Group) => {
    groupWriteVersion.current++;
    setGroupAndCache(nextGroup);
  }, [setGroupAndCache]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("plan-czytania-biblii-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!credentials) {
      if (skipSessionRestore.current) {
        skipSessionRestore.current = false;
        setLoading(false);
        return;
      }
      if (joinInvite) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError("");
      setSyncMessage("");
      setRefreshing(true);
      restoreSession()
        .then((session) => {
          if (cancelled || !session) return;
          saveCredentials(session.credentials);
          setCredentials(session.credentials);
          setGroupAndCache(session.group);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Nie udało się sprawdzić zapisanej sesji.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setRefreshing(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    if (joinInvite && credentials.groupId !== joinInvite.groupId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const hasVisibleGroup = Boolean(group);
    const readWriteVersion = groupWriteVersion.current;
    if (!hasVisibleGroup) setLoading(true);
    setRefreshing(true);
    setError("");
    setSyncMessage("");
    saveSession(credentials)
      .then((session) => {
        if (cancelled) return;
        saveCredentials(session.credentials);
        setCredentials(session.credentials);
        const current = latestGroup.current;
        const freshGroup = groupWriteVersion.current !== readWriteVersion && current?.id === session.group.id
          ? { ...session.group, progress: { ...session.group.progress, [credentials.memberId]: current.progress[credentials.memberId] ?? {} } }
          : session.group;
        setGroupAndCache(freshGroup);
        if (joinInvite) {
          setJoinInvite(null);
          if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) {
          clearCachedGroup(credentials.groupId);
          setGroup(null);
          setCachedAt(null);
        } else if (hasVisibleGroup) {
          const lastSync = cachedAt
            ? ` Ostatnia synchronizacja: ${formatCacheTime(cachedAt)}.`
            : "";
          setSyncMessage(
            `Brak połączenia. Pokazuję ostatnio zapisane dane planu.${lastSync}`,
          );
        }
        setError(sessionError(caught));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    credentials?.groupId,
    credentials?.memberId,
    credentials?.token,
    joinInvite?.groupId,
    retry,
    setGroupAndCache,
  ]);

  function enter(groupData: Group, nextCredentials: Credentials) {
    setAccessView(null);
    saveCredentials(nextCredentials);
    setCredentials(nextCredentials);
    setGroupAndCache(groupData);
    setSyncMessage("");
    setJoinInvite(null);
    setTransferCode(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  const changeCredentials = useCallback((nextCredentials: Credentials) => {
    saveCredentials(nextCredentials);
    setCredentials(nextCredentials);
  }, []);

  const canResumeInvite = Boolean(
    joinInvite && credentials?.groupId === joinInvite.groupId,
  );

  let content: React.ReactNode;

  if (accessView === "recover") {
    content = <RecoverAccessSetup onBack={() => setAccessView(null)}
      onAdminCode={() => setAccessView("admin")}
      onTransfer={() => setAccessView("transfer")} theme={theme} onThemeChange={setTheme} />;
  } else if (accessView === "transfer" || accessView === "admin") {
    content = <TransferSetup onRecovered={enter} onBack={() => setAccessView(null)}
      purpose={accessView === "admin" ? "recovery" : "pairing"}
      theme={theme} onThemeChange={setTheme} />;
  } else if (joinInvite && !canResumeInvite) {
    content = (
      <JoinSetup
        invite={joinInvite}
        onJoined={enter}
        onRecover={() => setAccessView("recover")}
        onTransfer={() => setAccessView("transfer")}
        onBack={() => {
          setJoinInvite(null);
          window.history.replaceState(null, "", window.location.pathname);
        }}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  } else if (transferCode) {
    content = (
      <TransferSetup
        key={`${transferPurpose}:${transferCode}`}
        initialCode={transferCode}
        purpose={transferPurpose}
        autoRedeem={transferPurpose === "pairing" && !credentials}
        hasCurrentProfile={Boolean(credentials)}
        onRecovered={enter}
        onBack={() => {
          setTransferCode(null);
          window.history.replaceState(null, "", window.location.pathname);
        }}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  } else if (loading) {
    content = <div className="simple-loader">Wczytywanie…</div>;
  } else if (credentials && group) {
    content = (
      <Dashboard
        key={`${credentials.groupId}:${credentials.memberId}:${credentials.token}`}
        credentials={credentials}
        group={group}
        setGroup={commitGroup}
        onCredentialsChange={changeCredentials}
        theme={theme}
        onThemeChange={setTheme}
        refreshing={refreshing}
        syncMessage={syncMessage}
        onRefresh={() => setRetry((current) => current + 1)}
        onLeave={async () => {
          skipSessionRestore.current = true;
          await notificationSettings(credentials, reminderDeviceId(), "disable").catch(() => undefined);
          await clearSession().catch(() => undefined);
          clearCachedGroup(credentials.groupId);
          clearCredentials();
          setCredentials(null);
          setGroup(null);
          setCachedAt(null);
          setSyncMessage("");
        }}
      />
    );
  } else if (credentials) {
    content = (
      <SessionRecovery
        error={error}
        onRecover={() => setAccessView("recover")}
        onTransfer={() => setAccessView("transfer")}
        onRetry={() => setRetry((current) => current + 1)}
        onReset={() => {
          clearCachedGroup(credentials.groupId);
          clearCredentials();
          setCredentials(null);
          setGroup(null);
          setCachedAt(null);
          setError("");
          setSyncMessage("");
        }}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  } else {
    content = (
      <Setup
        onCreated={enter}
        onRecovered={enter}
        onJoinInvite={(invite) => setJoinInvite(invite)}
        error={error}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <>
      <InstallApp />
      {content}
    </>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_PROMPT_DISMISSED_KEY = "plan-czytania-install-prompt-dismissed";

function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "true",
  );
  const [installed, setInstalled] = useState(() =>
    isStandaloneApp(
      window.matchMedia("(display-mode: standalone)").matches,
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    ),
  );
  const iosSafari = isIosSafariBrowser(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
  const mobileDevice = isMobileDevice(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );

  useEffect(() => {
    function rememberPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    function markInstalled() {
      setInstalled(true);
      setPromptEvent(null);
      setInstructionsOpen(false);
    }

    window.addEventListener("beforeinstallprompt", rememberPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (
    installed ||
    dismissed ||
    !mobileDevice ||
    (!promptEvent && !iosSafari)
  ) {
    return null;
  }

  function dismiss() {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "true");
    setDismissed(true);
    setInstructionsOpen(false);
  }

  async function install() {
    if (!promptEvent) {
      setInstructionsOpen(true);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <>
      <aside className="install-app-card" aria-labelledby="install-card-title">
        <button
          type="button"
          className="install-card-close"
          onClick={dismiss}
          aria-label="Nie pokazuj ponownie"
        >
          <Icon name="close" size={18} />
        </button>
        <span className="install-card-icon">
          <Icon name="install" size={24} />
        </span>
        <div className="install-card-content">
          <h2 id="install-card-title">Dodaj aplikację do ekranu głównego</h2>
          <p>
            Po instalacji ikona aplikacji pojawi się na ekranie głównym
            urządzenia. Plan będzie otwierać się jak zwykła aplikacja.
          </p>
          <p className="install-card-note">
            W Chrome otworzy się systemowe potwierdzenie. W Safari pokażemy Ci
            krótką instrukcję.
          </p>
          <button
            type="button"
            className="main-button"
            onClick={() => void install()}
          >
            <Icon name="install" size={18} />
            Zainstaluj
          </button>
        </div>
      </aside>

      {instructionsOpen && (
        <div
          className="simple-modal-bg"
          onMouseDown={() => setInstructionsOpen(false)}
        >
          <section
            className="simple-modal install-instructions"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-instructions-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button"
              onClick={() => setInstructionsOpen(false)}
              aria-label="Zamknij"
            >
              <Icon name="close" />
            </button>
            <h2 id="install-instructions-title">Zainstaluj na iPhonie</h2>
            <ol className="install-steps">
              <li>
                <span>1</span>
                <p>
                  W Safari stuknij <strong>Udostępnij</strong>{" "}
                  <span className="inline-share-icon">
                    <Icon name="share" size={18} />
                  </span>
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Przewiń listę i wybierz{" "}
                  <strong>Dodaj do ekranu początkowego</strong>.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>Włącz opcję <strong>Otwórz jako aplikację webową</strong>.</p>
              </li>
              <li>
                <span>4</span>
                <p>Stuknij <strong>Dodaj</strong> w prawym górnym rogu.</p>
              </li>
            </ol>
            <button
              type="button"
              className="main-button"
              onClick={() => setInstructionsOpen(false)}
            >
              Gotowe
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function SessionRecovery({
  error,
  onRecover,
  onTransfer,
  onRetry,
  onReset,
  theme,
  onThemeChange,
}: {
  error: string;
  onRecover: () => void;
  onTransfer: () => void;
  onRetry: () => void;
  onReset: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <main className="setup-page">
      <div className="setup-box join-box session-recovery">
        <div className="setup-top">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <h1>Nie mogę wczytać planu</h1>
        <div className="simple-alert">
          {error || "Wystąpił chwilowy problem z połączeniem."}
        </div>
        <p>
          Zapisane połączenie z planem zostało zachowane. Spróbuj ponownie za
          chwilę.
        </p>
        <div className="session-recovery-actions">
          <button className="main-button" onClick={onRetry}>
            Spróbuj ponownie
          </button>
          <button className="link-button" onClick={onReset}>
            Wyczyść zapisane połączenie
          </button>
          <button className="link-button" onClick={onRecover}>Odzyskaj mój dostęp</button>
          <button className="link-button" onClick={onTransfer}>Połącz z działającym urządzeniem</button>
        </div>
      </div>
    </main>
  );
}

function sessionError(caught: unknown) {
  if (caught instanceof ApiError && caught.status === 404) {
    return "Nie znaleziono planu na serwerze. Zapisane połączenie nie zostało usunięte.";
  }
  if (caught instanceof ApiError && [401, 403].includes(caught.status)) {
    return "To zapisane połączenie nie ma już dostępu do tego planu.";
  }
  if (caught instanceof Error && caught.message === "Brak dostępu.") {
    return "To zapisane połączenie nie ma już dostępu do tego planu.";
  }
  return "Nie udało się otworzyć planu. Zapisane połączenie nie zostało usunięte.";
}

function formatCacheTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function JoinSetup({
  invite,
  onJoined,
  onRecover,
  onTransfer,
  onBack,
  theme,
  onThemeChange,
}: {
  invite: JoinInvite;
  onJoined: (group: Group, credentials: Credentials) => void;
  onRecover: () => void;
  onTransfer: () => void;
  onBack: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [invitedGroup, setInvitedGroup] = useState<Group | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGroup(invite.groupId).then((value) => { if (!cancelled) setInvitedGroup(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [invite.groupId]);
  const matchingName = invitedGroup?.members.some((member) =>
    normalizePersonName(member.name) === normalizePersonName(name),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = cleanPersonName(name);
    if (!cleanName) return;
    setBusy(true);
    setError("");
    try {
      const result = await joinGroup(invite, cleanName);
      onJoined(result.group, result.credentials);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Nie udało się dołączyć do planu. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup-page">
      <div className="setup-box join-box">
        <div className="setup-top">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <h1>Dołącz do planu</h1>
        {invitedGroup && <p className="setup-description">{invitedGroup.name}</p>}
        <p className="setup-description">Dołączysz jako nowa osoba z własnym postępem. Imię jest nazwą widoczną dla grupy.</p>
        <form onSubmit={submit}>
          {error && <div className="simple-alert">{error}</div>}
          <Field label="Twoje imię">
            <input
              type="text"
              name="name"
              autoComplete="name"
              maxLength={80}
              placeholder="np. Szymon Kowalski"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
          </Field>
          {matchingName && <p className="name-match-notice" role="status">
            W grupie jest już osoba o takiej nazwie. Dołączenie utworzy osobny profil.
            Jeśli to Twój wcześniejszy profil, odzyskaj dostęp poniżej.
          </p>}
          <button
            className="main-button"
            disabled={busy || !cleanPersonName(name)}
          >
            {busy ? "Dołączanie…" : "Dołącz jako nowa osoba"}
          </button>
        </form>
        <div className="access-entry-options">
          <strong>Masz już profil w tym planie?</strong>
          <button className="link-button" onClick={onRecover}>Odzyskaj mój dostęp</button>
          <button className="link-button" onClick={onTransfer}>Mam dostęp na innym urządzeniu</button>
          <button className="link-button" onClick={onBack}>Wróć do wyboru</button>
        </div>
      </div>
    </main>
  );
}

function RecoverAccessSetup({
  onBack, onTransfer, onAdminCode, theme, onThemeChange,
}: {
  onBack: () => void;
  onTransfer: () => void;
  onAdminCode: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <main className="setup-page">
      <div className="setup-box join-box">
        <div className="setup-top"><Brand /><ThemeToggle theme={theme} onChange={onThemeChange} /></div>
        <h1>Odzyskaj mój dostęp</h1>
        <p className="setup-description">
          Poproś administratora swojej grupy o jednorazowy link dostępu.
          W zakładce Grupa wybierze Twój profil i opcję Zarządzaj → Przywróć dostęp.
          Wrócisz do swojego postępu, bez zakładania nowego profilu.
        </p>
        <button className="main-button" onClick={onAdminCode}>Mam link lub kod od administratora</button>
        <div className="access-entry-options">
          <p>Jeśli plan działa na innym urządzeniu, połącz je kodem lub QR z ustawień.</p>
          <button className="link-button" onClick={onTransfer}>Mam dostęp na innym urządzeniu</button>
          <button className="link-button" onClick={onBack}>Wróć do wyboru</button>
        </div>
      </div>
    </main>
  );
}

function TransferSetup({
  initialCode = "",
  purpose = "pairing",
  autoRedeem = true,
  hasCurrentProfile = false,
  onRecovered,
  onBack,
  theme,
  onThemeChange,
}: {
  initialCode?: string;
  purpose?: "pairing" | "recovery";
  autoRedeem?: boolean;
  hasCurrentProfile?: boolean;
  onRecovered: (group: Group, credentials: Credentials) => void;
  onBack: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const submittedCode = useRef("");

  const redeem = useCallback(
    async (nextCode: string) => {
      const normalizedCode = parseSessionTransfer(nextCode);
      if (!normalizedCode) { setError("Wklej pełny link lub kod z 8 znaków."); return; }
      setCode(normalizedCode);
      setBusy(true);
      setError("");
      try {
        const result = await redeemSessionTransfer(normalizedCode);
        onRecovered(result.group, result.credentials);
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.status === 403
            ? caught.message
            : purpose === "recovery"
              ? "Link lub kod jest nieprawidłowy, wygasł albo został już wykorzystany. Poproś administratora o nowy."
              : "Kod jest nieprawidłowy, wygasł albo został już wykorzystany. Utwórz nowy kod na urządzeniu, na którym działa plan.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onRecovered, purpose],
  );

  useEffect(() => {
    if (!autoRedeem || !initialCode || submittedCode.current === initialCode) return;
    submittedCode.current = initialCode;
    void redeem(initialCode);
  }, [initialCode, autoRedeem, redeem]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void redeem(code);
  }

  const handleScan = useCallback(
    (value: string) => {
      const scannedCode = parseSessionTransfer(value);
      if (!scannedCode) {
        setError("Ten kod QR nie zawiera linku dostępu ani kodu połączenia urządzenia.");
        return;
      }
      setScannerOpen(false);
      void redeem(scannedCode);
    },
    [redeem],
  );

  return (
    <main className="setup-page">
      <div className="setup-box join-box">
        <div className="setup-top">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <h1>{purpose === "recovery" ? "Przywróć dostęp do profilu" : "Połącz inne urządzenie"}</h1>
        <p className="setup-description">
          {purpose === "recovery"
            ? "Wklej link lub kod od administratora albo zeskanuj jego QR. Dostęp jest jednorazowy i ważny przez 10 minut. Otworzysz swój dotychczasowy profil i postęp."
            : "Zeskanuj kod QR wyświetlony na urządzeniu, na którym działa Twój plan: Ustawienia → Połącz inne urządzenie. Oba urządzenia zachowają dostęp do tego samego profilu."}
        </p>
        {hasCurrentProfile && <p className="simple-alert">Masz już otwarty profil na tym urządzeniu. Po potwierdzeniu przełączysz się na profil wskazany w linku.</p>}
        {scannerOpen && (
          <TransferQrScanner
            onScan={handleScan}
            onClose={() => setScannerOpen(false)}
          />
        )}
        <form onSubmit={submit}>
          {error && <div className="simple-alert" role="alert">{error}</div>}
          {!scannerOpen && (
            <button
              type="button"
              className="scanner-button"
              onClick={() => {
                setError("");
                setScannerOpen(true);
              }}
            >
              Otwórz aparat i zeskanuj kod QR
            </button>
          )}
          <Field label={purpose === "recovery" ? "Link lub kod dostępu" : "Kod połączenia"}>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              maxLength={2048}
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD-EFGH"
              autoFocus={!initialCode}
              required
            />
          </Field>
          <button className="main-button" disabled={busy || !parseSessionTransfer(code)}>
            {busy ? "Łączenie…" : purpose === "recovery" ? "Przywróć mój dostęp" : "Otwórz mój plan"}
          </button>
          <button type="button" className="link-button" onClick={onBack}>
            Wróć do wyboru
          </button>
        </form>
      </div>
    </main>
  );
}

function TransferQrScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    if (!videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => onScan(result.data),
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
        onDecodeError: () => {},
      },
    );

    void scanner.start().catch((caught: unknown) => {
      setScannerError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Aparat jest zablokowany. Zezwól przeglądarce na dostęp do aparatu i spróbuj ponownie."
          : "Nie udało się uruchomić aparatu. Możesz wpisać kod ręcznie.",
      );
    });

    return () => {
      scanner.destroy();
    };
  }, [onScan]);

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-frame">
        <video ref={videoRef} muted playsInline />
      </div>
      <p className="qr-scanner-help">
        Skieruj aparat na kod QR wyświetlony na drugim urządzeniu.
      </p>
      {scannerError && <div className="simple-alert">{scannerError}</div>}
      <button type="button" className="link-button" onClick={onClose}>
        Zamknij aparat
      </button>
    </div>
  );
}

function JoinEntrySetup({
  onJoinInvite,
  onBack,
  theme,
  onThemeChange,
}: {
  onJoinInvite: (invite: JoinInvite) => void;
  onBack: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const invite = parseJoinLink(link.trim());
    if (!invite) {
      setError("Wklej prawidłowy link zaproszenia do planu.");
      return;
    }
    onJoinInvite(invite);
  }

  const handleScan = useCallback((value: string) => {
    const invite = parseJoinLink(value);
    if (!invite) {
      setError("Ten kod QR nie zawiera zaproszenia do planu.");
      return;
    }
    setScannerOpen(false);
    onJoinInvite(invite);
  }, [onJoinInvite]);

  return (
    <main className="setup-page">
      <div className="setup-box join-box">
        <div className="setup-top">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <h1>Dołącz do planu</h1>
        <p className="setup-description">
          Zeskanuj kod QR zaproszenia aparatem telefonu albo wklej otrzymany
          link.
        </p>
        {scannerOpen && (
          <TransferQrScanner
            onScan={handleScan}
            onClose={() => setScannerOpen(false)}
          />
        )}
        <form onSubmit={submit}>
          {error && <div className="simple-alert">{error}</div>}
          {!scannerOpen && (
            <button
              type="button"
              className="scanner-button"
              onClick={() => {
                setError("");
                setScannerOpen(true);
              }}
            >
              Otwórz aparat i zeskanuj kod QR
            </button>
          )}
          <Field label="Link zaproszenia">
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://plan-czytania.netlify.app/#join=…"
              autoFocus
              required
            />
          </Field>
          <button className="main-button" disabled={!link.trim()}>
            Otwórz zaproszenie
          </button>
          <button type="button" className="link-button" onClick={onBack}>
            Wróć do wyboru
          </button>
        </form>
      </div>
    </main>
  );
}

function LandingPage({
  error,
  onChoose,
  theme,
  onThemeChange,
}: {
  error: string;
  onChoose: (choice: "transfer" | "create" | "join" | "recover") => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <main className="landing-page">
      <div className="landing-shell">
        <header className="landing-header">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </header>

        <section className="landing-hero">
          <div className="landing-eyebrow">Dla Ciebie, rodziny i grupy</div>
          <h1>Plan czytania Biblii,<br />który łatwo trzymać.</h1>
          <p>
            Ustal plan, czytaj każdego dnia i zaznaczaj postęp.
            Zaproś innych i każdy śledzi swoje czytanie w jednym miejscu.
          </p>
          {error && <div className="simple-alert">{error}</div>}
          <div className="landing-actions">
            <button type="button" className="main-button landing-primary" onClick={() => onChoose("create")}>
              Utwórz plan
            </button>
            <button type="button" className="landing-secondary" onClick={() => onChoose("join")}>
              Dołącz do istniejącego planu
            </button>
          </div>
          <button type="button" className="link-button landing-transfer" onClick={() => onChoose("transfer")}>
            Mam już plan na innym urządzeniu → połącz urządzenie
          </button>
          <button type="button" className="link-button landing-recover" onClick={() => onChoose("recover")}>
            Odzyskaj dostęp do mojego planu
          </button>
        </section>

        <section className="landing-features" aria-label="Najważniejsze funkcje">
          <article>
            <span>01</span>
            <strong>Twój plan</strong>
            <p>Wgraj własny plan czytania i ustaw dni, w które chcesz czytać.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Twój postęp</strong>
            <p>Zaznaczaj przeczytane fragmenty i od razu widzisz, gdzie jesteś.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Wspólne czytanie</strong>
            <p>Zaproś rodzinę lub grupę. Każda osoba ma własny postęp.</p>
          </article>
        </section>

        <p className="landing-footer">
          Bez konta e-mail. Zacznij od własnego planu lub dołącz przez zaproszenie.
        </p>
      </div>
    </main>
  );
}

function Setup({
  onCreated,
  onRecovered,
  onJoinInvite,
  error: initialError,
  theme,
  onThemeChange,
}: {
  onCreated: (group: Group, credentials: Credentials) => void;
  onRecovered: (group: Group, credentials: Credentials) => void;
  onJoinInvite: (invite: JoinInvite) => void;
  error: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [groupName, setGroupName] = useState("Plan czytania Biblii");
  const [ownerName, setOwnerName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [frequencyKind, setFrequencyKind] =
    useState<FrequencyKind>("weekdays");
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [view, setView] = useState<
    "choices" | "create" | "transfer" | "join" | "recover" | "admin"
  >("choices");
  const rows = useMemo(() => parsePlanCsv(csvText), [csvText]);

  function readFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setFileName(file.name);
      setError("");
    };
    reader.readAsText(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cleanPersonName(ownerName)) return setError("Podaj imię.");
    if (!rows.length) return setError("Dodaj plan CSV.");
    if (frequencyKind === "custom" && !customDays.length) {
      return setError("Wybierz dni czytania.");
    }

    const frequency: Frequency = {
      kind: frequencyKind,
      days:
        frequencyKind === "daily"
          ? [0, 1, 2, 3, 4, 5, 6]
          : frequencyKind === "weekdays"
            ? [1, 2, 3, 4, 5]
            : customDays,
    };

    setBusy(true);
    setError("");
    try {
      const result = await createGroup({
        name: groupName.trim(),
        ownerName: cleanPersonName(ownerName),
        startDate,
        frequency,
        planDays: buildSchedule(rows, startDate, frequency),
      });
      onCreated(result.group, result.credentials);
    } catch {
      setError("Nie udało się utworzyć planu.");
    } finally {
      setBusy(false);
    }
  }

  if (view === "recover") {
    return <RecoverAccessSetup onBack={() => setView("choices")}
      onAdminCode={() => setView("admin")}
      onTransfer={() => setView("transfer")} theme={theme} onThemeChange={onThemeChange} />;
  }
  if (view === "transfer" || view === "admin") {
    return (
      <TransferSetup
        purpose={view === "admin" ? "recovery" : "pairing"}
        onRecovered={onRecovered}
        onBack={() => setView("choices")}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    );
  }

  if (view === "join") {
    return (
      <JoinEntrySetup
        onJoinInvite={onJoinInvite}
        onBack={() => setView("choices")}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    );
  }

  if (view === "choices") {
    return (
      <LandingPage
        error={error}
        onChoose={setView}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    );
  }

  return (
    <main className="setup-page">
      <div className="setup-box">
        <div className="setup-top">
          <Brand />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <h1>Utwórz plan</h1>
        <button
          type="button"
          className="link-button setup-back-link"
          onClick={() => setView("choices")}
        >
          Wróć do wyboru
        </button>
        <form onSubmit={submit}>
          {error && <div className="simple-alert">{error}</div>}
          <div className="form-row">
            <Field label="Nazwa grupy">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                required
              />
            </Field>
            <Field label="Twoje imię">
              <input
                type="text"
                name="ownerName"
                autoComplete="name"
                maxLength={80}
                placeholder="np. Marek Kowalski"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Plan czytania">
            <label className="simple-upload">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  readFile(event.target.files?.[0])
                }
              />
              <span>{rows.length ? fileName : "Wybierz plik z planem"}</span>
              {rows.length > 0 && <b>{rows.length} dni</b>}
            </label>
            <p className="field-help">
              Wybierz plik z planem czytania. Może to być plik CSV, czyli
              zwykła tabela zapisana np. z Excela lub Arkuszy Google.
            </p>
            {!rows.length && (
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setCsvText(BASIC_PLAN_CSV);
                  setFrequencyKind("daily");
                  setFileName("Plan podstawowy · M’Cheyne · 365 dni");
                }}
              >
                Użyj planu podstawowego · 365 dni
              </button>
            )}
            <p className="field-help">
              Plan podstawowy M’Cheyne’a: 4 fragmenty dziennie przez 365 dni.
              Stary Testament raz, Nowy Testament i Psalmy dwa razy.
              Możesz zacząć w dowolnym dniu. Przy czytaniu codziennym trwa rok;
              przy rzadszym harmonogramie potrwa dłużej.{" "}
              <a href="https://www.mcheyne.app/" target="_blank" rel="noreferrer">O planie</a>
            </p>
          </Field>
          <section className="csv-ai-help">
            <div className="csv-ai-help-header">
              <div>
                <strong>Nie masz jeszcze planu?</strong>
                <p>Poproś AI o przygotowanie tabeli do wgrania do aplikacji.</p>
              </div>
            </div>
            <details>
              <summary>Zobacz przykładowy prompt</summary>
              <div className="csv-prompt-box">
                <pre>{`Przygotuj dla mnie plan czytania Biblii w formacie CSV.

Chcę czytać:
- [np. całą Biblię w rok / Ewangelię Jana w 30 dni]
- [np. 5 dni w tygodniu]
- po kilka fragmentów dziennie

Użyj dokładnie tych kolumn:
Dzień;Stary Testament;Nowy Testament;Psalm

Zasady:
- jeden wiersz = jeden dzień czytania,
- wpisuj konkretne fragmenty, np. Rdz 1–3, Mt 1, Ps 1,
- nie dodawaj pustych wierszy,
- używaj średnika (;) jako separatora,
- odpowiedź zwróć wyłącznie jako CSV, bez komentarza, bez nagłówka Markdown i bez bloku kodu.`}</pre>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    void copyText(
                      `Przygotuj dla mnie plan czytania Biblii w formacie CSV.

Chcę czytać:
- [np. całą Biblię w rok / Ewangelię Jana w 30 dni]
- [np. 5 dni w tygodniu]
- po kilka fragmentów dziennie

Użyj dokładnie tych kolumn:
Dzień;Stary Testament;Nowy Testament;Psalm

Zasady:
- jeden wiersz = jeden dzień czytania,
- wpisuj konkretne fragmenty, np. Rdz 1–3, Mt 1, Ps 1,
- nie dodawaj pustych wierszy,
- używaj średnika (;) jako separatora,
- odpowiedź zwróć wyłącznie jako CSV, bez komentarza, bez nagłówka Markdown i bez bloku kodu.`,
                    )
                  }
                >
                  Kopiuj prompt
                </button>
              </div>
            </details>
          </section>

          <div className="form-row">
            <Field label="Start">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field label="Częstotliwość">
              <div className="simple-segmented">
                {[
                  ["daily", "Codziennie"],
                  ["weekdays", "Pon.–pt."],
                  ["custom", "Własna"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={frequencyKind === value ? "active" : ""}
                    onClick={() => setFrequencyKind(value as FrequencyKind)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {frequencyKind === "custom" && (
            <div className="simple-days">
              {["N", "Pn", "Wt", "Śr", "Cz", "Pt", "So"].map((label, day) => (
                <button
                  type="button"
                  key={label}
                  className={customDays.includes(day) ? "active" : ""}
                  onClick={() =>
                    setCustomDays((current) =>
                      current.includes(day)
                        ? current.filter((item) => item !== day)
                        : [...current, day],
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button className="main-button" disabled={busy}>
            {busy ? "Tworzenie…" : "Utwórz plan"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Dashboard({
  credentials,
  group,
  setGroup,
  onCredentialsChange,
  theme,
  onThemeChange,
  refreshing,
  syncMessage,
  onRefresh,
  onLeave,
}: {
  credentials: Credentials;
  group: Group;
  setGroup: (group: Group) => void;
  onCredentialsChange: (credentials: Credentials) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  refreshing: boolean;
  syncMessage: string;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [today, setToday] = useState(todayIso);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [visibleGroup, setVisibleGroup] = useState(group);
  const [progressError, setProgressError] = useState("");
  const [progressQueue] = useState(() => createOptimisticProgressQueue({
    group,
    memberId: credentials.memberId,
    save: (segmentId, completed) => updateProgress(credentials, segmentId, completed),
    onChange: setVisibleGroup,
    onSave: setGroup,
    onError: () => setProgressError("Nie udało się zapisać zmiany. Spróbuj ponownie."),
  }));
  const renderedRevision = progressQueue.revision;

  useEffect(() => {
    progressQueue.setActive(true);
    return () => progressQueue.setActive(false);
  }, [progressQueue]);

  useEffect(() => {
    progressQueue.replaceGroup(group, renderedRevision);
  }, [group, progressQueue]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function scheduleMidnight() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(() => {
        setToday(todayIso());
        scheduleMidnight();
      }, midnight.getTime() - now.getTime() + 50);
    }
    scheduleMidnight();
    const refreshDate = () => setToday(todayIso());
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);
  const [busyMember, setBusyMember] = useState("");

  useEffect(() => {
    if (tab !== "group") return;
    let cancelled = false;
    const requestRevision = progressQueue.revision;
    getGroup(credentials.groupId)
      .then((groupData) => {
        if (cancelled) return;
        const hasAccess = groupData.members.some(
          (person) => person.id === credentials.memberId,
        );
        if (!hasAccess) {
          onLeave();
          return;
        }
        setGroup(progressQueue.replaceGroup(groupData, requestRevision));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [credentials.groupId, credentials.memberId, progressQueue, setGroup, tab]);

  const member = visibleGroup.members.find((item) => item.id === credentials.memberId);
  if (!member) return null;
  function toggle(segmentId: string, completed?: boolean) {
    setProgressError("");
    return progressQueue.toggle(segmentId, completed);
  }

  async function remove(person: Member) {
    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć ${person.name} z grupy?`,
    );
    if (!confirmed) return;
    setBusyMember(person.id);
    const requestRevision = progressQueue.revision;
    try {
      const nextGroup = await removeMember(credentials, person.id);
      setGroup(progressQueue.replaceGroup(nextGroup, requestRevision));
    } catch {
      window.alert("Nie udało się usunąć osoby.");
    } finally {
      setBusyMember("");
    }
  }

  async function changeRole(memberId: string, isAdmin: boolean) {
    const requestRevision = progressQueue.revision;
    const nextGroup = await updateMemberRole(credentials, memberId, isAdmin);
    setGroup(progressQueue.replaceGroup(nextGroup, requestRevision));
  }

  const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: "today", label: "Czytaj", icon: "book" },
    { id: "plan", label: "Plan", icon: "plan" },
    { id: "group", label: "Grupa", icon: "group" },
    { id: "settings", label: "Ustawienia", icon: "settings" },
  ];

  return (
    <div className="simple-app">
      <header className="simple-header">
        <Brand />
        <nav className="desktop-tabs">
          {tabs.map((item) => (
            <TabButton key={item.id} item={item} active={tab} setTab={setTab} />
          ))}
        </nav>
        <div className="header-tools">
          <button
            type="button"
            className="refresh-button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Odśwież plan i dane użytkownika"
            title="Odśwież plan i dane użytkownika"
          >
            <Icon name="refresh" size={17} />
            <span>{refreshing ? "Odświeżanie…" : "Odśwież"}</span>
          </button>
          <ThemeToggle theme={theme} onChange={onThemeChange} />
          <span className="simple-avatar" style={{ background: member.color }}>
            {initials(member.name)}
          </span>
        </div>
      </header>

      <main className={`simple-content ${tab === "today" ? "reading-home-content" : ""}`}>
        {syncMessage && <div className="sync-status" role="status" aria-label="Stan połączenia">{syncMessage}</div>}
        {progressError && <p className="progress-error" role="alert">{progressError}</p>}
        <div hidden={tab !== "today"}>
          <TodayView
            key={`${group.id}:${member.id}:${today}`}
            group={visibleGroup}
            member={member}
            onToggle={toggle}
            onError={setProgressError}
            onWaitForSegments={progressQueue.waitForSegments}
          />
        </div>
        {tab === "plan" && (
          <PlanView group={visibleGroup} member={member} />
        )}
        {tab === "group" && (
          <GroupView
            credentials={credentials}
            group={visibleGroup}
            member={member}
            onInvite={() => setInviteOpen(true)}
            onRemove={remove}
            onRoleChange={changeRole}
            busyMember={busyMember}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            credentials={credentials}
            group={visibleGroup}
            member={member}
            onLeave={onLeave}
          />
        )}
      </main>

      <nav className="mobile-tabs">
        {tabs.map((item) => (
          <TabButton key={item.id} item={item} active={tab} setTab={setTab} />
        ))}
      </nav>

      {inviteOpen && (
        <InviteModal
          credentials={credentials}
          onClose={() => setInviteOpen(false)}
          onCredentialsChange={onCredentialsChange}
        />
      )}
    </div>
  );
}

function TodayView({
  group,
  member,
  onToggle,
  onError,
  onWaitForSegments,
}: {
  group: Group;
  member: Member;
  onToggle: (segmentId: string, completed?: boolean) => Promise<void>;
  onError: (message: string) => void;
  onWaitForSegments: (segmentIds: string[]) => Promise<void>;
}) {
  const today = todayIso();
  const home = getReadingHomeSummary(group, member.id, today);
  const week = getReadingWeekSummary(group, member.id, today);
  const normalPortionKey = `reading-home:${group.id}:${member.id}:${today}`;
  const [dailyDayId] = useState(() => getDailyReadingDay(
    group, member.id, today, localStorage.getItem(normalPortionKey) ?? "",
  )?.id ?? "");
  const progress = group.progress[member.id] ?? {};
  const initialIndex = dailyDayId
    ? group.planDays.findIndex((day) => day.id === dailyDayId)
    : Math.max(0, group.planDays.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, initialIndex));
  const selectedDay = group.planDays[selectedIndex];
  const [browsedRecoveryDayId, setBrowsedRecoveryDayId] = useState<string | null>(null);
  const recoveryKey = `reading-recovery:${group.id}:${member.id}`;
  const [recoveryStart, setRecoveryStart] = useState<string>(() => localStorage.getItem(recoveryKey) ?? "");
  useEffect(() => {
    if (dailyDayId && !recoveryStart) localStorage.setItem(normalPortionKey, dailyDayId);
  }, [dailyDayId, normalPortionKey, recoveryStart]);
  const chapterKey = `${recoveryKey}:chapters`;
  const dailyKey = `${recoveryKey}:ordered:${today}`;
  const [recoveryDayAnchor, setRecoveryDayAnchor] = useState(() =>
    recoveryStart ? localStorage.getItem(`${dailyKey}:day`) ?? "" : "",
  );
  const originalRecoveryDay = getRecoveryDay(group, member.id, recoveryDayAnchor);
  const recoveryDayId = originalRecoveryDay?.id ?? "";
  useEffect(() => {
    if (!recoveryStart || !recoveryDayId) return;
    localStorage.setItem(`${dailyKey}:day`, recoveryDayId);
    if (recoveryDayAnchor !== recoveryDayId) setRecoveryDayAnchor(recoveryDayId);
  }, [dailyKey, recoveryStart, recoveryDayId, recoveryDayAnchor]);
  const [readChapters, setReadChapters] = useState<Record<string, number>>(() =>
    parseReadChapters(localStorage.getItem(chapterKey)),
  );
  const markKey = `${recoveryKey}:chapter-marks`;
  const [chapterMarks, setChapterMarks] = useState<ReadChapterMarks>(() =>
    parseChapterMarks(localStorage.getItem(markKey)),
  );
  const chapterState = useRef({ chapters: readChapters, marks: chapterMarks });
  const chapterOperations = useRef<Record<string, {
    baseline: { chapters: Record<string, number>; marks: ReadChapterMarks };
    pending: Array<{ indices: number[]; completed: boolean; status: "pending" | "saved" | "failed" }>;
  }>>({});
  function writeChapters(chapters: Record<string, number>, marks: ReadChapterMarks) {
    chapterState.current = { chapters, marks };
    setReadChapters(chapters);
    setChapterMarks(marks);
    localStorage.setItem(chapterKey, JSON.stringify(chapters));
    localStorage.setItem(markKey, JSON.stringify(marks));
  }
  const [dailyReading, setDailyReading] = useState<{ reading: RecoveryReading; completed: boolean } | null>(() => {
    try { return JSON.parse(localStorage.getItem(dailyKey) ?? "null"); } catch { return null; }
  });
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const activeView = useRef(true);
  useEffect(() => {
    activeView.current = true;
    const leave = () => { activeView.current = false; };
    const resume = () => { activeView.current = true; };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    return () => {
      leave();
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", resume);
    };
  }, []);
  const portionKey = `${dailyKey}:portion-v2`;
  const [dailyPortion, setDailyPortion] = useState<RecoveryPortion | undefined>(() =>
    parseRecoveryPortion(group, member.id, today, readChapters, chapterMarks, localStorage.getItem(portionKey)),
  );
  const legacyDailyReading = validateDailyRecoveryReading(
    group, member.id, today, readChapters, recoveryDayId, dailyReading,
  );
  const currentPortion = useMemo(() =>
    projectRecoveryPortions(group, member.id, today, readChapters, recoveryDayId,
      legacyDailyReading?.reading, chapterMarks, dailyPortion)[0],
    [recoveryStart, recoveryDayId, today, dailyPortion],
  );
  useEffect(() => {
    if (!recoveryStart || !currentPortion || dailyPortion) return;
    localStorage.setItem(portionKey, JSON.stringify(currentPortion));
    setDailyPortion(currentPortion);
  }, [recoveryStart, currentPortion, dailyPortion, portionKey]);
  const extra = currentPortion?.extra;
  const validDailyReading = dailyReading?.reading?.segmentId === extra?.segmentId &&
    dailyReading?.reading?.chapterIndex === extra?.chapterIndex ? dailyReading : null;
  // Freeze today's assignments while checking them; projections consume the
  // full daily quota in each stream and keep future checkbox rows stable.
  const recoveryPortions = useMemo(() =>
    projectRecoveryPortions(group, member.id, today, readChapters, recoveryDayId,
      extra, chapterMarks, currentPortion),
    [recoveryStart, currentPortion],
  );
  const anchorIndex = group.planDays.findIndex(day => day.id === recoveryDayId);
  const navigationDays = recoveryStart && recoveryPortions.length
    ? [...group.planDays.slice(0, Math.max(0, anchorIndex)), ...recoveryPortions.map(portion => portion.day)]
    : group.planDays;
  const browsedPortion = recoveryPortions.find(portion => portion.day.id === browsedRecoveryDayId);
  const historicalDay = group.planDays.slice(0, Math.max(0, anchorIndex))
    .find(day => day.id === browsedRecoveryDayId)
    ?? (!recoveryPortions.length ? group.planDays.find(day => day.id === browsedRecoveryDayId) : undefined);
  const displayedDay = recoveryStart
    ? (browsedPortion?.day ?? historicalDay ?? currentPortion?.day)
    : selectedDay;
  const isRecoveryPortion = Boolean(recoveryStart && displayedDay && displayedDay.id === currentPortion?.day.id);
  const isForecast = Boolean(recoveryStart && browsedPortion && !isRecoveryPortion);
  const displayedIndex = recoveryStart
    ? (displayedDay ? Math.max(0, navigationDays.findIndex(day => day.id === displayedDay.id)) : initialIndex)
    : selectedIndex;
  function selectDay(index: number) {
    if (!recoveryStart) { setSelectedIndex(index); return; }
    const day = navigationDays[index];
    if (day) setBrowsedRecoveryDayId(day.id === currentPortion?.day.id ? null : day.id);
  }
  const displayedProgress = { ...progress };
  const selectedPortion = isRecoveryPortion ? currentPortion : isForecast ? browsedPortion : undefined;
  if (selectedPortion) {
    for (const segment of selectedPortion.day.segments) {
      const indices = selectedPortion.chapterIndices[segment.id];
      if (progress[segment.id] || indices.every(index => isRecoveryChapterRead(readChapters, chapterMarks, segment.id, index))) {
        displayedProgress[segment.id] = progress[segment.id] || "local";
      } else delete displayedProgress[segment.id];
    }
  }
  const displayedExtra = isRecoveryPortion ? extra : isForecast ? browsedPortion?.extra : undefined;
  const extraComplete = Boolean(displayedExtra && (
    progress[displayedExtra.segmentId] ||
    isRecoveryChapterRead(readChapters, chapterMarks, displayedExtra.segmentId, displayedExtra.chapterIndex) ||
    (isRecoveryPortion && validDailyReading?.completed)
  ));
  const baseComplete = Boolean(displayedDay && displayedDay.segments.every(segment => displayedProgress[segment.id]));
  async function toggleChapterSelection(
    segmentId: string, indices: number[], completed: boolean, dailyExtra = false,
  ) {
    const previous = chapterState.current;
    const previousReading = dailyReading;
    const previousDailyStorage = localStorage.getItem(dailyKey);
    const original = group.planDays.flatMap(day => day.segments).find(segment => segment.id === segmentId);
    if (!original) return;
    const count = splitReadingChapters(original.label).length;
    let queue = chapterOperations.current[segmentId];
    if (!queue?.pending.length) {
      queue = {
        baseline: {
          chapters: { [segmentId]: progress[segmentId] ? count : previous.chapters[segmentId] ?? 0 },
          marks: { [segmentId]: previous.marks[segmentId] ?? [] },
        },
        pending: [],
      };
      chapterOperations.current[segmentId] = queue;
    }
    const operation: typeof queue.pending[number] = { indices, completed, status: "pending" };
    queue.pending.push(operation);
    function localSnapshot() {
      let snapshot = queue.baseline;
      for (const intent of queue.pending) {
        if (intent.status !== "failed") {
          snapshot = setRecoveryChapters(snapshot.chapters, snapshot.marks, segmentId, intent.indices, intent.completed);
        }
      }
      return snapshot;
    }
    function publishSnapshot() {
      const snapshot = localSnapshot();
      const current = chapterState.current;
      writeChapters(
        { ...current.chapters, [segmentId]: snapshot.chapters[segmentId] },
        { ...current.marks, [segmentId]: snapshot.marks[segmentId] },
      );
    }
    function settle(status: "saved" | "failed") {
      operation.status = status;
      while (queue.pending.length && queue.pending[0].status !== "pending") {
        const first = queue.pending.shift()!;
        if (first.status === "saved") {
          queue.baseline = setRecoveryChapters(queue.baseline.chapters, queue.baseline.marks, segmentId, first.indices, first.completed);
        }
      }
      if (activeView.current) publishSnapshot();
    }
    const segmentCompleted = localSnapshot().chapters[segmentId] >= count;
    onError("");
    try {
      publishSnapshot();
      if (dailyExtra && extra) {
        const reading = { reading: extra, completed };
        setDailyReading(reading);
        localStorage.setItem(dailyKey, JSON.stringify(reading));
      }
      if (displayedExtra?.segmentId === segmentId && completed && displayedDay) {
        await onWaitForSegments(displayedDay.segments.filter(segment => progress[segment.id]).map(segment => segment.id));
      }
      if (!completed || Boolean(progress[segmentId]) !== segmentCompleted) await onToggle(segmentId, segmentCompleted);
      settle("saved");
    } catch {
      try { settle("failed"); } catch { /* Visible state is restored even if storage fails. */ }
      if (!activeView.current) return;
      if (dailyExtra) {
        setDailyReading(previousReading);
        try {
          if (previousDailyStorage === null) localStorage.removeItem(dailyKey);
          else localStorage.setItem(dailyKey, previousDailyStorage);
        } catch { /* State still rolls back. */ }
      }
      onError("Nie udało się zapisać zmiany. Spróbuj ponownie.");
    }
  }
  async function toggleExtra() {
    if (!displayedExtra || recoveryBusy || (!extraComplete && !baseComplete)) return;
    setRecoveryBusy(true);
    try {
      await toggleChapterSelection(displayedExtra.segmentId, [displayedExtra.chapterIndex], !extraComplete, isRecoveryPortion);
    } finally { if (activeView.current) setRecoveryBusy(false); }
  }
  async function toggleDisplayedSegment(segmentId: string) {
    if (!recoveryStart || (!isRecoveryPortion && !isForecast)) return onToggle(segmentId);
    const original = group.planDays.flatMap(day => day.segments).find(segment => segment.id === segmentId);
    if (!original) return;
    const allIndices = splitReadingChapters(original.label).map((_, index) => index);
    const indices = selectedPortion?.chapterIndices[segmentId] ?? allIndices;
    await toggleChapterSelection(segmentId, indices.length ? indices : allIndices, !Boolean(displayedProgress[segmentId]));
  }
  function changeRecovery(start: string) {
    if (start) {
      // Activation uses the latest progress, even if this view was opened earlier.
      setBrowsedRecoveryDayId(null);
      setDailyPortion(undefined);
      localStorage.removeItem(portionKey);
      setRecoveryDayAnchor(getNextDay(group, member.id)?.id ?? "");
      localStorage.setItem(recoveryKey, start);
    } else {
      setSelectedIndex(Math.max(0, group.planDays.findIndex(day => day.segments.some(segment => segment.id === displayedDay?.segments[0]?.id))));
      setBrowsedRecoveryDayId(null);
      localStorage.removeItem(recoveryKey);
    }
    setRecoveryStart(start);
  }
  const showRecoveryControl = week.overdueReadings > 2 || Boolean(recoveryStart);
  const previewPortions = recoveryStart ? recoveryPortions : showRecoveryControl
    ? projectRecoveryPortions(group, member.id, today, readChapters, getNextDay(group, member.id)?.id ?? "", undefined, chapterMarks)
    : [];
  const showReading = Boolean(displayedDay);
  const portionCompleted = baseComplete && (!displayedExtra || extraComplete);
  const completedCount = displayedDay?.segments.filter(segment => displayedProgress[segment.id]).length ?? 0;
  const portionTotal = (displayedDay?.segments.length ?? 0) + (displayedExtra ? 1 : 0);
  const portionDone = completedCount + (extraComplete ? 1 : 0);
  const nextUnread = group.planDays.findIndex(day => day.segments.some(segment => !progress[segment.id]));
  const returnIndex = recoveryStart
    ? navigationDays.findIndex(day => day.id === currentPortion?.day.id)
    : nextUnread;
  const showReturn = returnIndex >= 0 && displayedIndex !== returnIndex;

  return (
    <div className="reading-home">
      <PageTitle title={group.name} />
      <p className="reading-balance" data-testid="reading-balance" aria-live="polite">
        {week.overdueReadings > 0 && <span data-testid="overdue-readings">{formatReadingCount(-week.overdueReadings)}</span>}
        {week.overdueReadings > 0 && week.aheadReadings > 0 && " · "}
        {week.aheadReadings > 0 && <span data-testid="ahead-readings">{formatReadingCount(week.aheadReadings)}</span>}
        {!week.overdueReadings && !week.aheadReadings && "Na bieżąco"}
      </p>
      {home.planComplete ? (
        <section className="reading-state is-finished" role="status">
          <Icon name="check" size={28} />
          <div><h2>Plan ukończony</h2></div>
        </section>
      ) : home.notStarted ? (
        <section className="reading-state" role="status">
          <Icon name="book" size={28} />
          <div>
            <h2>Plan jeszcze się nie rozpoczął</h2>
            <p>Wspólne czytanie zaczyna się {formatPolishDate(group.startDate, "shortYear")}.</p>
          </div>
        </section>
      ) : null}
      {showReading && displayedDay && (
        <section className="reading-focus" aria-label="Wybrane czytanie">
          <DayCard
            day={displayedDay}
            progress={displayedProgress}
            onToggle={toggleDisplayedSegment}
            extraReading={displayedExtra ? {
              reading: displayedExtra,
              completed: extraComplete,
              disabled: recoveryBusy || (!baseComplete && !extraComplete),
              onToggle: toggleExtra,
            } : undefined}
          />
          <div className="reading-footer" aria-live="polite">
            {portionCompleted ? <span className="reading-finished"><Icon name="check" size={16} />Przeczytane</span>
              : <span aria-label="Postęp wybranego czytania">{portionDone} z {portionTotal} {portionTotal === 1 ? "fragmentu" : "fragmentów"}</span>}
          </div>
        </section>
      )}
      {group.planDays.length > 0 && (
        <nav className="reading-navigation" aria-label="Przeglądaj czytania" data-selected-index={displayedIndex} data-reading-count={navigationDays.length}>
          <button type="button" disabled={displayedIndex === 0} onClick={() => selectDay(displayedIndex - 1)}>
            <Icon name="left" size={18} />Poprzednie
          </button>
          {showReturn && <button type="button" className="reading-return" aria-label="Wróć do swojego miejsca"
            title="Wróć do swojego miejsca" onClick={() => selectDay(returnIndex)}>
            <Icon name={returnIndex < displayedIndex ? "double-left" : "double-right"} size={20} />
          </button>}
          <button type="button" disabled={displayedIndex >= navigationDays.length - 1} onClick={() => selectDay(displayedIndex + 1)}>
            Następne<Icon name="right" size={18} />
          </button>
        </nav>
      )}
      <section className="reading-week" aria-label="Postęp tygodnia">
        <div><span>{week.weeklyTotal > 0 && week.weeklyCompleted === week.weeklyTotal ? "Tydzień ukończony" : "W tym tygodniu"}</span>
          <strong data-testid="weekly-readings">{week.weeklyCompleted} z {week.weeklyTotal} czytań</strong></div>
        {week.weeklyTotal > 0 && <div className="reading-week-track" role="progressbar" aria-label="Ukończone czytania w tym tygodniu"
          aria-valuenow={week.weeklyCompleted} aria-valuemin={0} aria-valuemax={week.weeklyTotal}>
          {Array.from({ length: week.weeklyTotal }, (_, index) => <span key={index} className={index < week.weeklyCompleted ? "done" : ""} />)}
        </div>}
      </section>
      {showRecoveryControl && !home.planComplete && (
        <section className="recovery-control" aria-label="Plan nadrabiania">
          <div className="recovery-intro">
            <div><h2>Nadrabianie</h2></div>
            <button type="button" className={recoveryStart ? "link-button" : "small-button"}
              onClick={() => changeRecovery(recoveryStart ? "" : today)}>
              {recoveryStart ? "Wyłącz plan nadrabiania" : "Włącz plan nadrabiania"}
            </button>
          </div>
          <details className="recovery-details">
            <summary>Przykładowy dzień</summary>
            <p>Zwykłe czytanie + jeden dodatkowy rozdział.</p>
            <ul className="recovery-preview">
              {previewPortions.slice(0, 1).map(portion => <li key={portion.day.id}>
                <strong>{formatPolishDate(portion.day.date)}</strong>
                <span>{portion.day.segments.map(segment => segment.label).join(" · ")}</span>
                <small>{portion.extra ? `+ ${portion.extra.label}` : "Bez dodatkowego rozdziału"}</small>
              </li>)}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function PlanView({
  group,
  member,
}: {
  group: Group;
  member: Member;
}) {
  const progress = group.progress[member.id] ?? {};
  const total = group.planDays.flatMap((day) => day.segments).length;
  const completed = Object.keys(progress).length;
  const percent = calculateProgressPercent(completed, total);
  const startDate = group.planDays[0]?.date ?? group.startDate;
  const endDate = group.planDays.at(-1)?.date ?? group.startDate;
  return (
    <>
      <PageTitle title="Plan" meta={`${group.planDays.length} dni · plan grupy`} />
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
  const admins = group.members.filter((person) => person.isAdmin);
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
      <aside className="group-access-help">
        <strong>{member.isAdmin ? "Grupa pomaga odzyskać dostęp" : "Potrzebujesz odzyskać dostęp?"}</strong>
        <p>{member.isAdmin
          ? "Wybierz Zarządzaj przy właściwej osobie, aby przywrócić jej profil jednorazowym linkiem lub QR."
          : `Poproś administratora (${admins.map((person) => person.name).join(", ")}) o jednorazowy link. Otworzy Twój profil z dotychczasowym postępem.`}</p>
        {member.isAdmin && admins.length === 1 && <p>Jesteś jedynym administratorem. Nadaj tę rolę zaufanej osobie, aby mogła pomóc również Tobie.</p>}
      </aside>
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
}: {
  credentials: Credentials;
  group: Group;
  member: Member;
  onLeave: () => void;
}) {
  const startDate = group.planDays[0]?.date ?? group.startDate;
  const endDate = group.planDays.at(-1)?.date ?? group.startDate;
  const frequency = formatFrequency(group.frequency);
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
      </section>
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

function DayCard({
  day,
  progress,
  onToggle,
  extraReading,
}: {
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
      <div className="simple-readings">
        {day.segments.map((segment) => (
          <ReadingRow
            key={segment.id}
            label={segment.label}
            section={segment.section}
            completed={Boolean(progress[segment.id])}
            disabled={false}
            onToggle={() => onToggle(segment.id)}
          />
        ))}
        {extraReading && (
          <ReadingRow
            label={extraReading.reading.label}
            section="Nadrabianie"
            completed={extraReading.completed}
            disabled={extraReading.disabled}
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
}: {
  label: string;
  section: string;
  completed: boolean;
  disabled: boolean;
  onToggle: () => Promise<void>;
  isExtra?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${completed ? "checked" : ""} ${isExtra ? "reading-extra" : ""}`}
      disabled={disabled}
      onClick={() => { void onToggle().catch(() => undefined); }}
      aria-pressed={completed}
      title={isExtra && disabled && !completed
        ? "Najpierw dokończ fragmenty powyżej."
        : undefined}
    >
      <span className="simple-checkbox">
        {completed && <Icon name="check" size={16} />}
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

