# Chetu financial architecture programme

Audit, baseline and plan for rebuilding the Financial Ledger, Money Management, Dashboard Financial
Position and Reports on the existing production data.

**Status: Phases 1–15 complete against a test database. Production is untouched and awaits the
manual cut-over steps in the readiness report. Production's schema has been proven byte-identical
to a clean replay of migrations 000000–001200, so all 13 can be recorded in migration history.**

| Document                                                         | Phase    | What it is                                                                                                                                                                               |
| ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-BASELINE-CONTROL-TOTALS.md`](01-BASELINE-CONTROL-TOTALS.md) | 4        | Every control total as at 2026-09-28, with the identities that tie them together                                                                                                         |
| [`baseline-controls.sql`](baseline-controls.sql)                 | 4 / 11   | Re-runnable read-only query producing those totals plus four integrity assertions                                                                                                        |
| [`02-AUDIT.md`](02-AUDIT.md)                                     | 1–3, 5–6 | Root cause of the ledger failure, current architecture, repo-vs-production drift, money-flow traces, risk register, historical-data limitations                                          |
| [`03-TARGET-ARCHITECTURE.md`](03-TARGET-ARCHITECTURE.md)         | 7        | Chart of accounts, ledger model, posting functions, views, cut-over strategy, UI, reports, permissions                                                                                   |
| [`04-IMPLEMENTATION-PLAN.md`](04-IMPLEMENTATION-PLAN.md)         | 8        | The plan as reviewed. Nine migrations were built in the end, not eight — the ninth welds disbursement and its posting into one transaction                                               |
| [`05-PRODUCTION-READINESS.md`](05-PRODUCTION-READINESS.md)       | 9–13     | What was built, migrations, schema, files, backfill results, before/after totals, reconciliation, 138 tests, RLS changes, limitations and the manual cut-over steps                      |
| [`06-PREFLIGHT-VERIFICATION.md`](06-PREFLIGHT-VERIFICATION.md)   | 14       | Migration-history reconciliation against live production, schema-drift proof, PR review findings, remaining test limitations and what Chetu must supply before cut-over                  |
| [`07-HARDENING.md`](07-HARDENING.md)                             | 15       | Closing the direct-write bypasses in the database, atomic settlement and write-off, the two paths that were never wired, the system reset, and the schema dumps served from the web root |

## The short version

The loan book is sound — stored balances agree with the instalment schedule to the shilling on all
16 loans, and every fee identity holds. The money-location layer is not: the ledger records
2,090,000 of capital in and nothing out, while 5,250,000 actually went to borrowers and 1,091,100
came back over the counter. The cause is a row-level-security rejection that the disbursement code
discards without surfacing. Details in the audit.

Those decisions were made and the work is built: a balanced ledger, history backfilled to a
visible Legacy / Unclassified account, Branch Managers able to post their own branch's expenses,
placeholder accounts to rename, penalties as architecture only, and a service-role verification
harness rather than a test framework. See the readiness report for what remains manual.
