/**
 * TS-06 — Schema / contract validation.
 *
 * Two assertions per endpoint, and the distinction matters:
 *
 *   "observed"  — does the payload still match the shape we recorded?
 *                 A failure here is a REGRESSION.
 *   "contract"  — does the payload match the published OpenAPI (Annexe E)?
 *                 A failure here is a CONTRACT BREACH, and it is a defect even
 *                 when the code works, because every consumer builds against
 *                 the contract.
 *
 * Annexe E covers only two endpoints and explicitly omits /admin/users,
 * /accounts, webhooks, pagination and every error schema. Where no contract
 * exists we validate against the observed schema and say so, rather than
 * pretending the endpoint is unspecified and skipping it.
 */
import { test, expect } from '../../src/support/fixtures.js';
import {
  validateSchema,
  observedTransactionList,
  observedUserList,
  observedContactList,
  contractTransferResponse,
} from '../../src/schemas/index.js';
import { newIdempotencyKey } from '../../src/clients/api-client.js';
import type { Transaction, TransferResponse } from '../../src/support/domain.js';
import { env } from '../../src/support/env.js';
import { skipIfNotRecorded } from '../../src/support/guards.js';

test.describe('Contract & schema validation @contract @p2', () => {
  test('TS-06 — GET /transactions matches the observed schema @smoke', async ({ api }, testInfo) => {
    const res = await api.get<Transaction[]>('/transactions', {
      testInfo,
      label: 'GET /transactions',
    });

    expect(res.status).toBe(200);
    expect(
      res.headers['content-type'] ?? '',
      'An endpoint advertising JSON must send an application/json content type.',
    ).toContain('application/json');

    const result = validateSchema(observedTransactionList, res.body);
    expect(
      result.valid,
      `GET /transactions violated the observed schema:\n${result.summary}`,
    ).toBe(true);
  });

  test('TS-06b — transaction amounts contradict the published contract @contract', async ({
    api,
  }, testInfo) => {
    const res = await api.get<Transaction[]>('/transactions', {
      testInfo,
      label: 'GET /transactions (amount typing)',
    });
    test.skip(!Array.isArray(res.body) || res.body.length === 0, 'No transactions returned.');

    // Annexe E: `amount: { type: integer, minimum: 1 }`, "Montant en cents".
    // Observed: signed doubles in major units, e.g. -127.85 and 89.99.
    const offenders = res.body.filter((t) => !Number.isInteger(t.amount) || t.amount < 1);

    expect(
      offenders.length,
      [
        'DEF-004 — Monetary representation diverges from the published contract.',
        'Annexe E declares `amount` as a POSITIVE INTEGER in cents (minimum: 1).',
        `Observed ${offenders.length}/${res.body.length} records that are negative,`,
        'fractional, or both — e.g. ' +
          offenders
            .slice(0, 3)
            .map((t) => `${t.id}=${t.amount}`)
            .join(', ') + '.',
        '',
        'This is not cosmetic. Two independent risks follow:',
        '  1. Unit ambiguity. Is `amount: 2500` twenty-five dollars or twenty-five',
        '     hundred? The contract says cents, the UI renders dollars. A consumer',
        '     integrating from the YAML will be wrong by a factor of 100.',
        '  2. Float precision. 89.99 and -127.85 are not exactly representable in',
        '     IEEE-754. Summing a ledger in doubles accumulates drift, which is why',
        '     this suite compares in integer cents (src/support/money.ts).',
        '',
        'Direction of the fix is a PO decision (Q3), not a QA one — but the contract',
        'and the implementation cannot both stay as they are.',
      ].join('\n'),
    ).toBe(0);
  });

  test('TS-06c — GET /users matches the observed schema', async ({ api }, testInfo) => {
    const res = await api.get('/users', { testInfo, label: 'GET /users' });
    test.skip(res.status !== 200, `GET /users returned ${res.status}.`);

    const result = validateSchema(observedUserList, res.body);
    expect(result.valid, `GET /users violated the observed schema:\n${result.summary}`).toBe(true);
  });

  test('TS-06d — contact account numbers must never be returned unmasked @security', async ({
    api,
  }, testInfo) => {
    const res = await api.get('/contacts', { testInfo, label: 'GET /contacts' });
    test.skip(res.status !== 200, `GET /contacts returned ${res.status}.`);

    // The observed schema pins accountMask to ^\*{4}\d{4}$. If a full PAN-like
    // value ever appears in this field, Annexe D ("PAN never logged, never
    // exposed") is breached and this test is the tripwire.
    const result = validateSchema(observedContactList, res.body);
    expect(
      result.valid,
      `GET /contacts violated the observed schema — check for an unmasked account number:\n${result.summary}`,
    ).toBe(true);
  });

  test('TS-06e — POST /transfers response conforms to the Annexe E contract @contract', async ({
    api,
  }, testInfo) => {
    const res = await api.post<TransferResponse>('/transfers', {
      headers: { 'Idempotency-Key': newIdempotencyKey(), 'Content-Type': 'application/json' },
      data: {
        recipientId: 'c2',
        amount: 500,
        currency: 'USD',
        transferType: 'instant',
        pin: env.pin(),
      },
      testInfo,
      label: 'POST /transfers (contract check)',
    });

    skipIfNotRecorded(res.status, 'POST /transfers');
    test.skip(res.status >= 400, `Transfer creation unavailable (HTTP ${res.status}).`);

    expect(res.status, 'Annexe E documents 201 for an accepted transfer.').toBe(201);

    const result = validateSchema(contractTransferResponse, res.body);
    expect(
      result.valid,
      [
        'POST /transfers response does not satisfy the published TransferResponse schema.',
        result.summary,
        '',
        'Note: `expectedSettlementAt` appears in the Annexe F.2 sample response but',
        'is absent from the Annexe E schema. The contract is behind the',
        'implementation — logged as a documentation gap, not a code defect.',
      ].join('\n'),
    ).toBe(true);
  });
});
