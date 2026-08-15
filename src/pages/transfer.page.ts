import type { Page, Locator } from '@playwright/test';

export class TransferPage {
  readonly recipient: Locator;
  readonly amount: Locator;
  readonly note: Locator;
  readonly pin: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page) {
    this.recipient = page.getByTestId('transfer-recipient');
    this.amount = page.getByTestId('transfer-amount');
    this.note = page.getByTestId('transfer-note');
    this.pin = page.getByTestId('transfer-pin');
    this.submit = page.getByTestId('transfer-submit');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/transfer');
  }

  /**
   * Transfer type is an Angular Material radio group. The `data-testid` sits on
   * the `<mat-radio-button>` host, but the clickable, checkable element is the
   * `<input type=radio>` inside it — clicking the host is unreliable.
   * Verified live: no type is preselected, and the form will not submit without
   * one, yet no "type required" message is ever shown (DEF-017).
   */
  transferType(type: 'instant' | 'standard' | 'scheduled'): Locator {
    return this.page.getByTestId(`transfer-type-${type}`).locator('input[type="radio"]');
  }

  async selectType(type: 'instant' | 'standard' | 'scheduled'): Promise<void> {
    await this.transferType(type).check();
  }

  /** Validation messages, verbatim from assets/i18n/en.json and confirmed live. */
  error(key: 'amount_max' | 'amount_min' | 'pin_format' | 'date_future' | 'recipient_required'): Locator {
    const messages = {
      amount_max: 'Amount cannot exceed $9,999.99',
      amount_min: 'Amount must be greater than 0',
      pin_format: 'PIN must be exactly 6 digits',
      date_future: 'Date must be in the future',
      recipient_required: 'Recipient is required',
    } as const;
    return this.page.getByText(messages[key]);
  }

  async fillValid(opts: { recipient: string; amount: string; pin: string; note?: string }): Promise<void> {
    await this.recipient.fill(opts.recipient);
    await this.amount.fill(opts.amount);
    if (opts.note) await this.note.fill(opts.note);
    await this.selectType('instant');
    await this.pin.fill(opts.pin);
  }
}
