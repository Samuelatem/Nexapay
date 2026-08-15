/**
 * TS-04 / TS-09 — Server-side input validation on money-moving endpoints.
 *
 * Design technique: boundary value analysis on `amount` (R03: ceiling
 * $9,999.99) plus equivalence partitioning on the invalid classes.
 *
 * The point of this file is a single principle: UI validation is a usability
 * feature, not a control. Annexe H TC-06 proves the *form* rejects a 61-character
 * note, and TC-03 proves the *API* accepts 100,000,000 cents ($1,000,000) and
 * answers 201. Anything a user can do with curl, an attacker can do with curl.
 * Every rule in Annexe C is therefore re-asserted at the API boundary here.
 */
import { test, expect } from '../../src/support/fixtures.js';
import { newIdempotencyKey } from '../../src/clients/api-client.js';
import type { TransferResponse } from '../../src/support/domain.js';
import { env } from '../../src/support/env.js';
import { skipIfNotRecorded } from '../../src/support/guards.js';

const base = () => ({
  recipientId: 'c2',
  currency: 'USD',
  transferType: 'instant',
  pin: env.pin(),
});

async function attempt(
  api: { post: (p: string, o: Record<string, unknown>) => Promise<{ status: number; body: unknown }> },
  data: Record<string, unknown>,
  label: string,
  testInfo: unknown,
) {
  return api.post('/transfers', {
    headers: { 'Idempotency-Key': newIdempotencyKey(), 'Content-Type': 'application/json' },
    data,
    testInfo,
    label,
  }) as Promise<{ status: number; body: TransferResponse }>;
}

