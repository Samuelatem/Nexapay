import type { Page, Locator } from '@playwright/test';
import { parseCurrencyToCents } from '../support/money.js';

export class TransactionsPage {
  readonly rows: Locator;
  readonly balance: Locator;
  readonly statusFilter: Locator;
  readonly categoryFilter: Locator;
  readonly search: Locator;
  readonly nextPage: Locator;
  readonly prevPage: Locator;
  readonly pageLabel: Locator;
  readonly sortByDate: Locator;
  readonly sortByAmount: Locator;

  constructor(private readonly page: Page) {
    // VERIFIED LIVE: the hook is `tx-row`, NOT `row` as Annexe H's suite assumes.
    this.rows = page.getByTestId('tx-row');
    this.balance = page.getByTestId('tx-balance');
    this.statusFilter = page.getByTestId('filter-status');
    this.categoryFilter = page.getByTestId('filter-category');
    this.search = page.getByTestId('search-input');
    this.nextPage = page.getByTestId('page-next');
    this.prevPage = page.getByTestId('page-prev');
    this.pageLabel = page.getByTestId('page-label');
    this.sortByDate = page.getByTestId('sort-date');
    this.sortByAmount = page.getByTestId('sort-amount');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/transactions');
  }

  async filterByStatus(status: 'all' | 'completed' | 'pending' | 'failed'): Promise<void> {
    await this.statusFilter.selectOption(status);
  }

  /** Displayed balance in integer cents. */
  async balanceInCents(): Promise<number> {
    return parseCurrencyToCents(await this.balance.innerText());
  }

  /**
   * Walks every page and returns displayed amounts in integer cents.
   *
   * Pagination is 5 rows per page against 15 records (verified: "Page 1 of 3"),
   * so a single-page read would compare 5 rows against 15 API records and pass
   * for entirely the wrong reason.
   */
  async readAllDisplayedAmountsInCents(): Promise<number[]> {
    const amounts: number[] = [];
    const seen = new Set<string>();

    for (let guard = 0; guard < 20; guard += 1) {
      await this.rows.first().waitFor({ state: 'visible' });
      const texts = await this.rows.allInnerTexts();
      const fingerprint = texts.join('|');
      if (seen.has(fingerprint)) break;
      seen.add(fingerprint);

      for (const text of texts) {
        // Amounts render as "-$300.00" / "+$2,800.00".
        const match = text.match(/[+-]\s?\$[\d,]+\.\d{2}/);
        if (match) amounts.push(parseCurrencyToCents(match[0]));
      }

      if (!(await this.nextPage.isEnabled().catch(() => false))) break;
      await this.nextPage.click();
    }

    return amounts;
  }
}
