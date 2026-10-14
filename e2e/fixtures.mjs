import { test as base, expect } from '@playwright/test';
import { e2eHeaders } from './run-context.mjs';
export { expect };
export const test = base.extend({
  browser: async ({ browser }, use) => {
    const proxy = new Proxy(browser, { get(target, key) {
      if (key === 'newContext') return options => target.newContext({ ...options, extraHTTPHeaders: { ...options?.extraHTTPHeaders, ...e2eHeaders } });
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await use(proxy);
  },
});
