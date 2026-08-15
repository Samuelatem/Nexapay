/**
 * The persistent application shell — sidebar + topbar.
 * All hooks verified against the running application on 15/08/2026.
 */
import type { Page, Locator } from '@playwright/test';

export class ShellPage {
  readonly sidebar: Locator;
  readonly userChip: Locator;
  readonly logout: Locator;
  readonly sendMoney: Locator;
  readonly languageToggle: Locator;
  readonly notificationBell: Locator;
  readonly search: Locator;
  readonly title: Locator;

  constructor(private readonly page: Page) {
    this.sidebar = page.getByTestId('sidebar');
    this.userChip = page.getByTestId('sidebar-user-chip');
    this.logout = page.getByTestId('sidebar-logout');
    this.sendMoney = page.getByTestId('send-money-btn');
    this.languageToggle = page.getByTestId('lang-toggle');
    this.notificationBell = page.getByTestId('notification-bell');
    this.search = page.getByTestId('topbar-search');
    this.title = page.getByTestId('topbar-title');
  }

  /**
   * Navigation entries. `admin` is included deliberately even though no
   * `nav-admin` hook was observed for non-admin roles — the RBAC spec asserts
   * its ABSENCE, and a locator that resolves to nothing is exactly what
   * `toBeHidden()` needs.
   */
  nav(section: 'dashboard' | 'transactions' | 'transfer' | 'upload' | 'admin'): Locator {
    return this.page.getByTestId(`nav-${section}`);
  }
}
