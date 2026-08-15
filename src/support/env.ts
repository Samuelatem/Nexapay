/**
 * Single source of truth for runtime configuration.
 *
 * Design rules:
 *  - No URL, credential or threshold is ever hard-coded in a spec file.
 *  - Secrets come from the process environment only (.env is git-ignored).
 *  - Reading an undeclared variable is a loud failure, not a silent `undefined`,
 *    so a mis-provisioned CI job fails at collection time instead of producing
 *    a green run against nothing.
 */
import 'dotenv/config';

export type TestMode = 'live' | 'recorded';
export type RoleName = 'admin' | 'manager' | 'member';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in (see README, "Configuration").`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${raw}".`);
  return parsed;
}

const baseUrl = optional('NEXAPAY_BASE_URL', 'http://localhost:3200').replace(/\/+$/, '');

export const env = {
  mode: optional('TEST_MODE', 'live') as TestMode,
  baseUrl,
  apiUrl: optional('NEXAPAY_API_URL', `${baseUrl}/api/v1`).replace(/\/+$/, ''),

  /** Credentials are resolved lazily: a spec that never logs in never needs them. */
  credentials(role: RoleName): { email: string; password: string } {
    const key = role.toUpperCase();
    return {
      email: required(`NEXAPAY_${key}_EMAIL`),
      password: required(`NEXAPAY_${key}_PASSWORD`),
    };
  },

  pin: (): string => optional('NEXAPAY_TEST_PIN', '123456'),

  nfr: {
    transfersP95Ms: int('NFR_TRANSFERS_P95_MS', 500),
    transactionsP95Ms: int('NFR_TRANSACTIONS_P95_MS', 300),
  },
} as const;

export const isRecorded = env.mode === 'recorded';
