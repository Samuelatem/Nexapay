import { defineConfig, devices } from '@playwright/test';
import { env, isRecorded } from './src/support/env.js';

/**
 * Two projects, deliberately separated:
 *
 *   api  — no browser, fast (seconds). Runs on every push. This is the quality
 *          gate that blocks a merge.
 *   e2e  — browser-backed, slower and inherently more brittle. Runs on merge to
 *          main and nightly. Kept small on purpose: E2E is used to prove a
 *          journey holds end-to-end, not to re-test rules the API layer already
 *          covers. (See docs/02-test-strategy.md §"Test levels".)
 *
 * `fullyParallel` is on for API and off for E2E: the demo environment has a
 * single shared data set with no per-worker isolation, so parallel UI mutations
 * would produce flaky, non-reproducible failures. That is a deliberate trade of
 * speed for determinism, and it is a finding in its own right (RISK-T3).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  // A test marked `.only` must never silently shrink a CI run.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'evidence/html-report', open: 'never' }],
    ['junit', { outputFile: 'evidence/junit.xml' }],
    ['json', { outputFile: 'evidence/results.json' }],
  ],

  outputDir: 'evidence/traces',

  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    // Full-page shots so a reviewer sees the whole screen, not just the viewport.
    // 'on' rather than 'only-on-failure': the assessment asks for proof of
    // execution, and a screenshot of a passing test is proof. Costs disk, not time.
    screenshot: 'on',
    // Video is deliberately off. It spawns an ffmpeg helper during context
    // teardown, which fails with "spawn UNKNOWN" on some Windows machines and
    // takes the whole test down with it. Screenshots and traces give us
    // everything the videos would have, without the extra process.
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    extraHTTPHeaders: {
      // Lets the platform team filter synthetic traffic out of production
      // metrics, and gives us a correlation handle in their logs (Annexe G).
      'X-Test-Run': process.env.TEST_RUN_ID ?? 'local',
    },
  },

  // In recorded mode Playwright owns the replay server lifecycle, so a run is
  // one command with no manual setup step.
  webServer: isRecorded
    ? {
        command: 'node tools/mock-server.mjs',
        url: 'http://127.0.0.1:3399/api/v1/transactions',
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
      }
    : undefined,

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      fullyParallel: true,
      use: {},
    },
    {
      name: 'consistency',
      testDir: './tests/consistency',
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
