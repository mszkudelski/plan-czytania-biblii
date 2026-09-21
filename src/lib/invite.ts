import type { Credentials, JoinInvite } from "../types";

function encode(value: unknown) {
  const payload = btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return payload;
}

function decode<T>(payload: string): T | null {
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function createJoinLink(credentials: Credentials) {
  if (!credentials.inviteToken) {
    throw new Error("Brakuje tokenu zaproszenia.");
  }
  const payload = encode({
    groupId: credentials.groupId,
    inviteToken: credentials.inviteToken,
  } satisfies JoinInvite);
  return `${window.location.origin}${window.location.pathname}#join=${payload}`;
}

export function readJoinFromHash(): JoinInvite | null {
  const match = window.location.hash.match(/^#join=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const invite = decode<JoinInvite>(match[1]);
  return invite?.groupId && invite.inviteToken ? invite : null;
}
