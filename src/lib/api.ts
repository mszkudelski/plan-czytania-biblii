import type {
  Credentials,
  Frequency,
  Group,
  JoinInvite,
  PlanDay,
} from "../types";
import {
  localCreateGroup,
  localEnsureInvite,
  localGetGroup,
  localJoinGroup,
  localRemoveMember,
  localUpdateProgress,
} from "./local-store";

const CREDENTIALS_KEY = "plan-czytania-biblii-credentials";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let message = "Backend nie jest dostępny.";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      // Keep the generic message when the backend does not return JSON.
    }
    throw new ApiError(message, response.status);
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Backend nie jest dostępny.");
  }
  return response.json() as Promise<T>;
}

function canFallback() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function useLocalOnly() {
  return canFallback() && ["5173", "4173"].includes(window.location.port);
}

export function saveCredentials(credentials: Credentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export function loadCredentials(): Credentials | null {
  try {
    return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
}

export async function restoreSession() {
  if (useLocalOnly()) return null;
  try {
    return await request<{ group: Group; credentials: Credentials }>("/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function saveSession(credentials: Credentials) {
  if (useLocalOnly()) return;
  await request("/session", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function clearSession() {
  if (useLocalOnly()) return;
  await request("/session", { method: "DELETE" });
}

export async function createSessionTransfer(credentials: Credentials) {
  if (useLocalOnly()) {
    throw new Error("Przenoszenie sesji jest dostępne po wdrożeniu aplikacji.");
  }
  return request<{ code: string; expiresAt: string }>("/session/transfers", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function redeemSessionTransfer(code: string) {
  if (useLocalOnly()) {
    throw new Error("Przenoszenie sesji jest dostępne po wdrożeniu aplikacji.");
  }
  return request<{ group: Group; credentials: Credentials }>(
    "/session/transfers/redeem",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
  );
}

export async function createGroup(input: {
  name: string;
  ownerName: string;
  startDate: string;
  frequency: Frequency;
  planDays: PlanDay[];
}) {
  if (useLocalOnly()) return localCreateGroup(input);
  try {
    return await request<{ group: Group; credentials: Credentials }>("/groups", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (!canFallback()) throw error;
    return localCreateGroup(input);
  }
}

export async function getGroup(groupId: string) {
  if (useLocalOnly()) return localGetGroup(groupId);
  try {
    return await request<Group>(`/groups/${groupId}`);
  } catch (error) {
    if (!canFallback()) throw error;
    return localGetGroup(groupId);
  }
}

export async function updateProgress(
  credentials: Credentials,
  segmentId: string,
  completed: boolean,
) {
  if (useLocalOnly()) {
    return localUpdateProgress(credentials, segmentId, completed);
  }
  try {
    return await request<Group>(`/groups/${credentials.groupId}/progress`, {
      method: "POST",
      body: JSON.stringify({ ...credentials, segmentId, completed }),
    });
  } catch (error) {
    if (!canFallback()) throw error;
    return localUpdateProgress(credentials, segmentId, completed);
  }
}

export async function ensureInvite(credentials: Credentials) {
  if (useLocalOnly()) return localEnsureInvite(credentials);
  try {
    return await request<Credentials>(`/groups/${credentials.groupId}/invite`, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  } catch (error) {
    if (!canFallback()) throw error;
    return localEnsureInvite(credentials);
  }
}

export async function joinGroup(invite: JoinInvite, name: string) {
  if (useLocalOnly()) return localJoinGroup(invite, name);
  try {
    return await request<{ group: Group; credentials: Credentials }>(
      `/groups/${invite.groupId}/join`,
      {
        method: "POST",
        body: JSON.stringify({ inviteToken: invite.inviteToken, name }),
      },
    );
  } catch (error) {
    if (!canFallback()) throw error;
    return localJoinGroup(invite, name);
  }
}

export async function removeMember(
  credentials: Credentials,
  memberId: string,
) {
  if (useLocalOnly()) return localRemoveMember(credentials, memberId);
  try {
    return await request<Group>(
      `/groups/${credentials.groupId}/members/${memberId}`,
      {
        method: "DELETE",
        body: JSON.stringify(credentials),
      },
    );
  } catch (error) {
    if (!canFallback()) throw error;
    return localRemoveMember(credentials, memberId);
  }
}