test.describe('POST /transfers — server-side validation @p1 @negative', () => {
  /**
   * Boundary table for R03 ($9,999.99 ceiling, amounts in cents per Annexe E).
   *
   *   999_999 cents  = $9,999.99  -> on the boundary, must be ACCEPTED
   * 1_000_000 cents  = $10,000.00 -> first invalid value, must be REJECTED
   */
  const boundaries = [
    { label: 'at the ceiling ($9,999.99)', amount: 999_999, mustReject: false },
    { label: 'one cent over the ceiling ($10,000.00)', amount: 1_000_000, mustReject: true },
    { label: 'far over the ceiling ($1,000,000.00)', amount: 100_000_000, mustReject: true },
    { label: 'zero', amount: 0, mustReject: true },
    { label: 'negative', amount: -2500, mustReject: true },
  ];

  for (const { label, amount, mustReject } of boundaries) {
    test(`TS-04 — amount ${label} @boundary`, async ({ api }, testInfo) => {
      const res = await attempt(api, { ...base(), amount }, `amount=${amount}`, testInfo);
      skipIfNotRecorded(res.status, 'POST /transfers');

      if (mustReject) {
        expect(
          res.status,
          [
            `DEF-007 — Business ceiling (R03) is not enforced server-side.`,
            `amount=${amount} cents (${(amount / 100).toFixed(2)} USD) returned ${res.status}.`,
            res.status < 300 ? `A transfer was created: id=${res.body?.id}.` : '',
            'R03 is documented as "validation côté formulaire" only. That wording is',
            'itself the defect: a client-side-only ceiling on a payments API is not a',
            'control. This reproduces TC-03 from Annexe H.',
          ]
            .filter(Boolean)
            .join('\n'),
        ).toBeGreaterThanOrEqual(400);
      } else {
        expect(
          res.status,
          `A transfer exactly on the documented ceiling must be accepted, got ${res.status}.`,
        ).toBeLessThan(300);
      }
    });
  }

  test('TS-04b — a non-integer amount must be refused @negative', async ({ api }, testInfo) => {
    // Annexe E declares `amount: integer` (cents). Sub-cent precision on a
    // payment is a rounding-loss vector, so it must not be silently truncated.
    const res = await attempt(api, { ...base(), amount: 12.345 }, 'amount=12.345', testInfo);
    skipIfNotRecorded(res.status, 'POST /transfers');
    expect(
      res.status,
      'DEF-008 — Sub-unit precision accepted on `amount`, contradicting `type: integer`. ' +
        'Silent truncation or float drift on a monetary field is unacceptable in a ledger.',
    ).toBeGreaterThanOrEqual(400);
  });

  test('TS-04c — a note longer than 60 characters must be refused by the API @negative', async ({
    api,
  }, testInfo) => {
    // R04 / Annexe E `maxLength: 60`. TC-06 proves the FORM enforces it.
    // This asserts the same rule where it actually matters.
    const res = await attempt(
      api,
      { ...base(), amount: 1000, note: 'x'.repeat(61) },
      'note=61 chars',
      testInfo,
    );
    skipIfNotRecorded(res.status, 'POST /transfers');
    expect(
      res.status,
      'R04 / Annexe E declare maxLength 60 on `note`. UI-only enforcement (TC-06) ' +
        'leaves the field unbounded for any non-browser caller.',
    ).toBeGreaterThanOrEqual(400);
  });

  test('TS-04d — a malformed PIN must be refused @negative', async ({ api }, testInfo) => {
    // R02: exactly 6 digits; R08: transmitted as a SHA-256 hash.
    // "12345" is neither a valid PIN nor a valid hash, so it must fail either way.
    const res = await attempt(api, { ...base(), amount: 1000, pin: '12345' }, 'pin=12345', testInfo);
    skipIfNotRecorded(res.status, 'POST /transfers');
    expect(res.status, 'R02 — a 5-character PIN must not authorise a transfer.').toBeGreaterThanOrEqual(400);
  });

  test('TS-04e — a scheduled transfer with a past date must be refused @negative @boundary', async ({
    api,
  }, testInfo) => {
    // R01. Boundary chosen as "yesterday": the first value on the invalid side.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const res = await attempt(
      api,
      { ...base(), amount: 1000, transferType: 'scheduled', scheduledDate: yesterday },
      `scheduledDate=${yesterday}`,
      testInfo,
    );
    skipIfNotRecorded(res.status, 'POST /transfers');
    expect(
      res.status,
      `R01 — a scheduled transfer dated ${yesterday} must be refused. ` +
        'Accepting a past date either executes immediately or strands the transfer.',
    ).toBeGreaterThanOrEqual(400);
  });

  test('TS-04f — a missing required field must be refused @negative', async ({ api }, testInfo) => {
    const { pin: _omitted, ...withoutPin } = base();
    const res = await attempt(api, { ...withoutPin, amount: 1000 }, 'no pin field', testInfo);
    skipIfNotRecorded(res.status, 'POST /transfers');
    expect(
      res.status,
      'Annexe E marks `pin` as required. A transfer authorised with no PIN at all ' +
        'defeats the entire second-factor design.',
    ).toBeGreaterThanOrEqual(400);
  });
});

test.describe('GET /transactions — filter validation @p2 @negative', () => {
  test('TS-09 — an out-of-enum status must be rejected, not silently emptied', async ({
    api,
  }, testInfo) => {
    const res = await api.get<unknown[]>('/transactions', {
      params: { status: 'not-a-real-status' },
      testInfo,
      label: 'GET /transactions?status=not-a-real-status',
    });

    expect(
      res.status,
      [
        'DEF-009 — Out-of-enum filter value answered 200 with an empty list.',
        `Annexe E constrains \`status\` to [completed, pending, failed]; received ${res.status}.`,
        'Returning 200 [] is worse than returning 400: a caller (or a dashboard)',
        'cannot distinguish "no matching records" from "your query was wrong", so a',
        'typo in a client silently renders an empty ledger instead of raising an',
        'error. This is the class of bug that hides missing money.',
      ].join('\n'),
    ).toBe(400);
  });

  test('TS-09b — a valid enum status must return only matching records', async ({
    api,
  }, testInfo) => {
    const res = await api.get<Array<{ status: string }>>('/transactions', {
      params: { status: 'pending' },
      testInfo,
      label: 'GET /transactions?status=pending',
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.every((t) => t.status === 'pending'),
      'Every record returned under ?status=pending must actually be pending.',
    ).toBe(true);
    expect(res.body.length, 'The demo data set must contain at least one pending record.').toBeGreaterThan(0);
  });
});
