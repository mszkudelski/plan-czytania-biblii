import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Credentials, Group } from "./types";
import { continueVisit, hasCompletedReading, nextPrompt, parseVisit, profileKey, SETUP_KEY, VISIT_KEY, type PromptKind } from "./lib/onboarding";

type Queue = {
  offer: PromptKind | null;
  completed: boolean;
  firstVisit: boolean;
  readingActive: boolean;
  blocked: boolean;
  ready: boolean;
  installAvailable: boolean;
  setInstallAvailable: (value: boolean) => void;
  register: (kind: PromptKind, eligible: boolean | null) => void;
  finish: (kind: PromptKind) => void;
  setReadingActive: (value: boolean) => void;
};
const Context = createContext<Queue | null>(null);
export function useOnboarding() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing onboarding context");
  return context;
}
export function usePromptOffer(kind: PromptKind, eligible: boolean | null) {
  const queue = useOnboarding();
  useEffect(() => {
    queue.register(kind, eligible);
    return () => queue.register(kind, false);
  }, [kind, eligible, queue.register]);
  return queue.offer === kind && queue.readingActive && !queue.blocked;
}
export default function Onboarding({ credentials, group, ready, children }: {
  credentials: Credentials | null; group: Group | null; ready: boolean; children: ReactNode;
}) {
  const [visit, setVisit] = useState(() => continueVisit(parseVisit(localStorage.getItem(VISIT_KEY)), Date.now(), crypto.randomUUID()));
  const [eligible, setEligible] = useState<Partial<Record<PromptKind, boolean | null>>>({});
  const eligibleRef = useRef<Partial<Record<PromptKind, boolean | null>>>({});
  const visitId = useRef(visit.id);
  const [offer, setOffer] = useState<PromptKind | null>(null);
  const [readingActive, setReadingActive] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const register = useCallback((kind: PromptKind, value: boolean | null) => {
    eligibleRef.current[kind] = value;
    setEligible(current => current[kind] === value ? current : { ...current, [kind]: value });
  }, []);
  const finish = useCallback((kind: PromptKind) => setOffer(current => current === kind ? null : current), []);
  let firstVisit = false;
  if (credentials) {
    try { firstVisit = JSON.parse(localStorage.getItem(profileKey(credentials)) ?? "null")?.firstVisit === visit.id; }
    catch { /* Legacy and corrupt profiles must not block manual features. */ }
  }
  const completed = ready && hasCompletedReading(group, credentials?.memberId);
  useEffect(() => {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  }, [visit]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const next = continueVisit(parseVisit(localStorage.getItem(VISIT_KEY)), Date.now(), crypto.randomUUID());
      if (visitId.current !== next.id) { visitId.current = next.id; setOffer(null); }
      setVisit(next);
      localStorage.setItem(VISIT_KEY, JSON.stringify(next));
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pointerdown", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pointerdown", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const check = () => setBlocked(Boolean(document.querySelector('dialog[open], .simple-modal-bg, [aria-modal="true"]')));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
    check();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (offer || !ready || !credentials || !readingActive || blocked) return;
    const next = nextPrompt(eligibleRef.current, visit, localStorage.getItem(SETUP_KEY) === "true");
    if (!next) return;
    const claimed = { ...visit, offered: [...visit.offered, next] };
    localStorage.setItem(VISIT_KEY, JSON.stringify(claimed));
    setVisit(claimed); setOffer(next);
  }, [offer, ready, credentials?.groupId, credentials?.memberId, readingActive, blocked, eligible, visit]);
  const value = useMemo(() => ({ offer, completed, firstVisit, readingActive, blocked, ready, installAvailable,
    register, finish, setReadingActive, setInstallAvailable }), [offer, completed, firstVisit, readingActive, blocked, ready, register, finish, installAvailable]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
