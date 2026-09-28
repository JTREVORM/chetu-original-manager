# Production readiness report

Phases 9–12 are complete **against a test database**. Nothing has been applied to production:
the live Supabase project has been read only, and its schema and data are untouched.

**Date:** 2026-09-28 · **Branch:** `claude/vigilant-tesla-ewjuj3` · **Production project:**
`xfkuptxrrnzumzmulblg` (unchanged)

---

## 1. What changed

Chetu's financial ledger now works the way the brief asked: every financial event has to explain
both where the money came from and where it went, and it cannot half-happen.

The failure that started this — a Loan Officer disbursing a loan, the ledger insert being rejected
by row level security, and the error being discarded — is closed three ways at once:

1. **Permission.** `post_disbursement` checks the _loan's_ permission, not the ledger's, so
   whoever may disburse may post. Nobody writes the ledger by hand at all.
2. **Atomicity.** `disburse_loan` marks the loan, closes the application and posts the journal in
   one transaction. If the funding account is wrong, nothing happens.
3. **Visibility.** Nothing swallows an error. A failed posting raises, the operator sees the
   database's own sentence, and `v_ledger_health` reports any loan, receipt or expense that ends
   up without a journal.

A disbursement now posts what it actually is:

```
Dr  Loans Receivable                300,000    the member owes the principal
  Cr  Cash / Bank                             238,000   what left the branch
  Cr  Processing / CRB / Group fee income      17,000   retained, and earned
  Cr  Member Security Deposits                 45,000   held, and owed back
```

The old code posted 300,000 against a single unnamed bank, which would have understated liquidity
by 62,000 per loan and lost the fees and the security entirely.

---

## 2. Migrations created

Nine, forward-only. No existing migration was edited.

| File                                     | What it adds                                                                                                       | Touches existing data?                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `…001300_financial_accounts.sql`         | `financial_accounts`; control accounts, expense categories matched to the app's own union, and three real accounts | No                                            |
| `…001400_financial_ledger.sql`           | `financial_transactions` + `financial_transaction_lines`, the balance constraint, immutability, numbering          | No                                            |
| `…001500_repayment_allocation.sql`       | Four allocation columns on `loan_repayments`, backfilled and asserted                                              | Adds columns; fills only those columns        |
| `…001600_financial_posting.sql`          | `post_*` functions, `reverse_financial_transaction`, the `private.*` helpers                                       | No                                            |
| `…001700_financial_views.sql`            | 14 reporting views                                                                                                 | No                                            |
| `…001800_backfill_legacy_financials.sql` | Reconstructs every provable historical event                                                                       | Reads existing rows; writes only new journals |
| `…001900_financial_rls.sql`              | RLS; Branch Manager access; closes the legacy register                                                             | Replaces expense/bank policies                |
| `…002000_financial_integrity.sql`        | `v_ledger_health`, `account_reconciliations`, cut-over date                                                        | Adds two settings columns                     |
| `…002100_atomic_disbursement.sql`        | `disburse_loan`, `record_loan_repayment`, `undo_loan_disbursement`, `undo_loan_repayment`, `record_expense`        | No                                            |

**Nothing is dropped, renamed, truncated or rewritten.** `bank_transactions` keeps both rows,
`loans` and `loan_repayment_schedule` are not modified at all, and every existing id, receipt
number, loan number, timestamp, user and branch is preserved.

---

## 3. Schema changes

**New tables:** `financial_accounts`, `financial_transactions`, `financial_transaction_lines`,
`account_reconciliations`.

**New columns:** `loan_repayments.principal_portion`, `.interest_portion`, `.penalty_portion`,
`.fee_portion`, `.allocation_source`; `settings.financial_cutover_date`,
`.financial_cutover_completed`. All additive with defaults.

**New views (15):** `v_account_balances`, `v_money_position`, `v_loan_portfolio`,
`v_repayment_allocation`, `v_transaction_audit`, `v_account_ledger`, `v_trial_balance`,
`v_income_statement`, `v_financial_position`, `v_cash_flow`, `v_par_ageing`, `v_branch_financials`,
`v_officer_performance`, `v_borrower_statement`, `v_ledger_health`, `v_account_reconciliation`.
All `security_invoker`, so row level security follows the caller.

**New functions (22):** the twelve `post_*` / `reverse_*` functions, five atomic operation
functions, `record_account_reconciliation`, and the `private` helpers `can_post_financial`,
`can_see_account`, `account_by_code`, `assert_postable_account`, `write_journal`.

