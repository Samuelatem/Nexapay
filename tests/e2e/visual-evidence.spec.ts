/**
 * Visual evidence capture.
 *
 * This file exists so a run produces something a human can look at. It walks
 * the main screens, screenshots each one, and writes the numbers it read into
 * the report next to the picture.
 *
 * It is not really a test file. There are assertions, but they are loose on
 * purpose: the job here is to record what the app looked like on a given date,
 * not to gate a release. The gating happens in tests/api.
 *
 * Output lands in evidence/screenshots/ and is attached to the HTML report.
 *
 * Run it on its own with:
 *   npx playwright test visual-evidence --project=e2e
 */
import { test, expect } from '../../src/support/fixtures.js';
import { LoginPage } from '../../src/pages/login.page.js';
import { ShellPage } from '../../src/pages/shell.page.js';
import { TransactionsPage } from '../../src/pages/transactions.page.js';
import { TransferPage } from '../../src/pages/transfer.page.js';
import { env, isRecorded } from '../../src/support/env.js';
import type { Transaction } from '../../src/support/domain.js';
import { sumCents, formatUsd } from '../../src/support/money.js';
import { mkdir } from 'node:fs/promises';

const DIR = 'evidence/screenshots';

test.skip(isRecorded, 'Replay mode serves API payloads only, so there is no UI to photograph.');
// Deliberately NOT serial. Each capture logs in fresh and stands alone, so a
// failure in one must not cost us the other six screenshots.
test.describe.configure({ mode: 'default', retries: 1 });

test.beforeAll(async () => {
  await mkdir(DIR, { recursive: true });
});

async function shot(page: import('@playwright/test').Page, name: string, testInfo: import('@playwright/test').TestInfo) {
  const path = `${DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return path;
}

test.describe('Visual evidence @evidence', () => {
  test('01 — login screen', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.submit).toBeVisible();
    await shot(page, '01-login', testInfo);
  });

  test('02 — dashboard, with the KPI figures recorded', async ({ page, api }, testInfo) => {
    const login = new LoginPage(page);
    const { email, password } = env.credentials('member');
    await login.goto();
    await login.signIn(email, password);
    await expect(page).toHaveURL(/#\/dashboard/);
    await page.waitForTimeout(1500); // let the chart settle before photographing it
    await shot(page, '02-dashboard', testInfo);

    // Record what the screen claims next to what the ledger actually holds.
    const ledger = await api.get<Transaction[]>('/transactions');
    const screen = await page.locator('body').innerText();
    const figures = screen.match(/\$[\d,]+\.\d{2}/g) ?? [];

    await testInfo.attach('dashboard-vs-ledger', {
      body: JSON.stringify({
        figuresOnScreen: figures,
        ledgerAllStatuses: formatUsd(sumCents(ledger.body.map((t) => t.amount))),
        ledgerCompletedOnly: formatUsd(
          sumCents(ledger.body.filter((t) => t.status === 'completed').map((t) => t.amount)),
        ),
        ledgerIncome: formatUsd(sumCents(ledger.body.filter((t) => t.amount > 0).map((t) => t.amount))),
        ledgerExpenses: formatUsd(sumCents(ledger.body.filter((t) => t.amount < 0).map((t) => t.amount))),
        recordCount: ledger.body.length,
      }, null, 2),
      contentType: 'application/json',
    });
  });

  test('03 — transactions list and its balance', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    const transactions = new TransactionsPage(page);
    const { email, password } = env.credentials('member');
    await login.goto();
    await login.signIn(email, password);
    await transactions.goto();
    await expect(transactions.rows.first()).toBeVisible();
    await shot(page, '03-transactions', testInfo);

    await testInfo.attach('transactions-screen-state', {
      body: JSON.stringify({
        balanceShown: await transactions.balance.innerText(),
        rowsOnPage: await transactions.rows.count(),
        pagination: await transactions.pageLabel.innerText(),
      }, null, 2),
      contentType: 'application/json',
    });
  });

  test('04 — status filters, one screenshot each', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    const transactions = new TransactionsPage(page);
    const { email, password } = env.credentials('member');
    await login.goto();
    await login.signIn(email, password);
    await transactions.goto();

    const seen: Record<string, { rows: number; balance: string; pages: string }> = {};
    for (const status of ['all', 'completed', 'pending', 'failed'] as const) {
      await transactions.filterByStatus(status);
      await page.waitForTimeout(600);
      await shot(page, `04-filter-${status}`, testInfo);
      seen[status] = {
        rows: await transactions.rows.count(),
        balance: await transactions.balance.innerText(),
        pages: await transactions.pageLabel.innerText(),
      };
    }

    // The balance staying still across filters is expected: filters change which
    // rows are shown, not the account total. Recorded here so the next reader
    // does not mistake it for evidence that the figure is hard-coded, which is
    // the mistake I made on the first pass.
    await testInfo.attach('filter-behaviour', {
      body: JSON.stringify(seen, null, 2),
      contentType: 'application/json',
    });
  });

  test('05 — transfer form, empty and with validation errors', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    const transfer = new TransferPage(page);
    const { email, password } = env.credentials('member');
    await login.goto();
    await login.signIn(email, password);
    await transfer.goto();
    await expect(transfer.submit).toBeVisible();
    await shot(page, '05-transfer-empty', testInfo);

    // R03 and R02, one cent and one digit outside the documented limits.
    await transfer.recipient.fill('Sarah Chen');
    await transfer.amount.fill('10000');
    await transfer.pin.fill('12345');
    await page.waitForTimeout(500);
    await shot(page, '06-transfer-validation-errors', testInfo);

    await expect(transfer.error('amount_max')).toBeVisible();
    await expect(transfer.error('pin_format')).toBeVisible();
  });

  test('06 — role based access, one screenshot per role', async ({ page }, testInfo) => {
    for (const role of ['admin', 'manager', 'member'] as const) {
      const login = new LoginPage(page);
      const shell = new ShellPage(page);
      const { email, password } = env.credentials(role);

      await page.context().clearCookies();
      await login.goto();
      await login.signIn(email, password);
      await page.waitForTimeout(1000);
      await shot(page, `07-role-${role}`, testInfo);

      await testInfo.attach(`role-${role}-navigation`, {
        body: JSON.stringify({
          role,
          adminLinkVisible: await shell.nav('admin').isVisible().catch(() => false),
          userChip: await shell.userChip.innerText().catch(() => '(not found)'),
        }, null, 2),
        contentType: 'application/json',
      });
    }
  });

  test('07 — member is bounced off the admin route', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    const { email, password } = env.credentials('member');
    await login.goto();
    await login.signIn(email, password);
    await page.goto('/#/admin');
    await page.waitForTimeout(1500);
    await shot(page, '08-member-blocked-from-admin', testInfo);

    // The guard sends them back to the dashboard. Screenshot proves it.
    await expect(page).not.toHaveURL(/#\/admin/);
  });
});
