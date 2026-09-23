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
} from "./lib/api";
import { parsePlanCsv, SAMPLE_CSV } from "./lib/csv";
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
import QrScanner from "qr-scanner";
import {
  calculateProgressPercent,
  formatProgressPercent,
  getMemberMetrics,
  getNextDay,
  getPaceTone,
} from "./lib/metrics";
import { cleanPersonName } from "./lib/name";
import { buildSchedule, formatPolishDate, todayIso } from "./lib/schedule";
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
  | "install"
  | "share";

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
  const [credentials, setCredentials] = useState<Credentials | null>(() =>
    loadCredentials(),
  );
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const skipSessionRestore = useRef(false);

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
      restoreSession()
        .then((session) => {
          if (cancelled || !session) return;
          saveCredentials(session.credentials);
          setCredentials(session.credentials);
          setGroup(session.group);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Nie udało się sprawdzić zapisanej sesji.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
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
    setLoading(true);
    setError("");
    saveSession(credentials)
      .then((session) => {
        if (cancelled) return;
        saveCredentials(session.credentials);
        setCredentials(session.credentials);
        setGroup(session.group);
        if (joinInvite) {
          setJoinInvite(null);
          if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(sessionError(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
  ]);

  function enter(groupData: Group, nextCredentials: Credentials) {
    saveCredentials(nextCredentials);
    setCredentials(nextCredentials);
    setGroup(groupData);
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

  if (joinInvite && !canResumeInvite) {
    content = (
      <JoinSetup
        invite={joinInvite}
        onJoined={enter}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  } else if (transferCode && !credentials) {
    content = (
      <TransferSetup
        initialCode={transferCode}
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
        credentials={credentials}
        group={group}
        setGroup={setGroup}
        onCredentialsChange={changeCredentials}
        theme={theme}
        onThemeChange={setTheme}
        onLeave={async () => {
          skipSessionRestore.current = true;
          await clearSession().catch(() => undefined);
          clearCredentials();
          setCredentials(null);
          setGroup(null);
        }}
      />
    );
  } else if (credentials) {
    content = (
      <SessionRecovery
        error={error}
        onRetry={() => setRetry((current) => current + 1)}
        onReset={() => {
          clearCredentials();
          setCredentials(null);
          setGroup(null);
          setError("");
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
  onRetry,
  onReset,
  theme,
  onThemeChange,
}: {
  error: string;
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

function JoinSetup({
  invite,
  onJoined,
  theme,
  onThemeChange,
}: {
  invite: JoinInvite;
  onJoined: (group: Group, credentials: Credentials) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = cleanPersonName(name);
    if (!cleanName) return;
    setBusy(true);
    setError("");
    try {
      const result = await joinGroup(invite, cleanName);
      onJoined(result.group, result.credentials);
    } catch {
      setError("Nie udało się dołączyć do planu.");
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
          <button
            className="main-button"
            disabled={busy || !cleanPersonName(name)}
          >
            {busy ? "Dołączanie…" : "Dołącz"}
          </button>
        </form>
      </div>
    </main>
  );
}

function TransferSetup({
  initialCode = "",
  onRecovered,
  onBack,
  theme,
  onThemeChange,
}: {
  initialCode?: string;
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
      const normalizedCode = nextCode.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (normalizedCode.length !== 8) return;
      setCode(normalizedCode);
      setBusy(true);
      setError("");
      try {
        const result = await redeemSessionTransfer(normalizedCode);
        onRecovered(result.group, result.credentials);
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.status === 410
            ? "Kod wygasł. Utwórz nowy kod na urządzeniu, na którym działa plan."
            : "Kod jest nieprawidłowy lub został już wykorzystany.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onRecovered],
  );

  useEffect(() => {
    if (!initialCode || submittedCode.current === initialCode) return;
    submittedCode.current = initialCode;
    void redeem(initialCode);
  }, [initialCode, redeem]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void redeem(code);
  }

  const handleScan = useCallback(
    (value: string) => {
      const scannedCode = parseSessionTransfer(value);
      if (!scannedCode) {
        setError("Ten kod QR nie zawiera kodu przeniesienia sesji.");
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
        <h1>Przenieś sesję</h1>
        <p className="setup-description">
          Zeskanuj kod QR wyświetlony na urządzeniu, na którym działa Twój
          plan. Otwórz aparat albo wklej kod ręcznie.
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
          <Field label="Kod przeniesienia">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              maxLength={9}
              placeholder="ABCD-EFGH"
              autoFocus={!initialCode}
              required
            />
          </Field>
          <button className="main-button" disabled={busy || code.replace(/[^A-Z0-9]/gi, "").length < 8}>
            {busy ? "Przenoszenie…" : "Przenieś plan"}
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

  function submit(event: FormEvent) {
    event.preventDefault();
    const invite = parseJoinLink(link.trim());
    if (!invite) {
      setError("Wklej prawidłowy link zaproszenia do planu.");
      return;
    }
    onJoinInvite(invite);
  }

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
        <form onSubmit={submit}>
          {error && <div className="simple-alert">{error}</div>}
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
  onChoose: (choice: "transfer" | "create" | "join") => void;
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
            Mam już plan na innym urządzeniu → przenieś sesję
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
    "choices" | "create" | "transfer" | "join"
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

  if (view === "transfer") {
    return (
      <TransferSetup
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
                  setCsvText(SAMPLE_CSV);
                  setFileName("plan-przykładowy.csv");
                }}
              >
                Nie masz pliku? Użyj przykładowego planu
              </button>
            )}
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
  onLeave,
}: {
  credentials: Credentials;
  group: Group;
  setGroup: (group: Group) => void;
  onCredentialsChange: (credentials: Credentials) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busySegment, setBusySegment] = useState("");
  const [busyMember, setBusyMember] = useState("");

  useEffect(() => {
    if (tab !== "group") return;
    getGroup(credentials.groupId)
      .then((groupData) => {
        const hasAccess = groupData.members.some(
          (person) => person.id === credentials.memberId,
        );
        if (!hasAccess) {
          onLeave();
          return;
        }
        setGroup(groupData);
      })
      .catch(() => undefined);
  }, [credentials.groupId, credentials.memberId, setGroup, tab]);

  const member = group.members.find((item) => item.id === credentials.memberId);
  if (!member) return null;
  const memberId = member.id;

  async function toggle(segmentId: string) {
    const current = group.progress[memberId] ?? {};
    const completed = !current[segmentId];
    setBusySegment(segmentId);
    try {
      setGroup(await updateProgress(credentials, segmentId, completed));
    } finally {
      setBusySegment("");
    }
  }

  async function remove(person: Member) {
    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć ${person.name} z grupy?`,
    );
    if (!confirmed) return;
    setBusyMember(person.id);
    try {
      setGroup(await removeMember(credentials, person.id));
    } catch {
      window.alert("Nie udało się usunąć osoby.");
    } finally {
      setBusyMember("");
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: "today", label: "Dzisiaj", icon: "today" },
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
          <ThemeToggle theme={theme} onChange={onThemeChange} />
          <span className="simple-avatar" style={{ background: member.color }}>
            {initials(member.name)}
          </span>
        </div>
      </header>

      <main className="simple-content">
        {tab === "today" && (
          <TodayView
            group={group}
            member={member}
            busySegment={busySegment}
            onToggle={toggle}
          />
        )}
        {tab === "plan" && (
          <PlanView group={group} member={member} />
        )}
        {tab === "group" && (
          <GroupView
            group={group}
            member={member}
            onInvite={() => setInviteOpen(true)}
            onRemove={remove}
            busyMember={busyMember}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            credentials={credentials}
            group={group}
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
  busySegment,
  onToggle,
}: {
  group: Group;
  member: Member;
  busySegment: string;
  onToggle: (segmentId: string) => void;
}) {
  const metrics = getMemberMetrics(group, member.id);
  const nextDay = getNextDay(group, member.id);
  const progress = group.progress[member.id] ?? {};
  const initialIndex = nextDay
    ? group.planDays.findIndex((day) => day.id === nextDay.id)
    : Math.max(0, group.planDays.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, initialIndex));
  const selectedDay = group.planDays[selectedIndex];

  return (
    <>
      <PageTitle title="Dzisiaj" meta={formatPolishDate(todayIso())} />
      <section className="visual-summary">
        <ProgressDonut percent={metrics.progressPercent} />
        <BacklogCard pace={metrics.paceDays} />
      </section>
      {selectedDay ? (
        <>
          <DayCard
            day={selectedDay}
            progress={progress}
            busySegment={busySegment}
            onToggle={onToggle}
          />
          <DaySwitcher
            days={group.planDays}
            progress={progress}
            selectedIndex={selectedIndex}
            onChange={setSelectedIndex}
          />
        </>
      ) : (
        <div className="empty-state">
          <Icon name="check" size={28} />
          <h2>Plan ukończony</h2>
        </div>
      )}
    </>
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
      <PageTitle title="Plan" meta={`${group.planDays.length} dni`} />
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
        <div className="wide-progress">
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
  group,
  member,
  onInvite,
  onRemove,
  busyMember,
}: {
  group: Group;
  member: Member;
  onInvite: () => void;
  onRemove: (member: Member) => void;
  busyMember: string;
}) {
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
              {member.isAdmin && person.id !== member.id && (
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

  async function prepareTransfer() {
    setTransferBusy(true);
    setTransferError("");
    setCopied(false);
    try {
      setTransfer(await createSessionTransfer(credentials));
    } catch {
      setTransferError("Nie udało się utworzyć kodu przeniesienia.");
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
      <h2 className="settings-heading">Przeniesienie sesji</h2>
      <section className="settings-card transfer-card">
        <p>
          Utwórz jednorazowy kod, a następnie zeskanuj go na drugim urządzeniu.
          Kod jest ważny przez 10 minut. Po wygaśnięciu możesz utworzyć nowy.
        </p>
        {transferError && <div className="simple-alert">{transferError}</div>}
        {transfer ? (
          <div className="transfer-result">
            <QrCode
              value={createSessionTransferLink(transfer.code)}
              label="Kod QR do przeniesienia sesji"
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
            {transferBusy ? "Tworzenie…" : "Utwórz kod przeniesienia"}
          </button>
        )}
      </section>
      <h2 className="settings-heading">Konto</h2>
      <section className="settings-card">
        <button className="logout-button" onClick={onLeave}>
          <Icon name="logout" size={18} /> Wyloguj
        </button>
      </section>
    </>
  );
}

function DayCard({
  day,
  progress,
  busySegment,
  onToggle,
}: {
  day: PlanDay;
  progress: Record<string, string>;
  busySegment: string;
  onToggle: (segmentId: string) => void;
}) {
  const completed = day.segments.filter((segment) => progress[segment.id]).length;
  const complete = completed === day.segments.length;
  return (
    <section className={`simple-day ${complete ? "is-complete" : ""}`}>
      <header>
        <strong>{formatPolishDate(day.date)}</strong>
        <b>
          {completed}/{day.segments.length}
        </b>
      </header>
      <div className="simple-readings">
        {day.segments.map((segment) => {
          const checked = Boolean(progress[segment.id]);
          return (
            <button
              key={segment.id}
              className={checked ? "checked" : ""}
              disabled={busySegment === segment.id}
              onClick={() => onToggle(segment.id)}
            >
              <span className="simple-checkbox">
                {checked && <Icon name="check" size={16} />}
              </span>
              <span>
                <small>{segment.section}</small>
                <strong>{segment.label}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
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
  document.execCommand("copy");
  input.remove();
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

function ProgressDonut({ percent }: { percent: number }) {
  return (
    <div className="viz-card donut-card">
      <div
        className="progress-donut"
        style={{ "--value": `${percent * 3.6}deg` } as React.CSSProperties}
      >
        <strong>{formatProgressPercent(percent)}%</strong>
      </div>
      <span>Postęp</span>
    </div>
  );
}

function BacklogCard({ pace }: { pace: number }) {
  const ahead = pace > 0;
  const behind = pace < 0;
  const value = Math.abs(pace);
  const tone = getPaceTone(pace);
  return (
    <div className={`viz-card backlog-card pace-${tone}`}>
      <span>{ahead ? "Do przodu" : behind ? "Zaległość" : "Na bieżąco"}</span>
      <strong>{ahead ? `+${value}` : value}</strong>
      <small>{value === 1 ? "dzień" : "dni"}</small>
    </div>
  );
}

function DaySwitcher({
  days,
  progress,
  selectedIndex,
  onChange,
}: {
  days: PlanDay[];
  progress: Record<string, string>;
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  const start = Math.max(0, Math.min(selectedIndex - 2, days.length - 5));
  const visible = days.slice(start, start + 5);
  return (
    <div className="day-switcher">
      <button
        aria-label="Poprzedni dzień"
        disabled={selectedIndex === 0}
        onClick={() => onChange(selectedIndex - 1)}
      >
        <Icon name="left" size={18} />
      </button>
      <div className="day-strip">
        {visible.map((day) => {
          const index = days.findIndex((candidate) => candidate.id === day.id);
          const complete = day.segments.every((segment) => progress[segment.id]);
          return (
            <button
              key={day.id}
              className={`${index === selectedIndex ? "active" : ""} ${
                complete ? "complete" : ""
              }`}
              onClick={() => onChange(index)}
            >
              <small>
                {new Intl.DateTimeFormat("pl-PL", { weekday: "short" })
                  .format(new Date(`${day.date}T12:00:00`))
                  .replace(".", "")}
              </small>
              <strong>{new Date(`${day.date}T12:00:00`).getDate()}</strong>
            </button>
          );
        })}
      </div>
      <button
        aria-label="Następny dzień"
        disabled={selectedIndex === days.length - 1}
        onClick={() => onChange(selectedIndex + 1)}
      >
        <Icon name="right" size={18} />
      </button>
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
