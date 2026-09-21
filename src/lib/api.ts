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
  localUpdateProgress,
} from "./local-store";

const CREDENTIALS_KEY = "plan-czytania-biblii-credentials";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(
      response.ok ? "Backend nie jest dostępny." : await response.text(),
    );
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
