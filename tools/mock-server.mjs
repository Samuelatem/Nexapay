/**
 * Replay server — the documented fallback required by Annexe J.
 *
 * WHY THIS EXISTS
 * ---------------
 * The demonstration host is not reachable from every runner (corporate egress
 * allow-lists, CI without outbound internet). `TEST_MODE=recorded` points the
 * suite at this server, which replays the payloads captured in
 * src/fixtures/recorded/ byte-for-byte, so a run is reproducible anywhere.
 *
 * THE RULE THIS SERVER OBEYS
 * --------------------------
 *   It replays ONLY what was actually observed. Anything else answers 501
 *   `not_recorded`, and the corresponding tests SKIP.
 *
 * That rule is the whole point, and it cuts both ways:
 *
 *  - It replays the observed behaviour INCLUDING THE DEFECTS. /users and
 *    /contacts answer 200 with no Authorization header here, exactly as they do
 *    on the demo host. A fallback that quietly "fixed" the bug would turn a red
 *    security test green and make the report a lie.
 *
 *  - It never INVENTS behaviour. POST /transfers was never successfully
 *    exercised against the demo host, so this server does not guess at its
 *    validation rules. A naive mock with no validation would fail every
 *    "must be rejected" assertion and manufacture a dozen defects that no one
 *    has evidence for — and, worse, a mock with permissive validation would
 *    make them PASS. Both are fabrication. 501 + skip is the honest answer.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a re-implementation of NexaPay. No business logic, no persistence, no
 * auth. Annexe J is explicit that the candidate is not hired to build the
 * product.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'src', 'fixtures', 'recorded');
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

const transactions = load('transactions.json');
const users = load('users.json');
const contacts = load('contacts.json');

const PORT = Number(process.env.MOCK_PORT ?? 3399);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Everything not observed on the live host lands here. */
function notRecorded(res, what) {
  json(res, 501, {
    error: 'not_recorded',
    detail:
      `"${what}" was never successfully exercised against the demonstration host, ` +
      'so this replay server has no observed behaviour to reproduce. Tests that ' +
      'depend on it skip rather than assert against invented behaviour. ' +
      'Run with TEST_MODE=live against the demo URL to exercise it for real.',
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;

  // ---- Observed: GET /api/v1/transactions --------------------------------
  // Replays the observed filtering semantics AND the observed permissiveness:
  // an unknown `status` yields 200 [] rather than 400 (DEF-009), and `userId`
  // is accepted and ignored (DEF-003). Both are real, both are reproduced.
  if (req.method === 'GET' && path === '/api/v1/transactions') {
    let out = transactions;
    if (q.has('status')) out = out.filter((t) => t.status === q.get('status'));
    if (q.has('category')) out = out.filter((t) => t.category === q.get('category'));
    return json(res, 200, out);
  }

  // ---- Observed: unauthenticated 200s on both directories -----------------
  if (req.method === 'GET' && path === '/api/v1/users') return json(res, 200, users);
  if (req.method === 'GET' && path === '/api/v1/contacts') return json(res, 200, contacts);

  // ---- Observed: 404 on every health probe --------------------------------
  if (['/api/v1/health', '/api/v1/ready', '/api/v1/metrics'].includes(path)) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('');
  }

  // ---- NOT observed -------------------------------------------------------
  if (path === '/api/v1/transfers') {
    return notRecorded(res, `${req.method} /api/v1/transfers`);
  }

  return notRecorded(res, `${req.method} ${path}`);
});

server.listen(PORT, () => {
  process.stdout.write(`replay-server listening on http://127.0.0.1:${PORT}\n`);
  process.stdout.write('  replaying: GET /transactions, /users, /contacts (+404 health probes)\n');
  process.stdout.write('  501 not_recorded: everything else\n');
});
