/**
 * Custom Playwright fixtures.
 *
 * `api` is request-scoped, so each test gets its own APIRequestContext and no
 * test can leak cookies or auth state into another. Isolation is a property of
 * the harness, not something each spec has to remember.
 */
import { test as base, expect, request as playwrightRequest } from '@playwright/test';
import { ApiClient } from '../clients/api-client.js';
import { env } from './env.js';

interface Fixtures {
  api: ApiClient;
  /** A second, independent client — used to prove cross-session isolation. */
  anonymousApi: ApiClient;
}

export const test = base.extend<Fixtures>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: env.apiUrl,
      ignoreHTTPSErrors: false,
    });
    await use(new ApiClient(context, env.apiUrl));
    await context.dispose();
  },

  anonymousApi: async ({}, use) => {
    // Explicitly no storage state: proves an endpoint's behaviour for a caller
    // that has never authenticated.
    const context = await playwrightRequest.newContext({ storageState: undefined });
    await use(new ApiClient(context, env.apiUrl));
    await context.dispose();
  },
});

export { expect };
