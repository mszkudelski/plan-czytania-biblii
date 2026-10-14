import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionTransferLink,
  createMemberAccessLink,
  parseJoinLink,
  parseSessionTransfer,
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

  it("reads a transfer code from a scanned QR link or raw code", () => {
    expect(
      parseSessionTransfer(
        "https://plan-czytania.netlify.app/#transfer=ABCD-EFGH",
      ),
    ).toBe("ABCDEFGH");
    expect(parseSessionTransfer("abcd-efgh")).toBe("ABCDEFGH");
    expect(
      parseSessionTransfer("https://example.com/#join=not-a-transfer"),
    ).toBeNull();
  });

  it("creates and reads an administrator recovery link without confusing it with an invite", () => {
    const link = createMemberAccessLink("ABCD-EFGH");
    expect(link).toBe("https://plan-czytania.netlify.app/#restore=ABCD-EFGH");
    expect(parseSessionTransfer(link)).toBe("ABCDEFGH");
    window.location.hash = "#restore=abcd-efgh";
    expect(readSessionTransferFromHash()).toBe("ABCDEFGH");
    expect(parseJoinLink(link)).toBeNull();
  });

  it("does not shorten personal recovery codes or malformed links into access codes", () => {
    expect(parseSessionTransfer("ABCD-EFGH-IJKL-MNPQ-RSTU-VWXY-2345-6789")).toBeNull();
    expect(parseSessionTransfer("https://example.com/#restore=ABCD-EFGH-IJKL")).toBeNull();
    expect(parseSessionTransfer("https://example.com/#restore=ABCD-EFGH&admin=true")).toBeNull();
  });
});

