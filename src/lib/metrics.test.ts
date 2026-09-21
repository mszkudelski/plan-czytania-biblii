import { describe, expect, it } from "vitest";
import {
  calculateProgressPercent,
  formatProgressPercent,
  getPaceTone,
} from "./metrics";

describe("kolor tempa", () => {
  it.each([
    [4, "good"],
    [0, "good"],
    [-1, "warning"],
    [-7, "warning"],
    [-8, "danger"],
  ])("klasyfikuje %s dni jako %s", (pace, tone) => {
    expect(getPaceTone(pace)).toBe(tone);
  });
});

describe("postęp", () => {
  it("zaokrągla postęp do najbliższego pół procenta", () => {
    expect(calculateProgressPercent(1, 390)).toBe(0.5);
    expect(calculateProgressPercent(3, 390)).toBe(1);
  });

  it("pokazuje połówki procentów z polskim separatorem", () => {
    expect(formatProgressPercent(0.5)).toBe("0,5");
    expect(formatProgressPercent(1)).toBe("1");
  });
});