**Key constraint:** every journal's debits and credits must sum to zero, enforced by a deferred
constraint trigger. An unbalanced journal cannot commit. Posted journals are immutable — corrected
only by a reversal that references them.

**Also fixed while there:** `block_audit_mutation` and `block_audit_log_update` had caller-mutable
`search_path`, which the Supabase linter had been reporting since before this work.

---

## 4. Files changed

**New (13):** `src/lib/financial/ledger.ts`, `src/lib/financial/reports.ts`,
`src/components/financial/AccountSelect.tsx`, `src/pages/financial/FinancialLedger.tsx`,
`src/pages/financial/LedgerModals.tsx`, `src/pages/reports/financialReportData.ts`,
`FinancialPosition.tsx`, `CashFlowReport.tsx`, `LoanPortfolioReport.tsx`, `CollectionsReport.tsx`,
`ArrearsAgeing.tsx`, `IncomeExpenseReports.tsx`, `LedgerReports.tsx`, plus 16 route files.

**Changed (10):** `DatabaseContext.tsx` (all money paths), `Dashboard.tsx` (Money Position),
`Reports.tsx` (250m removed, P&L rebuilt), `BankManagement.tsx` (legacy register),
`Expenses.tsx`, `Collections.tsx`, `LoanSettlement.tsx`, `LoanWaitingDisburse.tsx` (account
pickers), `database.types.ts`, `Sidebar.tsx`, `ReportsIndex.tsx`.

**Deliberately unchanged:** `src/lib/fees.ts` (already a correct single source),
`scheduleView.ts`'s `allocatePayment` — Chetu's oldest-due-date-first rule is preserved exactly,
not reinvented — `loanCalculations.ts`, the business-day module, auth, and migrations 000000–001200.

---

## 5. Backfill results (test database, production shape)

The seed reproduces production's control totals exactly, so these are what production will produce.

Until the pre-flight verification it did not, quite. The seed built each instalment on an even
split, where production floors principal and interest to whole hundreds; the backfill splits every
receipt by its instalment's own ratio, so the harness came out UGX 1,050 away from production on
Loans Receivable and the same amount the other way on interest income. The seed now reproduces
production's rounding, and the two agree line for line. §6 was always read off production and was
always right; this table is what changed.

| Journal type       |  Count |               Value |
| ------------------ | -----: | ------------------: |
| Capital injection  |      2 |           2,090,000 |
| Disbursement       |     15 | 6,600,000 principal |
| Repayment          |     26 |             851,100 |
| Member fees        |     24 |             240,000 |
| Expense            |      0 |                   — |
| **Total journals** | **67** |                     |

Resulting account balances:

| Account                                |                   Balance |
| -------------------------------------- | ------------------------: |
| LOANS-RECEIVABLE                       |                 5,891,800 |
| SECURITY-HELD (liability)              |                   990,000 |
| CAPITAL-INTRODUCED (equity)            |                 2,090,000 |
| INC-INTEREST                           |                   142,900 |
| INC-FEE-PROCESSING / CRB / GROUP-MAINT | 264,000 / 66,000 / 30,000 |
| INC-FEE-ADMISSION / PASSBOOK           |         120,000 / 120,000 |
| **LEGACY-UNCLASSIFIED**                |            **−2,068,900** |

Every backfilled journal carries `source_table` + `source_id`, so it traces to the row it was
reconstructed from and re-running the migration posts nothing.

---

## 6. Before / after control totals

Re-derived from **production, read-only**, using the same arithmetic the migration uses.

| Control                                            |  Before (audit) |  After (predicted) |       Difference |
| -------------------------------------------------- | --------------: | -----------------: | ---------------: |
| Capital introduced                                 |       2,090,000 |          2,090,000 |                0 |
| Principal disbursed                                |       6,600,000 |          6,600,000 |                0 |
| Net cash to members                                |       5,250,000 |          5,250,000 |                0 |
| Total collected                                    |         851,100 |            851,100 |                0 |
| Principal collected                                |         708,200 |            708,200 |                0 |
| Interest collected                                 |         142,900 |            142,900 |                0 |
| Loans receivable                                   |       5,891,800 |          5,891,800 |                0 |
| Interest receivable                                |       1,177,100 |          1,177,100 |                0 |
| Security held                                      |         990,000 |            990,000 |                0 |
| Member fees                                        |         240,000 |            240,000 |                0 |
| Fee income recognised                              |         360,000 |            360,000 |                0 |
| Expenses                                           |               0 |                  0 |                0 |
| Arrears / PAR 30                                   |               0 |                  0 |                0 |
| Branch totals (single branch)                      |       unchanged |          unchanged |                0 |
| **Legacy / Unclassified**                          |             n/a |     **−2,068,900** |   new, by design |
| "Bank Liquidity" on the Financial Statement report | **252,090,000** |    0 until counted | **−252,090,000** |
| "Revenue" on the P&L                               |     **851,100** | **742,900** income |         −108,200 |

