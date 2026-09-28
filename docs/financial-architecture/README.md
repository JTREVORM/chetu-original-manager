# Chetu financial architecture programme

Audit, baseline and plan for rebuilding the Financial Ledger, Money Management, Dashboard Financial
Position and Reports on the existing production data.

**Status: Phases 1–8 complete. Awaiting review. No production change has been made.**

| Document | Phase | What it is |
| --- | --- | --- |
| [`01-BASELINE-CONTROL-TOTALS.md`](01-BASELINE-CONTROL-TOTALS.md) | 4 | Every control total as at 2026-09-28, with the identities that tie them together |
| [`baseline-controls.sql`](baseline-controls.sql) | 4 / 11 | Re-runnable read-only query producing those totals plus four integrity assertions |
| [`02-AUDIT.md`](02-AUDIT.md) | 1–3, 5–6 | Root cause of the ledger failure, current architecture, repo-vs-production drift, money-flow traces, risk register, historical-data limitations |
| [`03-TARGET-ARCHITECTURE.md`](03-TARGET-ARCHITECTURE.md) | 7 | Chart of accounts, ledger model, posting functions, views, cut-over strategy, UI, reports, permissions |
| [`04-IMPLEMENTATION-PLAN.md`](04-IMPLEMENTATION-PLAN.md) | 8 | Eight forward-only migrations, backfill mapping, file-by-file app changes, compatibility, risks, test plan, open questions |

## The short version

The loan book is sound — stored balances agree with the instalment schedule to the shilling on all
16 loans, and every fee identity holds. The money-location layer is not: the ledger records
2,090,000 of capital in and nothing out, while 5,250,000 actually went to borrowers and 1,091,100
came back over the counter. The cause is a row-level-security rejection that the disbursement code
discards without surfacing. Details in the audit.

Six decisions are needed before Phase 9 — see §8 of the implementation plan.
