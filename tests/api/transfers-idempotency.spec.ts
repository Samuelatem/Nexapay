/**
 * TS-03 — Idempotency of POST /transfers.
 *
 * Why this is a P1 on this product specifically
 * ---------------------------------------------
 * Annexe G extract B shows two POSTs from user u3, 121 ms apart, both with
 * `idempotencyKey=(none)`, both persisted, both settled by the bank adapter.
 * That is a customer debited twice. The `Idempotency-Key` header appears in the
 * Annexe F sample requests but is absent from the Annexe E contract — it is
 * documented by example only, which is exactly how a header ends up optional in
 * practice and unenforced in code.
 *
 * Design technique: state transition + equivalence partitioning on the key
 * (same key / new key / absent key).
 *
 * The test asserts the two properties that actually protect the customer:
 *   1. Replaying a key must not create a second transfer.
 *   2. A replay must return the *original* resource, not a new one.
 */
import { test, expect } from '../../src/support/fixtures.js';
import { newIdempotencyKey } from '../../src/clients/api-client.js';
import type { TransferResponse } from '../../src/support/domain.js';
import { env } from '../../src/support/env.js';
import { skipIfNotRecorded } from '../../src/support/guards.js';

const transferPayload = (overrides: Record<string, unknown> = {}) => ({
  recipientId: 'c2',
  amount: 1250,
  currency: 'USD',
  note: 'QA idempotency probe',
  transferType: 'instant',
  pin: env.pin(),
  ...overrides,
});

test.describe('POST /transfers — idempotency @p1 @idempotency', () => {
  test('TS-03 — replaying an Idempotency-Key must not create a second transfer', async ({
    api,
  }, testInfo) => {
    const key = newIdempotencyKey();
    const before = await api.get<unknown[]>('/transfers', { testInfo, label: 'ledger before' });
    const beforeCount = Array.isArray(before.body) ? before.body.length : 0;

    const first = await api.post<TransferResponse>('/transfers', {
      headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
      data: transferPayload(),
      testInfo,
      label: 'first POST /transfers',
    });

    skipIfNotRecorded(first.status, 'POST /transfers');
    test.skip(
      first.status >= 400,
      `Transfer creation is unavailable (HTTP ${first.status}); idempotency cannot be ` +
        'exercised. Tracked as a blocked scenario rather than a false pass.',
    );

    // Byte-identical replay, same key.
    const replay = await api.post<TransferResponse>('/transfers', {
      headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
      data: transferPayload(),
      testInfo,
      label: 'replayed POST /transfers (same key)',
    });

    const after = await api.get<unknown[]>('/transfers', { testInfo, label: 'ledger after' });
    const afterCount = Array.isArray(after.body) ? after.body.length : 0;

    expect(
      replay.status,
      'A replayed idempotent request must be acknowledged (200 or 201), never rejected as a conflict without a body.',
    ).toBeLessThan(300);

    expect(
      replay.body?.id,
      [
        'DEF-005 — Idempotency-Key not honoured on POST /transfers.',
        `First request created ${first.body?.id}; the replay returned ${replay.body?.id}.`,
        'A replay must return the original resource. Returning a new id means the',
        'money moved twice — this is the Annexe G extract B scenario reproduced.',
      ].join('\n'),
    ).toBe(first.body?.id);

    expect(
      afterCount - beforeCount,
      [
        'DEF-005 — Ledger grew by more than one entry for a single logical transfer.',
        `Before: ${beforeCount}, after two requests with the same key: ${afterCount}.`,
      ].join('\n'),
    ).toBe(1);
  });

  test('TS-03b — a distinct Idempotency-Key must create a distinct transfer', async ({
    api,
  }, testInfo) => {
    // The mirror case. Without it, a backend could "pass" TS-03 by rejecting
    // every second request regardless of key — deduplicating too aggressively is
    // just as much a defect as not deduplicating at all.
    const a = await api.post<TransferResponse>('/transfers', {
      headers: { 'Idempotency-Key': newIdempotencyKey(), 'Content-Type': 'application/json' },
      data: transferPayload({ note: 'distinct key A' }),
      testInfo,
      label: 'POST with key A',
    });
    skipIfNotRecorded(a.status, 'POST /transfers');
    test.skip(a.status >= 400, `Transfer creation unavailable (HTTP ${a.status}).`);

    const b = await api.post<TransferResponse>('/transfers', {
      headers: { 'Idempotency-Key': newIdempotencyKey(), 'Content-Type': 'application/json' },
      data: transferPayload({ note: 'distinct key B' }),
      testInfo,
      label: 'POST with key B',
    });

    expect(b.body?.id, 'Two different keys must yield two different transfers.').not.toBe(
      a.body?.id,
    );
  });

  test('TS-03c — a request with no Idempotency-Key should be refused, not silently accepted', async ({
    api,
  }, testInfo) => {
    const res = await api.post<TransferResponse>('/transfers', {
      headers: { 'Content-Type': 'application/json' },
      data: transferPayload({ note: 'no idempotency key' }),
      testInfo,
      label: 'POST /transfers without Idempotency-Key',
    });

    skipIfNotRecorded(res.status, 'POST /transfers');

    expect(
      [400, 422],
      [
        'DEF-006 — `Idempotency-Key` is optional on a money-moving endpoint.',
        `Expected 400/422 demanding the header, received ${res.status}.`,
        'Annexe G extract B is precisely this: two keyless POSTs, both settled.',
        'Making the header mandatory is the cheapest fix available and removes an',
        'entire duplicate-debit failure mode. Note this expectation is an',
        'ASSUMPTION (H-04) pending PO confirmation — the team may prefer',
        'server-side dedup on a payload hash instead.',
      ].join('\n'),
    ).toContain(res.status);
  });
});
