/**
 * Evidence hygiene.
 *
 * Playwright attaches request/response bodies to the HTML report and to traces.
 * Annexe D forbids PAN and PIN ever reaching a log. Every payload this suite
 * attaches as evidence goes through `redact()` first, so a report can be shared
 * with the delivery team without leaking a credential.
 */
const SENSITIVE_KEYS = new Set([
  'pin',
  'password',
  'pan',
  'cardnumber',
  'cvv',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'idempotency-key',
]);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '«redacted»' : redact(inner);
    }
    return out as unknown as T;
  }
  return value;
}

/** Convenience wrapper for attaching a JSON body to the Playwright report. */
export function safeJson(value: unknown): string {
  return JSON.stringify(redact(value), null, 2);
}
