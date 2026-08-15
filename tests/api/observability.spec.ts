/**
 * TS-10c — Testability and observability (Annexe D, "Santé applicative").
 *
 * These are not "nice to have" checks. Annexe D sets an RTO of 15 minutes and
 * 99.9% availability. You cannot meet a 15-minute recovery objective without a
 * machine-readable liveness signal — an operator cannot page on a screenshot.
 *
 * These tests are marked @p3: they do not block a functional release on their
 * own, but they are the reason the Go/No-Go note carries an operational reserve.
 */
import { test, expect } from '../../src/support/fixtures.js';

const probes = [
  { path: '/health', purpose: 'liveness — is the process up?' },
  { path: '/ready', purpose: 'readiness — can it serve traffic (deps reachable)?' },
  { path: '/metrics', purpose: 'Prometheus scrape target — Annexe I implies one exists' },
] as const;

test.describe('Observability endpoints @p3 @observability', () => {
  for (const { path, purpose } of probes) {
    test(`TS-10c — ${path} is exposed (${purpose})`, async ({ api }, testInfo) => {
      const res = await api.get(path, { testInfo, label: `GET ${path}` });

      expect(
        res.status,
        [
          `Annexe D lists /health, /ready and /metrics as expected endpoints; ${path} returned ${res.status}.`,
          '',
          'Consequence: there is no automated liveness signal, so the 15-minute RTO',
          'and the 99.9% availability target cannot be measured, let alone met.',
          'Annexe I shows Prometheus data does exist somewhere, which means the gap is',
          'exposure and routing, not instrumentation — likely a cheap fix.',
        ].join('\n'),
      ).toBe(200);
    });
  }

  test('TS-10d — responses carry a correlation id @observability', async ({ api }, testInfo) => {
    // Annexe G shows `correlation-id=corr-a1b2c3d4` threaded through api-gateway,
    // transfer-svc and bank-adapter. If the value is never returned to the caller,
    // a QA engineer holding a failing response cannot pull the matching server
    // trace, and every defect report degrades into "it failed sometimes".
    const res = await api.get('/transactions', { testInfo, label: 'correlation header probe' });

    const candidates = ['x-correlation-id', 'x-request-id', 'correlation-id', 'traceparent'];
    const found = candidates.filter((h) => res.headers[h] !== undefined);

    await testInfo.attach('response-headers', {
      body: JSON.stringify(res.headers, null, 2),
      contentType: 'application/json',
    });

    expect(
      found,
      [
        'No correlation identifier is returned to the client.',
        `Looked for: ${candidates.join(', ')}.`,
        'Annexe G proves one exists server-side. Echoing it in the response header',
        'is a one-line change that makes every future defect report traceable.',
      ].join('\n'),
    ).not.toEqual([]);
  });
});
