/**
 * TS-07 — Cross-endpoint referential and arithmetic consistency.
 *
 * These checks need no UI and no contract: they assert that the API is
 * internally coherent. On a ledger this is the cheapest high-value test class
 * there is, because an inconsistency between two reads is almost always a
 * symptom of a write that went wrong.
 *
 * Design technique: invariant-based testing (properties that must hold for any
 * data set), not example-based. That keeps the tests valid when the demo data
 * is refreshed.
 */
import { test, expect } from '../../src/support/fixtures.js';
import type { Transaction, Contact } from '../../src/support/domain.js';
import { toCents, sumCents, formatUsd } from '../../src/support/money.js';

test.describe('Cross-endpoint consistency @p2 @consistency', () => {
  test('TS-07 — every recipientId on a transaction must resolve to a known contact', async ({
    api,
  }, testInfo) => {
    const [txRes, contactRes] = await Promise.all([
      api.get<Transaction[]>('/transactions', { testInfo, label: 'GET /transactions' }),
      api.get<Contact[]>('/contacts', { testInfo, label: 'GET /contacts' }),
    ]);

    test.skip(
      !Array.isArray(txRes.body) || !Array.isArray(contactRes.body),
      'One of the two endpoints did not return a list.',
    );

    const knownContacts = new Set(contactRes.body.map((c) => c.id));
    const dangling = txRes.body
      .filter((t) => t.recipientId !== null && !knownContacts.has(t.recipientId))
      .map((t) => `${t.id} -> ${t.recipientId}`);

    expect(
      dangling,
      [
        'Referential integrity breach between /transactions and /contacts.',
        `${dangling.length} transaction(s) point at a recipient that does not exist:`,
        ...dangling.map((d) => `  ${d}`),
        '',
        'A dangling recipient means the transaction detail screen cannot render a',
        'counterparty, and any reconciliation job will drop or mis-attribute the row.',
      ].join('\n'),
    ).toEqual([]);
  });

  test('TS-07b — every transaction category must carry a coherent sign', async ({
    api,
  }, testInfo) => {
    const res = await api.get<Transaction[]>('/transactions', {
      testInfo,
      label: 'GET /transactions (sign coherence)',
    });
    test.skip(!Array.isArray(res.body), 'No list returned.');

    // Invariant derived from the observed data set and confirmed by the UI
    // semantics: a withdrawal or a transfer OUT is money leaving the account, a
    // refund is money arriving. This is recorded as assumption H-06, because the
    // brief never states it — if the PO says a refund can be negative, this test
    // is what forces that conversation instead of silently encoding a guess.
    const wrongSign = res.body.filter(
      (t) =>
        (t.category === 'withdrawal' && t.amount > 0) ||
        (t.category === 'refund' && t.amount < 0),
    );

    expect(
      wrongSign.map((t) => `${t.id} ${t.category} ${t.amount}`),
      'Category/sign incoherence — see assumption H-06.',
    ).toEqual([]);
  });

  test('TS-07c — the filtered views must partition the ledger exactly', async ({
    api,
  }, testInfo) => {
    // Property: filtering by each status and concatenating must reproduce the
    // unfiltered ledger, with no duplicates and no losses. This catches
    // off-by-one filter bugs and rows that belong to no status at all.
    const all = await api.get<Transaction[]>('/transactions', { testInfo, label: 'all' });
    test.skip(!Array.isArray(all.body), 'No list returned.');

    const statuses = ['completed', 'pending', 'failed'] as const;
    const parts = await Promise.all(
      statuses.map((s) =>
        api.get<Transaction[]>('/transactions', {
          params: { status: s },
          testInfo,
          label: `status=${s}`,
        }),
      ),
    );

    const partitioned = parts.flatMap((p) => (Array.isArray(p.body) ? p.body : []));
    const partitionedIds = partitioned.map((t) => t.id).sort();
    const allIds = all.body.map((t) => t.id).sort();

    expect(
      new Set(partitionedIds).size,
      'A transaction appeared under more than one status filter.',
    ).toBe(partitionedIds.length);

    expect(
      partitionedIds,
      [
        'The three status filters do not partition the ledger.',
        `Unfiltered: ${allIds.length} records. Sum of filters: ${partitionedIds.length}.`,
        'Records missing from every filter are invisible in the UI but still count',
        'towards the balance — a silent reconciliation gap.',
      ].join('\n'),
    ).toEqual(allIds);

    // Arithmetic is done in integer cents on purpose (see src/support/money.ts).
    const allCents = sumCents(all.body.map((t) => t.amount));
    const partCents = sumCents(partitioned.map((t) => t.amount));
    expect(
      partCents,
      `Ledger total drifted across the partition: ${formatUsd(allCents)} vs ${formatUsd(partCents)}.`,
    ).toBe(allCents);
  });

  test('TS-07d — no duplicate transaction ids @p2', async ({ api }, testInfo) => {
    const res = await api.get<Transaction[]>('/transactions', { testInfo, label: 'GET /transactions' });
    test.skip(!Array.isArray(res.body), 'No list returned.');

    const seen = new Map<string, number>();
    for (const t of res.body) seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1);

    expect(
      duplicates,
      'Duplicate ids in the ledger — the double-settlement signature from Annexe G extract B.',
    ).toEqual([]);
  });

  test('TS-07e — /transactions responds within the Annexe D latency budget @performance', async ({
    api,
  }, testInfo) => {
    // Ten sequential samples. This is a smoke-level guard-rail, NOT a load test:
    // it catches an order-of-magnitude regression on a single-user path. Real
    // p95 under 50 req/s sustained load is out of scope for this exercise and is
    // called out as a residual risk in the strategy.
    const samples: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await api.get('/transactions', { label: `sample ${i + 1}` });
      expect(res.status).toBe(200);
      samples.push(res.durationMs);
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.min(samples.length - 1, Math.ceil(0.95 * samples.length) - 1)]!;

    await testInfo.attach('latency-samples', {
      body: JSON.stringify({ samples, p95, budgetMs: 300 }, null, 2),
      contentType: 'application/json',
    });

    expect(
      p95,
      `Single-user p95 for GET /transactions was ${p95} ms against a 300 ms budget ` +
        '(Annexe D). Measured client-side over 10 sequential samples, so it includes ' +
        'network RTT from the runner — treat a marginal failure as a signal to ' +
        'measure server-side, not as a definitive breach.',
    ).toBeLessThan(300);
  });
});
