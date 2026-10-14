import { describe, expect, it } from "vitest";
import { formatRecoveryCode, generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from "./access-recovery";

const CODE = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

describe("kod odzyskiwania dostępu", () => {
  it("przyjmuje zapisany kod z odstępami, myślnikami i małymi literami", () => {
    expect(formatRecoveryCode(CODE)).toBe("2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ");
    expect(normalizeRecoveryCode(" 2345-6789 abcd-efgh\njklm npqr stuv wxyz ")).toBe(CODE);
  });

  it.each([null, 123, {}, "ABCD-EFGH", CODE + "2", CODE.slice(1), "0".repeat(32), "I".repeat(32), CODE + "!", " ".repeat(129)])(
    "odrzuca niepełny lub nieprawidłowy kod: %j", (value) => {
      expect(normalizeRecoveryCode(value)).toBeNull();
    },
  );

  it("generuje długi losowy kod w alfabecie bez niejednoznacznych znaków", () => {
    const first = generateRecoveryCode();
    expect(first).toMatch(/^[2-9A-HJ-NP-Z]{32}$/);
    expect(generateRecoveryCode()).not.toBe(first);
    expect(normalizeRecoveryCode(formatRecoveryCode(first))).toBe(first);
  });

  it("haszuje kod deterministycznie i odróżnia zmieniony kod", async () => {
    const hash = await hashRecoveryCode(CODE);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashRecoveryCode(CODE)).toBe(hash);
    expect(await hashRecoveryCode("2".repeat(32))).not.toBe(hash);
    expect(hash.includes(CODE)).toBe(false);
  });
});
