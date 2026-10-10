import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  createRecoveryCode,
  recoveryCodeStatus,
  redeemRecoveryCode,
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

    await expect(saveSession(credentials)).resolves.toEqual({
      group,
      credentials,
    });
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

  it("issues and checks recovery codes only with the authenticated credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ hasCode: false }))
      .mockResolvedValueOnce(jsonResponse({ code: "saved-recovery-code" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recoveryCodeStatus(credentials)).resolves.toEqual({ hasCode: false });
    await expect(createRecoveryCode(credentials)).resolves.toEqual({ code: "saved-recovery-code" });
    for (const [index, path] of ["/status", ""].entries()) {
      expect(fetchMock).toHaveBeenNthCalledWith(index + 1, "/api/session/recovery-code" + path,
        expect.objectContaining({ method: "POST", body: JSON.stringify(credentials), credentials: "same-origin" }));
    }
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("redeems a saved recovery code without a name or invite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ group, credentials }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await expect(redeemRecoveryCode("saved-recovery-code")).resolves.toEqual({ group, credentials });
    expect(fetchMock).toHaveBeenCalledWith("/api/session/recovery-code/redeem",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "saved-recovery-code" }) }));
  });

  it("does not mask a deployed recovery rejection with a local fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Kod nie działa." }, 401)));
    await expect(redeemRecoveryCode("invalid")).rejects.toMatchObject({ message: "Kod nie działa.", status: 401 });
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

