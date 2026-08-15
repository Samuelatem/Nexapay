/**
 * Page objects hold *locators and intent*, never assertions.
 * Assertions live in specs so a failure message names the business rule.
 *
 * SELECTOR POLICY — revised after live DOM verification (15/08/2026)
 * ------------------------------------------------------------------
 * Every `data-testid` below was read off the running application, not inferred.
 *
 * IMPORTANT CORRECTION: Annexe H's existing suite uses `data-testid=row` and
 * `data-testid=resend`. **Neither exists in the deployed application.** The real
 * hooks are `tx-row`, `tx-details-btn` and `tx-delete-btn`. That single fact
 * explains Annexe H's TC-04 `TimeoutError` — it was waiting for a selector that
 * can never resolve. See docs/08-live-verification.md.
 *
 * ROUTING: the application uses Angular **hash** routing (`#/login`,
 * `#/transactions`, …). Path-style URLs do not resolve.
 */
import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    // No data-testid on the login form; role + accessible name is the next
    // strongest hook, and it doubles as a WCAG check — if the accessible name
    // disappears, this locator stops resolving and the test goes red.
    this.email = page.getByPlaceholder('Enter your email');
    this.password = page.getByPlaceholder('Enter your password');
    this.submit = page.getByRole('button', { name: 'Sign In' });
    this.error = page.getByText(/invalid email or password/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/login');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Toast shown on success — "Welcome back, {{name}}!" (assets/i18n/en.json). */
  welcomeToast(name: string): Locator {
    return this.page.getByText(new RegExp(`welcome back, ${name}`, 'i'));
  }
}
