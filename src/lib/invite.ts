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

export function parseJoinLink(value: string): JoinInvite | null {
  try {
    const url = new URL(value, window.location.origin);
    const match = url.hash.match(/^#join=([A-Za-z0-9_-]+)$/);
    if (!match) return null;
    const invite = decode<JoinInvite>(match[1]);
    return invite?.groupId && invite.inviteToken ? invite : null;
  } catch {
    return null;
  }
}

export function readJoinFromHash(): JoinInvite | null {
  return parseJoinLink(window.location.href);
}

export function createSessionTransferLink(code: string) {
  return `${window.location.origin}${window.location.pathname}#transfer=${code}`;
}

export function parseSessionTransfer(value: string): string | null {
  const directCode = value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (directCode.length === 8) return directCode;

  try {
    const url = new URL(value, window.location.origin);
    const match = url.hash.match(/^#transfer=([A-Za-z0-9-]+)$/i);
    if (!match) return null;
    const code = match[1].replace(/[^A-Z0-9]/gi, "").toUpperCase();
    return code.length === 8 ? code : null;
  } catch {
    return null;
  }
}

export function readSessionTransferFromHash(): string | null {
  return parseSessionTransfer(window.location.hash);
}
