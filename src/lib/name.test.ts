import { describe, expect, it } from "vitest";
import { cleanPersonName, normalizePersonName } from "./name";

describe("nazwy osób", () => {
  it("zachowuje imię i nazwisko oraz porządkuje spacje", () => {
    expect(cleanPersonName("  Szymon   Kowalski ")).toBe("Szymon Kowalski");
  });

  it("porównuje nazwy bez względu na wielkość liter", () => {
    expect(normalizePersonName("Szymon Kowalski")).toBe(
      normalizePersonName("szymon kowalski"),
    );
  });
});
