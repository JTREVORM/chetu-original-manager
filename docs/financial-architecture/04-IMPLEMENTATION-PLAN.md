# Implementation and migration plan

Phase 8. **Nothing in here has been executed.** This is the proposal for review.

Ordering principle from the brief: **data integrity first, financial correctness second, UI third.**
Every migration is additive and forward-only. No existing migration file is edited. No existing
table, column, constraint, policy or row is dropped, renamed, truncated or rewritten.

---

## 1. Pre-flight — before any migration runs

| #   | Step                                                                                                  | Why                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1  | Take a Supabase point-in-time backup / manual snapshot and **record the restore point**               | Only real rollback for a hand-applied estate                                       |
| P2  | Re-run `baseline-controls.sql`, commit the output                                                     | The "before" side of Phase 11                                                      |
| P3  | Confirm the four integrity assertions still return 0                                                  | They did on 2026-09-28; re-check at cut-over                                       |
| P4  | **Decide: balanced ledger (recommended) vs two-column transfers** — §1 of `03-TARGET-ARCHITECTURE.md` | Shapes migrations M2 onward                                                        |
| P5  | Confirm whether Branch Managers may post own-branch expenses                                          | Affects M7 policies only                                                           |
| P6  | Agree the cut-over date and book the physical cash count + bank statement                             | The backfill is meaningless without it                                             |
| P7  | Populate `supabase_migrations.schema_migrations` with the 13 already-applied migrations               | Production has **no** migration history; without this the next change drifts again |

P7 matters more than it looks. It is a pure metadata insert — it changes no application data — and
it is what makes "forward-only migrations" a real guarantee rather than a hope.

---

## 2. Migrations

New files in `supabase/migrations/`, continuing the existing numbering after
`20260101001200_schedule_integrity.sql`. Each is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`)
and wrapped in an explicit transaction.

| #   | File                                      | Contents                                                                                                                                                            | Touches existing data?                                                             |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M1  | `…001300_financial_accounts.sql`          | `financial_accounts` table, enums, indexes, `updated_at` trigger, seed of system control accounts + `LEGACY-UNCLASSIFIED` + `CASH-BUYENDE` + `BANK-MAIN`            | No — new table only                                                                |
| M2  | `…001400_financial_ledger.sql`            | `financial_transactions`, `financial_transaction_lines`, `CM-FT` sequence + number trigger, **deferred balance constraint**, immutability triggers, indexes         | No                                                                                 |
| M3  | `…001500_repayment_allocation.sql`        | Adds `principal_portion`, `interest_portion`, `penalty_portion`, `fee_portion` to `loan_repayments`, all `NOT NULL DEFAULT 0`; backfills from the schedule pro-rata | **Additive columns + backfill of new columns only.** No existing column is written |
| M4  | `…001600_financial_posting_functions.sql` | The `post_*` and `reverse_*` functions, `SECURITY DEFINER`, `SET search_path`, `REVOKE EXECUTE FROM anon`                                                           | No                                                                                 |
| M5  | `…001700_financial_views.sql`             | All views in §5 of the architecture doc, `security_invoker = on`                                                                                                    | No                                                                                 |
| M6  | `…001800_backfill_legacy_financials.sql`  | Posts the 67 historical events to the ledger against `LEGACY-UNCLASSIFIED`; **guarded so it can only run once and only into an empty ledger**                       | Reads existing rows; writes only new ledger rows                                   |
| M7  | `…001900_financial_rls.sql`               | `private.can_see_account()`, `private.can_post_financial()`, RLS on the three new tables, Branch-Manager read on ledger and expenses (closes R7)                    | Adds policies; existing policies untouched                                         |
| M8  | `…002000_ledger_integrity_guards.sql`     | Validation functions + a `v_ledger_health` view (unbalanced transactions, orphan postings, loans with a disbursement but no posting, receipts with no posting)      | No                                                                                 |

**Deliberately not done:** `bank_transactions`, `expenses`, `loans`, `loan_repayments` (beyond M3's
new columns), `member_fees` and `savings_*` keep every existing column and every existing row.
`bank_transactions` becomes a read-only legacy register, surfaced in the UI as such. Retiring it is
a separate decision for a later phase, once the new ledger has been trusted for a full cycle.

### M6 backfill mapping

| Source                                                                         | Count |              Amount | Ledger entry                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ----: | ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank_transactions` capital deposits                                           |     2 |           2,090,000 | `capital_injection`: Dr `LEGACY-UNCLASSIFIED` · Cr `CAPITAL-INTRODUCED`                                                                                                                                         |
| `loans` where `disbursed_at is not null`                                       |    15 | 6,600,000 principal | `disbursement`: Dr `LOANS-RECEIVABLE` 6,600,000 · Cr `LEGACY-UNCLASSIFIED` 5,250,000 · Cr `INC-FEE-PROCESSING` 264,000 · Cr `INC-FEE-CRB` 66,000 · Cr `INC-FEE-GROUP-MAINT` 30,000 · Cr `SECURITY-HELD` 990,000 |
| `loan_repayments`                                                              |    26 |             851,100 | `repayment`: Dr `LEGACY-UNCLASSIFIED` 851,100 · Cr `LOANS-RECEIVABLE` 708,200 · Cr `INC-INTEREST` 142,900                                                                                                       |
| `member_fees`                                                                  |    24 |             240,000 | `fee_collection`: Dr `LEGACY-UNCLASSIFIED` · Cr `INC-FEE-ADMISSION` 120,000 · Cr `INC-FEE-PASSBOOK` 120,000                                                                                                     |
| `expenses`                                                                     |     0 |                   0 | nothing to post                                                                                                                                                                                                 |
| `savings_transactions`, `loan_reversals`, `loan_security_returns`, `transfers` |     0 |                   0 | nothing to post                                                                                                                                                                                                 |

