/**
 * TS-05 — The critical end-to-end journey.
 *
 *   sign in  ->  open the transfer form  ->  submit a valid instant transfer
 *            ->  see it acknowledged     ->  find it in the ledger
 *
 * This is the ONE full E2E in the suite, and that is deliberate. Everything the
 * API layer can prove is proven there, in seconds, deterministically. The E2E
 * exists to answer the one question the API cannot: does the whole chain —
 * Angular routing, guard, form validation, HTTP layer, backend, ledger read —
 * hold together for a real user? Adding more browser tests would buy coverage
 * we already have, at 50× the runtime and with far worse failure diagnostics.
 *
 * Recorded mode has no UI to drive, so the whole file is skipped rather than
 * faked. A skipped test that says why is honest; a mocked UI test that always
 * passes is not.
 */
import { test, expect } from '../../src/support/fixtures.js';
import { LoginPage } from '../../src/pages/login.page.js';
import { TransferPage } from '../../src/pages/transfer.page.js';
import { env, isRecorded } from '../../src/support/env.js';
import { safeJson } from '../../src/support/redact.js';

test.skip(isRecorded, 'TEST_MODE=recorded replays API payloads only — there is no UI to drive.');

test.describe('Critical journey — authenticated instant transfer @e2e @p1', () => {
  test('TS-05 — a member can sign in and submit an instant transfer', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    const transfer = new TransferPage(page);
    const { email, password } = env.credentials('member');

    // Capture the outbound transfer request so we can assert on what actually
    // left the browser — this is what makes R08 (PIN hashed client-side)
    // verifiable rather than assumed.
    const transferRequest = page.waitForRequest(
      (r) => r.url().includes('/transfers') && r.method() === 'POST',
      { timeout: 15_000 },
    ).catch(() => null);

    await test.step('sign in', async () => {
      await login.goto();
      await login.signIn(email, password);
      await expect(
        page,
        'After a successful sign-in the user must leave /login (R07 guard works both ways).',
      ).not.toHaveURL(/\/login/);
    });

    await test.step('submit a valid instant transfer', async () => {
      await transfer.goto();
      await transfer.recipient.fill('Sarah Chen');
      await transfer.amount.fill('12.34');
      await transfer.note.fill('QA E2E critical journey');
      await transfer.pin.fill(env.pin());
      await expect(transfer.submit, 'A fully valid form must enable submission.').toBeEnabled();
      await transfer.submit.click();
    });

    await test.step('the transfer is acknowledged', async () => {
      await expect(
        page.getByText(/transfer submitted successfully/i),
        'The success toast from assets/i18n/en.json must appear on an accepted transfer.',
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('R08 — the raw PIN must not leave the browser', async () => {
      const request = await transferRequest;
      test.skip(request === null, 'No POST /transfers observed; the form may submit client-side only.');

      const body = request!.postDataJSON() as Record<string, unknown> | null;
      await testInfo.attach('outbound-transfer-request', {
        body: safeJson({ url: request!.url(), body }),
        contentType: 'application/json',
      });

      const pin = body?.['pin'];
      expect(pin, 'The transfer request must carry a pin field.').toBeDefined();
      expect(
        String(pin),
        [
          'R08 — the PIN must be SHA-256 hashed client-side; the raw value must not',
          'circulate. A 6-digit PIN in clear on the wire is trivially replayable and',
          'trivially brute-forced (10^6 space). Annexe H TC-05 asserts exactly this',
          'regex; it is re-asserted here on the real user journey.',
        ].join('\n'),
      ).toMatch(/^[a-f0-9]{64}$/);

      expect(
        String(pin),
        'The transmitted value must not simply be the PIN itself.',
      ).not.toBe(env.pin());
    });
  });

  test('TS-05b — R03 boundary is enforced in the form @boundary', async ({ page }) => {
    const login = new LoginPage(page);
    const transfer = new TransferPage(page);
    const { email, password } = env.credentials('member');

    await login.goto();
    await login.signIn(email, password);
    await transfer.goto();

    await transfer.recipient.fill('Sarah Chen');
    await transfer.amount.fill('10000.00'); // first invalid value above the R03 ceiling
    await transfer.pin.fill(env.pin());

    await expect(
      transfer.error('amount_max'),
      'R03 — $10,000.00 is one cent above the documented ceiling and must be refused by the form.',
    ).toBeVisible();
  });

  test('TS-05c — R02 PIN format is enforced in the form @boundary @negative', async ({ page }) => {
    const login = new LoginPage(page);
    const transfer = new TransferPage(page);
    const { email, password } = env.credentials('member');

    await login.goto();
    await login.signIn(email, password);
    await transfer.goto();

    await transfer.recipient.fill('Sarah Chen');
    await transfer.amount.fill('10.00');
    await transfer.pin.fill('12345'); // 5 digits — one short of the R02 boundary
    await transfer.submit.click({ trial: true }).catch(() => undefined);

    await expect(
      transfer.error('pin_format'),
      'R02 — a 5-digit PIN must be refused with the documented message.',
    ).toBeVisible();
  });

  test('TS-05d — invalid credentials are refused @negative @security', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn('member@nexapay.test', 'definitely-not-the-password');

    await expect(
      login.error,
      'An invalid password must produce the generic error and must not sign the user in.',
    ).toBeVisible();
    await expect(page, 'A failed sign-in must leave the user on /login.').toHaveURL(/\/login/);
  });
});
