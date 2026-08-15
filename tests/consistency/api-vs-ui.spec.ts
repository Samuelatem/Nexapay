/**
 * TS-08 — API ↔ UI consistency.
 *
 * The single most valuable test on a financial dashboard: does the number the
 * operator reads on screen equal the number the ledger holds?
 *
 * Annexe F.6 already documents a mismatch on the demo environment — the table
 * foot totals $44,800 while the "Balance" KPI shows $48,291, a $3,491 gap with
 * no stated derivation. Neither figure is reproducible from the transaction data
 * this environment actually serves. This spec turns that one-off observation
 * into a standing check.
 *
 * The comparison is done in integer cents (src/support/money.ts). A float
 * comparison here would be its own defect: summing fifteen doubles including
 * 89.99 and -127.85 does not reliably equal the same sum in a different order.
 */
import { test, expect } from '../../src/support/fixtures.js';
import { LoginPage } from '../../src/pages/login.page.js';
import { TransactionsPage } from '../../src/pages/transactions.page.js';
import type { Transaction } from '../../src/support/domain.js';
import { sumCents, toCents, formatUsd } from '../../src/support/money.js';
import { env, isRecorded } from '../../src/support/env.js';

test.skip(isRecorded, 'TEST_MODE=recorded has no UI; the API-side invariants run in tests/api.');

test.describe('API ↔ UI consistency @p1 @consistency', () => {
  test('TS-08 — every amount rendered in the table matches the ledger', async ({
    page,
    api,
  }, testInfo) => {
    const ledger = await api.get<Transaction[]>('/transactions', {
      testInfo,
      label: 'ledger (source of truth)',
    });
    expect(ledger.status).toBe(200);

    const login = new LoginPage(page);
    const transactions = new TransactionsPage(page);
    const { email, password } = env.credentials('admin');

    await login.goto();
    await login.signIn(email, password);
    await transactions.goto();

    const displayedCents = await transactions.readAllDisplayedAmountsInCents();
    const ledgerCents = ledger.body.map((t) => toCents(t.amount));

    await testInfo.attach('amount-reconciliation', {
      body: JSON.stringify(
        {
          ledgerCount: ledgerCents.length,
          displayedCount: displayedCents.length,
          ledgerTotal: formatUsd(ledgerCents.reduce((a, b) => a + b, 0)),
          displayedTotal: formatUsd(displayedCents.reduce((a, b) => a + b, 0)),
          ledgerCents,
          displayedCents,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    expect(
      displayedCents.length,
      [
        'The table does not render every ledger record.',
        `API returned ${ledgerCents.length} transactions, the paginated table showed ${displayedCents.length}.`,
        'Pagination is 5 rows per page (Annexe B), so a shortfall here means rows are',
        'unreachable in the UI — money the operator cannot see.',
      ].join('\n'),
    ).toBe(ledgerCents.length);

    // Order-independent multiset comparison: the table may sort differently from
    // the API, and that is not a defect. A missing or altered value is.
    expect(
      [...displayedCents].sort((a, b) => a - b),
      'A rendered amount does not correspond to any ledger amount (or vice versa).',
    ).toEqual([...ledgerCents].sort((a, b) => a - b));
  });

  test('TS-08b — the displayed balance equals the sum of the ledger @p1', async ({
    page,
    api,
  }, testInfo) => {
    const ledger = await api.get<Transaction[]>('/transactions', { testInfo, label: 'ledger' });
    expect(ledger.status).toBe(200);

    const login = new LoginPage(page);
    const { email, password } = env.credentials('admin');
    await login.goto();
    await login.signIn(email, password);
    await page.goto('/transactions');

    const expectedAll = sumCents(ledger.body.map((t) => t.amount));
    const expectedCompleted = sumCents(
      ledger.body.filter((t) => t.status === 'completed').map((t) => t.amount),
    );

    const balanceText = await page
      .getByTestId('balance')
      .innerText()
      .catch(async () => (await page.getByText(/balance/i).first().innerText()));

    await testInfo.attach('balance-derivation', {
      body: JSON.stringify(
        {
          displayed: balanceText,
          candidateAllStatuses: formatUsd(expectedAll),
          candidateCompletedOnly: formatUsd(expectedCompleted),
          note:
            'Two defensible derivations exist and the documentation states neither. ' +
            'This ambiguity is PO question Q2 and assumption H-05.',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    const { parseCurrencyToCents } = await import('../../src/support/money.js');
    const displayedCents = parseCurrencyToCents(balanceText);

    expect(
      [expectedAll, expectedCompleted],
      [
        'DEF-010 — The displayed balance is not derivable from the ledger.',
        `Screen shows ${balanceText} (${formatUsd(displayedCents)}).`,
        `Sum of all statuses:      ${formatUsd(expectedAll)}`,
        `Sum of completed only:    ${formatUsd(expectedCompleted)}`,
        '',
        'Annexe F.6 records the same class of gap on the demo environment: a table',
        'foot of $44,800 against a "Balance" KPI of $48,291. If the KPI includes',
        'pending or failed movements, an operator authorises payments against money',
        'that has not settled. The derivation must be specified before launch.',
      ].join('\n'),
    ).toContain(displayedCents);
  });
});
