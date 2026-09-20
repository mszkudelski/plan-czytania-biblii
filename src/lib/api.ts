import type { Credentials, Frequency, Group, PlanDay } from "../types";
import {
  localAddMember,
  localCreateGroup,
  localGetGroup,
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

export async function addMember(credentials: Credentials, name: string) {
  if (useLocalOnly()) return localAddMember(credentials, name);
  try {
    return await request<{
      group: Group;
      memberCredentials: Credentials;
    }>(`/groups/${credentials.groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ ...credentials, name }),
    });
  } catch (error) {
    if (!canFallback()) throw error;
    return localAddMember(credentials, name);
  }
}
