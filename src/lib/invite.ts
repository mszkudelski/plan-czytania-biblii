import type { Credentials } from "../types";

export function createInviteLink(credentials: Credentials) {
  const payload = btoa(
    unescape(encodeURIComponent(JSON.stringify(credentials))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${window.location.origin}${window.location.pathname}#invite=${payload}`;
}

export function readInviteFromHash(): Credentials | null {
  const match = window.location.hash.match(/^#invite=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const padded = match[1].replaceAll("-", "+").replaceAll("_", "/");
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json) as Credentials;
  } catch {
    return null;
  }
}
