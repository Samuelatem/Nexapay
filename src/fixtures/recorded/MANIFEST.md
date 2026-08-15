# Recorded fixtures — provenance

All files in this directory are **verbatim captures** of the NexaPay demonstration
environment, taken during exploratory testing.

| File | Source request | Captured | HTTP |
|---|---|---|---|
| `transactions.json` | `GET /api/v1/transactions` | 2026-08-15 | 200 |
| `users.json` | `GET /api/v1/users` | 2026-08-15 | 200 |
| `contacts.json` | `GET /api/v1/contacts` | 2026-08-15 | 200 |

Every one of these three calls was issued **without an `Authorization` header and
without a session cookie**, and every one returned `200` with the full payload.
That fact is itself DEF-001 / DEF-002 (see `docs/05-results-analysis.md`).

These fixtures back the `recorded` execution mode (`TEST_MODE=recorded`), which
exists so the suite produces a deterministic report when the demo host is not
reachable from the runner. They are **reference data, not business truth** —
per Annexe F of the brief.
