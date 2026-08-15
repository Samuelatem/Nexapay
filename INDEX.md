# NexaPay — QA Automation Senior assessment

Samuel, 15 August 2026. Environment: `http://149.56.128.57:3200`

**Start with `HOW-TO-RUN.md`.** Two things need doing before this is sent.

## Recommendation: No-Go

The transfer journey cannot be completed through the UI, the balance on screen
does not match the ledger, and the demo has no real backend, so no server-side
rule can be checked at all.

## Documents

| | |
|---|---|
| `deliverables/06-go-no-go.pdf` | The recommendation, one page. Read first |
| `deliverables/08-live-verification.pdf` | The live browser pass, and the two conclusions it corrected |
| `deliverables/09-evidence-log.pdf` | What was observed, with the actual figures |
| `deliverables/01-context-analysis.pdf` | Phase 1: journeys, risks, assumptions |
| `deliverables/02-test-strategy.pdf` | Phase 2: scope, levels, environments, CI |
| `deliverables/03-test-design.pdf` | Phase 3: the 10 scenarios |
| `deliverables/04-po-questions.pdf` | The five questions |
| `deliverables/05-results-analysis.pdf` | Phase 5: annexes F to I, defect reports |
| `deliverables/07-ai-usage.pdf` | **Needs writing before sending** |
| `deliverables/README.pdf` | Phase 4: the automation readme |

## Product defects, verified in the browser

| ID | Severity | What |
|---|---|---|
| DEF-013 | Critical | Transfer form submit does nothing. No request, no toast, no error |
| DEF-010 | Critical | Dashboard $48,291.00, transactions page $50,563.80, ledger -$389.66. Income and Expenses static. Dashboard stale until hard reload |
| DEF-014 | Critical | PIN sent and stored in clear text |
| DEF-015 | Major | Plain HTTP, so `crypto.subtle` is unavailable and R08 cannot be built as written |
| DEF-004 | Major | `id` integer not UUID, `status` missing. Contract breach |
| DEF-017 | Minor | No transfer type preselected, and nothing tells you one is required |

Six further findings, including the unauthenticated reads, belong to the
`json-server` fixture behind the demo rather than to the product. That
distinction is set out in `08-live-verification.md`.

## Corrections to the existing suite in Annexe H

TC-04 waits for `data-testid=row`. The app renders `tx-row`, so the wait can
never succeed. Because the runner aborts there, the tests after it in that file
never run, which is why the report totals 11 while listing TC-01 to TC-12 with no
TC-10.

TC-02 hard-codes an expected date the request never asked for, and never checks
the POST status. There may be a timezone bug behind it, but the test has to be
fixed first.

## What works

Route guard on `#/admin`, R02 and R03 form validation, status filters
partitioning correctly at 15/10/3/2, pagination, row rendering.

## Annexe L checklist

- [x] Seven required deliverables, plus two supplementary
- [x] Readme runs in under five minutes
- [x] Execution report attached, HTML plus JUnit plus JSON
- [x] No real secret in the repo. `.env` git-ignored, gitleaks in CI
- [ ] **AI declaration — to write, see `HOW-TO-RUN.md`**
- [x] Explicit Go / No-Go
- [x] Complete defect reports
- [x] Named correctly
