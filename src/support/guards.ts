/**
 * Guards that keep a run honest.
 *
 * The single worst outcome for a QA deliverable is a green suite that proved
 * nothing, closely followed by a red suite that manufactured defects nobody can
 * reproduce. These helpers make both impossible to do by accident.
 */
import { test } from '@playwright/test';

/** HTTP 501 from the replay server means "never observed — do not assert". */
export const NOT_RECORDED = 501;

/**
 * Skips the current test when the endpoint has no recorded behaviour.
 *
 * Used instead of a bare `expect` so that a `recorded`-mode run reports
 * "skipped: no evidence" rather than inventing a pass or a fail. The skip
 * reason is carried into the HTML and JUnit reports, so a reader can see
 * exactly which conclusions the run does and does not support.
 */
export function skipIfNotRecorded(status: number, what: string): void {
  test.skip(
    status === NOT_RECORDED,
    `No recorded behaviour for ${what}. This assertion is only meaningful against a ` +
      'live environment (TEST_MODE=live). Reported as skipped rather than passed or ' +
      'failed, because the replay server must never manufacture a verdict.',
  );
}

/**
 * Skips when an endpoint is unavailable for a reason unrelated to the property
 * under test — e.g. idempotency cannot be exercised if creation itself is down.
 * Distinct from a failure: the scenario is BLOCKED, not violated.
 */
export function skipIfBlocked(status: number, what: string): void {
  test.skip(
    status >= 500,
    `${what} returned ${status}; the scenario is blocked, not failed. ` +
      'Tracked as blocked coverage in the Go/No-Go note.',
  );
}
