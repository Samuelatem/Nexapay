/**
 * TS-10 — Role-based access control at the UI layer (R10).
 *
 * The API-level counterpart is tests/api/authorization.spec.ts. Both are needed
 * and they fail differently: hiding the Admin link is a usability measure, while
 * refusing GET /users is the actual control. A product can pass this file and
 * still be wide open — which is precisely what the evidence shows.
 */
import { test, expect } from '../../src/support/fixtures.js';
import { LoginPage } from '../../src/pages/login.page.js';
import { env, isRecorded } from '../../src/support/env.js';

test.skip(isRecorded, 'TEST_MODE=recorded replays API payloads only — there is no UI to drive.');

const cases = [
  { role: 'admin' as const, adminVisible: true },
  { role: 'manager' as const, adminVisible: false },
  { role: 'member' as const, adminVisible: false },
];

for (const { role, adminVisible } of cases) {
  test(`TS-10 — the Admin section is ${adminVisible ? 'offered to' : 'hidden from'} ${role} @p2 @security`, async ({
    page,
  }) => {
    const login = new LoginPage(page);
    const { email, password } = env.credentials(role);

    await login.goto();
    await login.signIn(email, password);

    const adminLink = page.getByRole('link', { name: /^admin$/i });
    if (adminVisible) {
      await expect(adminLink, 'R10 — ADMIN must be able to reach user management.').toBeVisible();
    } else {
      await expect(
        adminLink,
        `R10 — the ${role} role must not be offered the Admin section.`,
      ).toBeHidden();
    }
  });
}

test('TS-10b — a non-admin navigating directly to /admin must be refused @p1 @security', async ({
  page,
}) => {
  // Hiding a link is not access control. This drives the URL directly, which is
  // what any curious user does.
  const login = new LoginPage(page);
  const { email, password } = env.credentials('member');

  await login.goto();
  await login.signIn(email, password);
  await page.goto('/admin');

  await expect(
    page.getByRole('heading', { name: /user management/i }),
    [
      'R10 — a MEMBER reached the Admin user-management screen by typing the URL.',
      'A route guard that only hides the nav link is decoration, not authorisation.',
    ].join('\n'),
  ).toBeHidden();
});
