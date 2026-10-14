import { afterEach, expect, it, vi } from "vitest";
import { missingPushConfiguration, pushConfigured } from "../../netlify/functions/_shared/notifications";
afterEach(() => vi.unstubAllGlobals());
it("reports only the names of missing notification keys without returning secrets", () => {
  vi.stubGlobal("Netlify", { env: { get: (key: string) => key.endsWith("PUBLIC_KEY") ? "public-key" : undefined } });
  expect(pushConfigured()).toBe(false);
  expect(missingPushConfiguration()).toEqual(["READING_PUSH_VAPID_PRIVATE_KEY"]);
  vi.stubGlobal("Netlify", { env: { get: () => "secret-value" } });
  expect(pushConfigured()).toBe(true);
  expect(missingPushConfiguration()).toEqual([]);
});
