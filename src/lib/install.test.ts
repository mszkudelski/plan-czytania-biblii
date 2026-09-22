import { describe, expect, it } from "vitest";
import { isIosSafariBrowser, isStandaloneApp } from "./install";

describe("isIosSafariBrowser", () => {
  it("recognizes Safari on iPhone", () => {
    expect(
      isIosSafariBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5,
      ),
    ).toBe(true);
  });

  it("recognizes Safari on iPad using its desktop user agent", () => {
    expect(
      isIosSafariBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        "MacIntel",
        5,
      ),
    ).toBe(true);
  });

  it("does not treat Chrome on iPhone as Safari", () => {
    expect(
      isIosSafariBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5,
      ),
    ).toBe(false);
  });

  it("does not treat Chrome on Android as Safari", () => {
    expect(
      isIosSafariBrowser(
        "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
        "Linux armv8l",
        5,
      ),
    ).toBe(false);
  });
});

describe("isStandaloneApp", () => {
  it("recognizes either standalone signal", () => {
    expect(isStandaloneApp(true, false)).toBe(true);
    expect(isStandaloneApp(false, true)).toBe(true);
    expect(isStandaloneApp(false, false)).toBe(false);
  });
});
