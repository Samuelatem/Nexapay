/**
 * TS-01 / TS-02 — Authorisation boundaries.
 *
 * Business rules under test
 *   R10  Only the ADMIN role may read /admin/users and export transactions.
 *   R06  A MEMBER may only address contacts they own.
 *   R07  A 401 invalidates the session.
 *
 * Design technique: decision table (caller identity × endpoint × expected verdict).
 *
 * These are the highest-priority tests in the suite. On a payments product an
 * authorisation hole is not a severity-3 "nice to fix" — it is the single defect
 * class that can end the launch, so it is tested first, at the cheapest level
 * (API), with no browser in the loop.
 */
import { test, expect } from '../../src/support/fixtures.js';
import type { User, Transaction, Contact } from '../../src/support/domain.js';

test.describe('Authorisation boundaries @security @p1', () => {
  test(
    'TS-01 — an unauthenticated caller must not be able to read the user directory',
    async ({ anonymousApi }, testInfo) => {
      const res = await anonymousApi.get<User[]>('/users', {
        testInfo,
        label: 'anonymous GET /users',
      });

      // We assert the *contract of least privilege*, not a specific code, so the
      // test still passes if the team chooses 401 over 403 (or vice versa).
      expect(
        [401, 403, 404],
        [
          'DEF-001 — Unauthenticated access to the user directory.',
          `Expected 401/403/404 for a caller with no credentials, received ${res.status}.`,
          'R10 states only ADMIN may read the user directory; here no identity was',
          'presented at all. The response body carries name, e-mail and role for',
          'every account, which is a personal-data disclosure as well as an',
          'authorisation failure.',
        ].join('\n'),
      ).toContain(res.status);
    },
  );

  test(
    'TS-01b — an unauthenticated caller must not be able to read the contact book',
    async ({ anonymousApi }, testInfo) => {
      const res = await anonymousApi.get<Contact[]>('/contacts', {
        testInfo,
        label: 'anonymous GET /contacts',
      });

      expect(
        [401, 403, 404],
        [
          'DEF-002 — Unauthenticated access to the contact book.',
          `Expected 401/403/404, received ${res.status}.`,
          'Contacts are returned for every owner at once, so any caller can',
          'enumerate the counterparties of every user (R06 relies on ownership',
          'being enforced server-side).',
        ].join('\n'),
      ).toContain(res.status);
    },
  );

  test(
    'TS-02 — transaction reads must be scoped to the caller, not to a client-supplied id',
    async ({ anonymousApi }, testInfo) => {
      const unscoped = await anonymousApi.get<Transaction[]>('/transactions', {
        testInfo,
        label: 'GET /transactions (no scope)',
      });
      const spoofed = await anonymousApi.get<Transaction[]>('/transactions', {
        params: { userId: 'u2' },
        testInfo,
        label: 'GET /transactions?userId=u2 (spoofed scope)',
      });

      test.skip(
        !Array.isArray(unscoped.body) || !Array.isArray(spoofed.body),
        'Endpoint did not return a list; TS-06 covers the shape failure.',
      );

      // The defect is not "it returned data" — it is that the caller can name
      // whose data they want and the server does not care. Two symptoms:
      //   a) an anonymous caller gets a full list at all;
      //   b) the userId parameter changes nothing, i.e. there is no scoping.
      expect(
        [401, 403],
        [
          'DEF-003 — No tenant scoping on the transaction ledger.',
          `Anonymous GET /transactions returned ${unscoped.status} with ` +
            `${(unscoped.body as Transaction[]).length} records.`,
        ].join('\n'),
      ).toContain(unscoped.status);

      expect(
        spoofed.body,
        [
          'DEF-003 — `userId` is accepted and silently ignored.',
          'Requesting another user\'s ledger returned a byte-identical payload to',
          'the unscoped request, which means the parameter is not a filter and the',
          'ledger is not partitioned. An attacker does not even need to guess an',
          'id: the default response is already global.',
          'This reproduces TC-12 from Annexe H against the live demo host.',
        ].join('\n'),
      ).not.toEqual(unscoped.body);
    },
  );
});
