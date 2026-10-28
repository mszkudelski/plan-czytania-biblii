import type { Group } from "../types";

type Hit = { path: string; title: string; referrer: string; event?: boolean; no_session?: boolean };
type GoatCounter = { no_onload?: boolean; count?: (hit: Hit) => void };
declare global {
  interface Window { goatcounter?: GoatCounter }
}

let started = false;
let ready = false;
const pending: Hit[] = [];

function send(hit: Hit) {
  if (!started) return;
  try {
    if (ready) window.goatcounter?.count?.(hit);
    else if (pending.length < 20) pending.push(hit);
  } catch { /* Analytics must never interrupt reading or progress saves. */ }
}

export function startAnalytics() {
  const code = import.meta.env.VITE_GOATCOUNTER_CODE;
  if (started || import.meta.env.VITE_DEPLOY_CONTEXT !== "production" ||
    window.location.hostname !== "plan-czytania.netlify.app" || navigator.webdriver ||
    typeof code !== "string" || !/^[a-z0-9-]+$/.test(code)) return;

  started = true;
  window.goatcounter = { no_onload: true };
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.referrerPolicy = "no-referrer";
  script.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  script.onload = () => {
    ready = true;
    // Fixed values exclude invitation tokens, names and private URL parameters.
    send({ path: "/", title: "Plan czytania Biblii", referrer: "" });
    for (const hit of pending.splice(0)) send(hit);
  };
  script.onerror = () => { pending.length = 0; started = false; };
  document.head.append(script);
}

// Count a transition after the server confirms a complete original plan day.
// Recovery portions may contain parts of several original days.
export function trackSavedReading(before: Group, after: Group, memberId: string) {
  if (before.id !== after.id || before.planVersion !== after.planVersion) return;
  const previous = before.progress[memberId] ?? {};
  const current = after.progress[memberId] ?? {};
  const days = new Map(before.planDays.map(day => [day.id, day]));
  for (const day of after.planDays) {
    const oldDay = days.get(day.id);
    if (oldDay && day.segments.length > 0 &&
      day.segments.every(segment => current[segment.id]) &&
      !oldDay.segments.every(segment => previous[segment.id])) {
      send({ path: "reading_day_completed", title: "Ukończony dzień planu", referrer: "", event: true, no_session: true });
    }
  }
}