Each backfilled transaction carries `is_legacy = true`, `entry_type` as above, the original
`transaction_date` / `created_at` / `recorded_by` / `branch_id` / reference, and a `source_table` +
`source_id` link back to the row it came from. **Original IDs, receipt numbers, loan numbers,
timestamps, users and audit history are all preserved and none of the source rows is modified.**

Post-backfill `LEGACY-UNCLASSIFIED` balance: `2,090,000 + 851,100 + 240,000 − 5,250,000` =
**−2,068,900**. This is expected and correct — see §6 of the architecture doc. It is resolved by the
physical count and a single signed reconciliation adjustment, not by editing history.

---

## 3. Application changes

### New

| Path                                                     | Purpose                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/financial/accounts.ts`                          | account CRUD + account picker data                                                      |
| `src/lib/financial/ledger.ts`                            | thin wrappers over the `post_*` RPCs; **throws on failure**                             |
| `src/lib/financial/position.ts`                          | reads `v_money_position`, `v_account_balances`, `v_cash_flow`                           |
| `src/lib/financial/reports.ts`                           | the report views, one function each                                                     |
| `src/pages/financial/*`                                  | Accounts & Cash, Transactions, Capital & Funding, Income, Expenses, Reconciliation tabs |
| `src/pages/reports/*`                                    | the 16 new/rebuilt report screens                                                       |
| `src/routes/financial.*.tsx`, `src/routes/reports.*.tsx` | routes (`routeTree.gen.ts` regenerates on build)                                        |
| `src/components/financial/AccountSelect.tsx`             | the account picker every money screen needs                                             |

### Changed

| Path                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Risk                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/context/DatabaseContext.tsx`             | `disburseLoan` → call `post_disbursement(loan, fundingAccount)` and **let it throw**; remove the hand-built `bank_transactions` insert and the `bankTransactions.length + 1` number. `recordRepayment` → call `post_repayment(repayment, receivingAccount)`; write the new allocation columns. `addExpense` → require `source_account_id`. `addBankTransaction` → `post_capital_injection` / `post_internal_transfer`. `undoDisbursement` → `reverse_financial_transaction` (kills R4). `addSavingsTransaction` → insert first, then update balance. Aggregates delegate to `financial/position.ts`. | **High — this is the core file.** Mitigated by the posting functions being transactional and by M8's health view |
| `src/pages/Dashboard.tsx`                     | Money Position panel; operational KPIs unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Low                                                                                                              |
| `src/pages/Reports.tsx`                       | **delete the hard-coded `250000000`**; rebuild P&L on income accounts; rebuild Financial Statement on `account_class`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Low, high value                                                                                                  |
| `src/lib/branchMetrics.ts`                    | `cash` and `portfolio` blocks read `v_branch_financials`; operational blocks unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Medium                                                                                                           |
| `src/pages/BankManagement.tsx`                | becomes the legacy register + redirect to Accounts & Cash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Low                                                                                                              |
| `src/pages/Expenses.tsx`                      | source-account field, required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Low                                                                                                              |
| `src/pages/LoanWaitingDisburse.tsx`           | funding-account field, required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Medium                                                                                                           |
| `src/pages/Collections.tsx`, `Repayments.tsx` | receiving-account field, required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Medium                                                                                                           |
| `src/types/database.types.ts`                 | new financial types; add the missing `business_day_id` on `BankTransaction` / `Expense`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Low                                                                                                              |
| `src/integrations/supabase/types.ts`          | regenerate from the live DB after M1–M8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Low                                                                                                              |
| `src/lib/permissions.ts`                      | new financial permission keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Low                                                                                                              |
| `CLAUDE.md`                                   | correct "eight migrations" → the real count; document the ledger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Low                                                                                                              |

Unchanged and deliberately so: `src/lib/fees.ts` (already a correct single source),
`src/lib/scheduleView.ts` `allocatePayment` (the existing oldest-first rule is preserved exactly),
`src/lib/loanCalculations.ts`, the business-day module, auth, and the RLS in migrations 000100–000200.

---

## 4. Compatibility during rollout

Both models run side by side. The new ledger is written but the old paths keep working:

- `bank_transactions` continues to exist, be readable, and hold its 2 rows.
- `loans.outstanding_balance` and the schedule continue to be maintained exactly as today — the
  ledger is a _parallel_ record, cross-checked by M8's health view, not a replacement for the loan
  book.
- The new `loan_repayments` allocation columns default to 0 and are backfilled, so any code that
  does not know about them is unaffected.
- Screens can be migrated one at a time; each reads either the old aggregate or the new view.
- If the ledger has to be abandoned, dropping the three new tables and the new columns returns the
  system to exactly its present state, because **nothing existing was modified**.

That last property is the whole reason for the additive-only rule, and it holds for every migration
listed.

---

## 5. Risk areas, ranked

| Risk                                                                                                                                                               | Mitigation                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DatabaseContext.tsx` is ~3,000 lines and touches everything                                                                                                       | Change the money paths only; one path per commit; typecheck + build each time                                                      |
| Making `post_disbursement` throw turns a silent failure into a **visible** one — disbursements that used to "succeed" will now fail if the account is wrong        | This is the intent. Needs an operator briefing before cut-over, and a clear error message                                          |
| Backfill run twice                                                                                                                                                 | M6 guarded: aborts unless the ledger is empty; `source_table`+`source_id` uniquely indexed                                         |
| Rounding on the pro-rata principal/interest split                                                                                                                  | Verified on all 26 receipts: the split sums to the receipt exactly. Assert it in M3 and fail the migration if it does not          |
| Officers must now pick an account at every collection                                                                                                              | Default to their branch cash account; make it one tap                                                                              |
| Legacy account never reconciles                                                                                                                                    | By design, and stated plainly on the reports. The §6 cut-over is the answer                                                        |
| No migration history (P7)                                                                                                                                          | Insert the 13 applied entries before starting                                                                                      |
| New `SECURITY DEFINER` functions repeat the advisor findings                                                                                                       | Pin `search_path`, `REVOKE EXECUTE FROM anon` in M4; re-run `get_advisors` after                                                   |
| Writing off a loan zeroes `outstanding_balance` but leaves the schedule's `paid_amount` untouched, so derived and stored outstanding diverge for written-off loans | No written-off loan exists today. Handle it explicitly in `post_writeoff` and exclude written-off loans from the derived assertion |

---

## 6. Phase 9–13 execution order

| Phase | Work                                                                                                                              | Gate                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 9     | M1→M5, M7, M8. App: `financial/` services, Accounts & Cash, Money Position, **delete the 250m**, rebuild P&L                      | Typecheck (`node ./node_modules/typescript/lib/tsc.js --noEmit`), `npm run build`, `npm run lint`; `v_ledger_health` clean |
| 10    | M6 backfill, immediately after a fresh snapshot                                                                                   | Every source row has exactly one posting; every transaction balances; `LEGACY-UNCLASSIFIED` = −2,068,900 exactly           |
| 11    | Re-run `baseline-controls.sql`; compare every line to `01-BASELINE-CONTROL-TOTALS.md`; reconcile the ledger against the loan book | **Zero unexplained differences.** Any difference investigated before proceeding                                            |
| 12    | The 20 workflow tests below, plus permission tests per role                                                                       | All pass                                                                                                                   |
| 13    | Production-readiness report                                                                                                       | Reviewed                                                                                                                   |

Between 10 and 11, management performs the physical cash count and the reconciliation adjustment
(§6 of the architecture doc). The Money Position is not to be published to management until that is
done.

---

## 7. Test plan (Phase 12)

There is **no test runner in this repository** — no Jest, no Vitest, no test files, and `CLAUDE.md`
states verification is by typecheck, build and driving the app. I am not going to claim automated
coverage that does not exist.

**Proposal:** add a `scripts/verify-financials.mjs` in the style of the existing
`scripts/audit-schedules.mjs` / `verify-schedule.mjs` — a service-role script that posts each
scenario against a **scratch branch database** (Supabase branching, not production), asserts the
resulting ledger, and reverses it. That gives the 20 workflows real, repeatable coverage without
introducing a test framework the project has chosen not to have. Say if you would rather I add a
proper runner instead.

Scenarios, each asserted on the resulting ledger lines and on `v_money_position`:

1. Capital → bank · 2. Capital → cash · 3. Bank → cash withdrawal · 4. Cash → bank deposit ·
2. Bank → bank internal transfer · 6. Disbursement funded from bank · 7. Disbursement funded from
   cash · 8. Normal repayment · 9. Partial repayment · 10. Overdue collection · 11. Repayment splitting
   principal + interest · 12. Repayment including a penalty · 13. Expense paid from cash ·
3. Expense paid from bank · 15. Reversal / correction · 16. Branch-scoped transaction ·
4. Account reconciliation · 18. Loan closure · 19. Dashboard refresh after each ·
5. Report totals tie to `v_trial_balance`.

Invariants asserted throughout: every transaction balances; internal transfers move total liquidity
by zero and income by zero; a disbursement reduces liquidity by **net**, not principal; total
assets − liabilities − equity = 0 after the cut-over reconciliation.

Permission tests: for each of Administrator, Branch Manager, Loan Officer, Auditor — attempt to post
each entry type, edit an account, reverse a transaction, read another branch's accounts, and mutate
a posted transaction directly via PostgREST. Every denial must come from the **database**, not the UI.

---

## 8. What I need from you before Phase 9

1. **Ledger model** — balanced ledger (my recommendation) or two-column transfers?
2. **Cut-over date**, and confirmation that a physical cash count and bank statement will be
   available for it.
3. **Branch Manager expense posting** — allowed for their own branch, or Administrator only?
4. **Account seed** — real names for the bank account(s) and any mobile-money/merchant wallets in
   use, or shall I seed generic ones for you to rename?
5. **Penalties** — genuinely new (nothing exists today). Build the capability now, or leave the
   accounts and columns in place and wire the UI later?
6. **Test approach** — the service-role verification script, or a real test runner?