Two differences are intended and are the point of the work:

- **The 252,090,000 disappears.** It was the hard-coded `250000000` plus the register. No
  production money changes; a fabricated figure stops being printed.
- **The P&L falls from 851,100 to 742,900** — and means something different. The old number was
  every shilling collected. The new one is 142,900 interest + 360,000 loan fees + 240,000 member
  fees; the 708,200 of returned principal is correctly a balance-sheet movement.

The legacy balance of −2,068,900 is the historical funding gap, not a new liability:
`2,090,000 capital + 851,100 collected + 240,000 fees − 5,250,000 disbursed`. It is exposed on its
own account rather than hidden.

---

## 7. Reconciliation results (test database)

| Check                                               | Result         |
| --------------------------------------------------- | -------------- |
| Every journal balances                              | ✔ 0 unbalanced |
| No journal without lines                            | ✔              |
| Every disbursement has a journal                    | ✔              |
| Every receipt has a journal                         | ✔              |
| Every expense has a journal                         | ✔              |
| Allocation sums to amount paid on every receipt     | ✔              |
| Ledger agrees with the loan book                    | ✔              |
| No duplicate source postings                        | ✔              |
| Trial balance balances                              | ✔ Dr = Cr      |
| Assets = Liabilities + Equity + (Income − Expenses) | ✔              |
| Net worth = capital + net result                    | ✔ 2,831,850    |
| Cash-flow movements equal liquid balances           | ✔              |
| Money Position liquidity = sum of liquid accounts   | ✔              |
| Portfolio = principal + interest receivable         | ✔              |
| `v_ledger_health`                                   | ✔ empty        |

---

## 8. Tests

**138 assertions, all passing.** `scripts/financial-verify/run.sh` rebuilds a throwaway database,
applies the 13 existing migrations, seeds production's exact control totals, applies the 9 new
ones so the backfills run over realistic data, and runs the suite. It refuses to run against a
database whose name suggests production, and `scripts/verify-financials.mjs` refuses the project
ref in `.env`.

| Area                               |        Passed |
| ---------------------------------- | ------------: |
| Journal balance                    |             5 |
| Capital (workflows 1, 2)           |             4 |
| Internal transfers (3, 4, 5)       |             6 |
| Disbursement (6, 7)                |            10 |
| Duplicate posting prevention       |             1 |
| Principal/interest allocation (11) |             3 |
| Repayment (8, 9)                   |             6 |
| Overdue collection (10)            |             3 |
| Penalty (12)                       |             3 |
| Expenses (13, 14)                  |             6 |
| Reversal (15)                      |             8 |
| Immutability                       |             4 |
| Reconciliation (17)                |             8 |
| Cut-over                           |             4 |
| Loan closure (18)                  |             3 |
| Write-off                          |             3 |
| Branch transaction (16)            |             3 |
| Permissions                        |            14 |
| Atomicity                          |            30 |
| Reports and dashboard (19, 20)     |            14 |
| **Total**                          | **138 / 138** |

Three real bugs the suite caught and I fixed before committing:

1. A posted journal's `description` was editable. It is immutable now.
2. Several reconciliations recorded in one transaction ordered non-deterministically, because
   `now()` is the transaction timestamp. Switched to `clock_timestamp()`.
3. The ledger net-worth figure read the loan book instead of the ledger, so the two could differ
   silently. It reads the ledger; the management figure is published separately and the gap named.

And two found by the atomicity tests:

4. The idempotency index held a source slot even after a reversal, so **a loan disbursed in error
   could never be disbursed again**. The index now excludes reversed journals.
5. A rollback that deletes its receipt was blocked by the journal's foreign key. It now sets null
   and keeps the posting as evidence.

`node ./node_modules/typescript/lib/tsc.js --noEmit` clean · `npm run build` succeeds ·
`npm run lint` at 75 problems against a 79 baseline (none in the new files).

---

## 9. Security and RLS changes

