import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionTransferLink,
  parseJoinLink,
  readSessionTransferFromHash,
} from "./invite";

function encode(value: unknown) {
  return btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(JSON.stringify(value)),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

describe("invite and transfer links", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://plan-czytania.netlify.app",
        pathname: "/",
        href: "https://plan-czytania.netlify.app/",
        hash: "#transfer=ABCD-EFGH",
      },
    });
  });

  it("reads a join invite from a full link", () => {
    const payload = encode({
      groupId: "group-1",
      inviteToken: "invite-1",
    });

    expect(
      parseJoinLink(`https://plan-czytania.netlify.app/#join=${payload}`),
    ).toEqual({
      groupId: "group-1",
      inviteToken: "invite-1",
    });
  });

  it("normalizes an eight-character transfer code from the hash", () => {
    expect(readSessionTransferFromHash()).toBe("ABCDEFGH");
  });

  it("creates a transfer link for a QR code", () => {
    expect(createSessionTransferLink("ABCD-EFGH")).toBe(
      "https://plan-czytania.netlify.app/#transfer=ABCD-EFGH",
    );
  });
});
