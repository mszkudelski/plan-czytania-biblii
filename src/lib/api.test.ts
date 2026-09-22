import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  redeemSessionTransfer,
  restoreSession,
  saveSession,
} from "./api";
import type { Credentials, Group } from "../types";

const credentials: Credentials = {
  groupId: "group-1",
  memberId: "member-1",
  token: "token-1",
};

const group: Group = {
  id: "group-1",
  name: "Plan",
  createdAt: "2026-09-22T08:00:00.000Z",
  startDate: "2026-09-22",
  frequency: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
  planDays: [
    {
      id: "day-1",
      index: 0,
      date: "2026-09-22",
      title: "Dzień 1",
      segments: [{ id: "segment-1", label: "Rdz 1", section: "ST" }],
    },
  ],
  members: [
    {
      id: "member-1",
      name: "Marek",
      color: "#47634f",
      isAdmin: true,
    },
  ],
  progress: { "member-1": {} },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("remote session API", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        hostname: "plan-czytania.netlify.app",
        port: "",
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("treats a missing cookie session as an empty session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: "Brak zapisanej sesji." }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("synchronizes and clears the cookie session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ group, credentials }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await saveSession(credentials);
    await clearSession();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/session",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("redeems a transfer code for the existing member session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ group, credentials }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(redeemSessionTransfer("ABCD-EFGH")).resolves.toEqual({
      group,
      credentials,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/transfers/redeem",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "ABCD-EFGH" }),
      }),
    );
  });
});