| Change                              | Effect                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `financial_transactions` / `_lines` | **No write policy at all.** Direct INSERT/UPDATE/DELETE revoked from `authenticated`. Money moves only through the posting functions.                                                                                                                          |
| `financial_accounts`                | Everyone signed in may read the chart (an officer must pick a till). Only Administrators create, rename or close. System accounts cannot be repointed or deleted.                                                                                              |
| `expenses`                          | **Branch Managers can now see and post their own branch's expenses**, which they could not before — read was `is_admin_or_auditor()`. Administrators everywhere; Loan Officers never; a Branch Manager cannot post another branch's expense or move it to one. |
| `bank_transactions`                 | Closed. No write policy, plus a trigger that raises a clear message pointing at the posting functions rather than failing silently. Reads widened to Branch Managers.                                                                                          |
| Auditors                            | Unchanged: read everything, write nothing. Tested explicitly.                                                                                                                                                                                                  |
| Advisor hygiene                     | Every new function pins `search_path` and has EXECUTE revoked from `anon`; trigger functions are not callable as RPCs. The two pre-existing mutable-`search_path` functions are fixed.                                                                         |

Permission tests prove, from the database rather than the interface: a Loan Officer **can** post a
disbursement journal but cannot record capital, transfer money, post an expense or reverse
anything; a Branch Manager can post their own branch's expense but not another's, and not capital;
an Auditor can post nothing; and **even an Administrator cannot write the ledger directly**.

---

## 10. Remaining limitations

- **The legacy account will not reconcile, and should not.** −2,068,900 is the measure of how much
  cash movement was never located. Only a physical count can resolve it.
- **Penalties are architecture, not feature.** `INC-PENALTY` and `PENALTY-RECEIVABLE` exist and are
  proven to work; no penalty logic is wired into collections and no historical penalty was
  invented. Production's `penalty_rate` is still read by nothing.
- **Interest is recognised when collected**, not accrued. The balance sheet therefore excludes
  contracted-but-unearned interest; the dashboard shows it separately and names the difference.
- **The test seed's per-week rounding used to differ from production's — it no longer does.**
  Production floors each instalment and its interest to a whole 100 and hands the leftover
  hundreds to the earliest weeks; the seed divided evenly, which put the harness at
  709,250 / 141,850 against production's 708,200 / 142,900. Since the receipts Chetu has taken
  all land on early instalments, that 1,050 fell straight into the opening Loans Receivable the
  harness was supposed to be proving. The seed now reproduces production's rule, and the harness
  reports 5,891,800 receivable and 142,900 interest — the §6 figures exactly.
- **Savings remains unwired.** All 25 accounts are zero and the module is unused, so savings
  transactions do not yet post to the ledger. Straightforward to add when Chetu uses it.
- **Supabase branching was unavailable** through this session's tooling, so testing ran against a
  local PostgreSQL 16 cluster with a Supabase-compatible shim. Production is 17.6; nothing used is
  version-sensitive, but a branch run before go-live would remove the assumption.

---

## 11. Manual steps required before and at go-live

These need a human; none of them can or should be automated.

1. **Take a snapshot** of the production project and record the restore point.
2. **Record the 13 already-applied migrations** in `supabase_migrations.schema_migrations`.
   Production has _no_ migration history — it is all hand-applied — and without this the next
   change drifts the same way.
3. **Apply the 9 migrations in order**, `…001300` through `…002100`. Each validates itself and
   aborts rather than leaving a wrong ledger.
4. **Re-run `baseline-controls.sql`** and compare against §6. Every line must match.
5. **Check `v_ledger_health` is empty.** If it is not, stop.
6. **Rename the seeded accounts.** `Main Bank Account` and `Head Office Cash` are placeholders —
   production has never recorded which bank Chetu uses, so inventing one would be a fabrication.
   Add the real bank, any branch tills, and mobile-money or merchant accounts actually in use.
7. **Count the cash and read the bank statement** on the cut-over date, and enter each account's
   opening balance under Financial Ledger → Reconciliation.
8. **Post the residual** against Legacy / Unclassified as one signed reconciliation adjustment
   with a reason. It stays visible in the ledger and the reports forever.
9. **Set `settings.financial_cutover_completed = true`** once that is done.
10. **Brief the operators before cut-over.** Disbursement, collection and expense now require an
    account, and a wrong account now _fails_ where it used to silently succeed. That is the
    intended behaviour and staff should hear it from a person, not from an error message.
11. **Regenerate `src/integrations/supabase/types.ts`** from the live database after the
    migrations land.
12. Optionally, remove `public/schema_restore.sql` and `public/schema_test.sql` — schema dumps
    served from the web root of a public repository, noted in the audit.
