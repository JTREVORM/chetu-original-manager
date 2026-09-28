# Target financial architecture

Phase 7. This describes what the system becomes and, critically, **how it sits on top of the data
that already exists**. Nothing here requires reinterpreting a single historical record.

The question management must be able to answer in one glance is _"where is Chetu's money right
now?"_ — and the answer has to survive being checked.

---

## 1. Design decision: a balanced ledger, not a balance column

### The choice

|                                              | A. Two-column transfers                                               | B. **Balanced ledger (recommended)**                               |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Shape                                        | one row with `from_account_id` / `to_account_id`                      | header + 2..n lines that must sum to zero                          |
| Disbursement                                 | needs 3 linked rows to express cash + fee income + security liability | one transaction, four lines                                        |
| Split repayment                              | needs 3 linked rows                                                   | one transaction, four lines                                        |
| Reversal                                     | reverse each row and hope none is missed                              | reverse the header; lines follow                                   |
| P&L / Balance Sheet / Cash Flow              | hand-assembled per report                                             | fall out of the account classes                                    |
| "Internal transfers must not inflate income" | enforced by convention                                                | **structurally impossible** — a transfer touches no income account |
| Cost                                         | lower                                                                 | one extra table, one balance constraint                            |

**Recommendation: B.** A disbursement is genuinely a four-legged event and the brief asks for a
Balance Sheet, a P&L and a Cash Flow that excludes internal transfers. Option A can be made to
produce those, but only by re-deriving in each report — which is the duplication this programme
exists to remove. Option B makes every one of those reports a `GROUP BY account_class` over a
single table.

This is the one decision I would like confirmed before implementation, because it shapes everything
downstream. If you prefer A for simplicity, say so and I will re-plan §3 onward around it — the
migration, backfill and reconciliation strategy are unaffected either way.

### Why a disbursement needs four legs

Take CM-LN-2026-0002 exactly as it stands in production:

```
Dr  Loans Receivable                     300,000     ← the member now owes this
  Cr  Cash / Bank (funding account)                  238,000   ← what actually left the branch
  Cr  Fee Income — Processing                         12,000
  Cr  Fee Income — CRB                                 3,000
  Cr  Fee Income — Group Maintenance                   2,000
  Cr  Security Deposits Held (liability)              45,000   ← refundable to the member
                                         -------     -------
                                         300,000     300,000
```

Liquidity falls by 238,000, not 300,000. Loans receivable rises by 300,000. Income of 17,000 is
recognised. A 45,000 obligation to the member is created. **All four facts are already in the
`loans` row today** — they simply have nowhere to be posted. Nothing is invented.

---

## 2. Chart of accounts — `financial_accounts`

Accounts are **configured, not hard-coded**. The seed below is a starting set; Administrators add
branches, banks and wallets through the UI.

| Column                                    | Notes                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `account_code`, `account_name`      | code unique, e.g. `CASH-BUYENDE`, `BANK-STANBIC-01`                                                                                                                                                          |
| `account_type`                            | `cash_at_hand`, `cashier_till`, `branch_cash`, `bank`, `mobile_money`, `merchant`, `loans_receivable`, `interest_receivable`, `penalty_receivable`, `security_held`, `capital`, `income`, `expense`, `other` |
| `account_class`                           | `asset_liquid`, `asset_receivable`, `liability`, `equity`, `income`, `expense` — **this is what the reports group by**                                                                                       |
| `branch_id`                               | nullable = institution-wide                                                                                                                                                                                  |
| `institution`, `account_reference`        | bank name / wallet provider, account or wallet number                                                                                                                                                        |
| `opening_balance`, `opening_balance_date` | set once at cut-over from a physical count or statement                                                                                                                                                      |
| `currency`                                | default `UGX`                                                                                                                                                                                                |
| `status`                                  | `active`, `dormant`, `closed`                                                                                                                                                                                |
| `is_system`                               | true for control accounts the UI must not delete                                                                                                                                                             |
| `is_legacy`                               | true only for `LEGACY-UNCLASSIFIED`                                                                                                                                                                          |
| `allow_manual_posting`                    | false on control accounts — you cannot hand-journal Loans Receivable                                                                                                                                         |
| `sort_order`, `created_*`, `updated_*`    |                                                                                                                                                                                                              |

**There is no `current_balance` column.** Balance is `opening_balance + Σ lines`, served by a view.
That is the whole point: no stored total can drift if no stored total exists.

Seeded control accounts (`is_system = true`): `LOANS-RECEIVABLE`, `INTEREST-RECEIVABLE`,
`PENALTY-RECEIVABLE`, `SECURITY-HELD`, `CAPITAL-INTRODUCED`, `INC-INTEREST`, `INC-FEE-PROCESSING`,
`INC-FEE-CRB`, `INC-FEE-GROUP-MAINT`, `INC-FEE-ADMISSION`, `INC-FEE-PASSBOOK`, `INC-PENALTY`,
`INC-OTHER`, `EXP-*` (one per existing `ExpenseCategory`), `WRITEOFF-LOSS`, and
`LEGACY-UNCLASSIFIED`.

Seeded real accounts for the live branch: `CASH-BUYENDE` (branch cash) and `BANK-MAIN`, both
opening at zero until reconciled — see §6.

---

## 3. The ledger — `financial_transactions` + `financial_transaction_lines`

### Header: one row per business event

`transaction_number` (DB sequence, `CM-FT-YYYY-NNNN`), `transaction_date`, `entry_type`,
`branch_id`, `description`, `reference_number`, `business_day_id`, `status`
(`posted` / `reversed` / `reversal`), `reversal_of_id`, `reversal_reason`,
`approval_status` / `approved_by` / `approved_at`, `created_by`, `created_at`,
`is_legacy`, and the links back to the source record — `loan_id`, `repayment_id`, `expense_id`,
`member_fee_id`, `security_return_id`, `source_table`, `source_id`.

`entry_type` ∈ `capital_injection`, `capital_withdrawal`, `disbursement`, `repayment`,
`fee_collection`, `expense`, `internal_transfer`, `security_refund`, `writeoff`, `other_income`,
`reconciliation_adjustment`, `opening_balance`, `legacy_backfill`, `reversal`.

### Lines: what moved, where

`transaction_id`, `line_no`, `account_id`, `direction` (`debit`/`credit`), `amount > 0`,
`memo`, plus a generated `signed_amount`.

**Invariant, enforced by a deferred constraint trigger:** for every transaction,
`Σ debits = Σ credits`, and there are at least two lines. A transaction that does not balance
cannot be committed. This is the guarantee that replaces every stored balance in the system.

### Immutability

Posted transactions are **never updated or deleted**. A correction is a `reversal` transaction
carrying `reversal_of_id`, with the original's lines negated, plus (if needed) a fresh correct
transaction. A trigger blocks `UPDATE` of financial fields and all `DELETE` on posted rows, in the
same spirit as `block_audit_log_update`. This makes R4 — the phantom contra-deposit — structurally
impossible: you can only reverse a transaction that exists.

---

## 4. Posting functions — the only way money moves

All money writes go through `SECURITY DEFINER` functions with `SET search_path = public, private,
pg_temp`, each re-checking the caller's role and the business-day guard, each writing header and
lines in one statement. Direct `INSERT` into the ledger tables is denied to `authenticated` by RLS.

| Function                                                      | Legs                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_capital_injection(account, amount, date, ref, note)`    | Dr account · Cr `CAPITAL-INTRODUCED`                                                                                                                            |
| `post_disbursement(loan_id, funding_account_id)`              | Dr `LOANS-RECEIVABLE` (principal) · Cr funding (net) · Cr the three fee-income accounts · Cr `SECURITY-HELD`                                                    |
| `post_repayment(repayment_id, receiving_account_id)`          | Dr receiving (full amount) · Cr `LOANS-RECEIVABLE` (principal part) · Cr `INC-INTEREST` (interest part) · Cr `INC-PENALTY` (penalty part, when penalties exist) |
| `post_member_fee(member_fee_id, receiving_account_id)`        | Dr receiving · Cr `INC-FEE-ADMISSION` / `INC-FEE-PASSBOOK`                                                                                                      |
| `post_expense(expense_id, source_account_id)`                 | Dr `EXP-<category>` · Cr source account                                                                                                                         |
| `post_internal_transfer(from, to, amount, date, ref, note)`   | Dr to · Cr from — **touches no income or expense account, so it cannot inflate either**                                                                         |
| `post_security_refund(security_return_id, source_account_id)` | Dr `SECURITY-HELD` · Cr source                                                                                                                                  |
| `post_writeoff(loan_id)`                                      | Dr `WRITEOFF-LOSS` · Cr `LOANS-RECEIVABLE` (+ `INTEREST-RECEIVABLE`)                                                                                            |
| `post_reconciliation_adjustment(account, amount, reason)`     | Administrator only, always visible in reports as an adjustment                                                                                                  |
| `reverse_financial_transaction(tx_id, reason)`                | mirrors every line of the original                                                                                                                              |

**This is also the fix for R1.** `post_disbursement` is `SECURITY DEFINER`, so a Loan Officer who is
permitted to disburse can post the ledger entry without being an Administrator — and because the
function raises on failure rather than returning an ignorable error, a rejected posting **fails the
disbursement** instead of vanishing. A disbursement will no longer be able to succeed without its
ledger entry.

---

## 5. Views — one source of truth for every screen

| View                     | Purpose                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v_account_balances`     | per account: opening, inflows, outflows, **current balance**, last transaction, reconciliation state                                                                                                                                                   |
| `v_money_position`       | Cash at Hand · Cash at Bank · Mobile Money/Merchant · **Total Available Liquidity** · Outstanding Principal · Interest Receivable · Penalties Receivable · **Total Loan Portfolio** · Overdue Portfolio · Security Held · **Total Financial Position** |
| `v_loan_portfolio`       | per loan: principal outstanding, interest outstanding, days past due, PAR bucket, branch, officer, product                                                                                                                                             |
| `v_repayment_allocation` | per receipt: principal / interest / penalty / fee split                                                                                                                                                                                                |
| `v_cash_flow`            | opening → capital → collections (split) → other income → disbursements → expenses → **transfers shown separately and netted to nil** → closing                                                                                                         |
| `v_trial_balance`        | every account, debits, credits, balance — the thing you check when a report looks wrong                                                                                                                                                                |
| `v_income_statement`     | income accounts − expense accounts = net result, principal movement structurally excluded                                                                                                                                                              |
| `v_financial_position`   | assets / liabilities / equity by `account_class`                                                                                                                                                                                                       |
| `v_par_ageing`           | 1–7 · 8–30 · 31–60 · 61–90 · 90+ with loan counts, overdue principal, overdue interest, PAR%                                                                                                                                                           |
| `v_branch_financials`    | liquidity, disbursements, collections, portfolio, arrears, income, expenses per branch                                                                                                                                                                 |
| `v_officer_performance`  | portfolio, disbursed, expected, actual, overdue, borrowers, collection rate                                                                                                                                                                            |
| `v_borrower_statement`   | full member history across loans, schedule, receipts, splits, balances                                                                                                                                                                                 |

Every view is RLS-respecting (`security_invoker`), so a Loan Officer reading `v_money_position`
sees their scope and nothing more.

**Application side:** one new `src/lib/financial/` service reads these views and is the _only_
place the UI gets a financial number. `DatabaseContext`'s aggregates, `branchMetrics.ts`'s `cash`
and `portfolio` blocks, and `Reports.tsx`'s inline reduces all delegate to it. That retires R9 (three
divergent period definitions) by deleting two of the three engines rather than reconciling them.

---

## 6. The cut-over — how history and reality are joined

This is the part that must not be fudged.

1. **Backfill to `LEGACY-UNCLASSIFIED`.** Every historical event is posted with its real amount,
   date, actor, branch, reference and source link — but its _cash_ leg points at the legacy account,
   because the system never recorded where the cash was. All non-cash legs (loans receivable, fee
   income, security held, capital) are **fully accurate**, because those were always derivable.
2. **After backfill, `LEGACY-UNCLASSIFIED` will show a large negative balance** (roughly
   −2,068,900: 2,090,000 + 851,100 + 240,000 in, 5,250,000 out). _That is the correct output._ It is
   the honest measure of how much cash movement was never located. It must be displayed, not hidden.
3. **Management performs a physical count** — cash in the till, bank statement balance, mobile-money
   float — on a chosen cut-over date.
4. **Those counts are entered as opening balances** on the real accounts, with
   `opening_balance_date` = cut-over date.
5. **The residual is posted once** as a `reconciliation_adjustment` against `LEGACY-UNCLASSIFIED`,
   signed by an Administrator, with a reason. It stays in the ledger forever and appears as its own
   line in the Cash Flow and Financial Position reports.
6. **From cut-over, every screen requires an account.** Disbursement asks which account funds it;
   collection asks which account receives it; expense asks which account pays it; capital asks where
   it lands. `LEGACY-UNCLASSIFIED` is closed to new postings (`allow_manual_posting = false`).

Historical figures are never rewritten to make a report balance. The gap is shown as a gap.

---

## 7. Financial Ledger UI

```
Accounts & Cash │ Transactions │ Capital & Funding │ Income │ Expenses │ Reconciliation │ Reports
```

- **Accounts & Cash** — account, type, branch, opening, inflows, outflows, **current balance**, last
  transaction, reconciliation state; drill through to that account's full ledger.
- **Transactions** — number, date/time, type, source account, destination/category, amount, branch,
  related loan/receipt/expense, reference, description, created by, approval, reversal status,
  audit. Filterable on every one of those.
- **Capital & Funding** — injections and withdrawals with source, destination account, branch, date.
- **Income** — interest, penalties, processing, CRB, group maintenance, admission, passbook, other,
  each traceable to its postings.
- **Expenses** — by category, branch, **account used**, date, staff, approval.
- **Reconciliation** — system balance vs counted/statement balance, difference, date, reconciled by,
  unresolved items.

Built on the existing `MisKit` (`MisFilters`, `MisTable`, `MisModal`, `ScopeFields`, `money`,
`shortDate`) so the desktop table / mobile `Label : Value` card behaviour matches every other screen.
`BankManagement.tsx` becomes a redirect into **Accounts & Cash**; the legacy `bank_transactions`
rows remain readable, marked as legacy.

## 8. Dashboard

A **Money Position** panel — Cash at Hand · Cash at Bank · Mobile Money/Merchant · Total Available
Liquidity · Outstanding Principal · Interest Receivable · Penalties Receivable · Total Loan
Portfolio · Overdue Portfolio · Total Financial Position — read wholly from `v_money_position`.

Operational KPIs stay in their own band and stay separate: Collections Today / Week / Month, Loans
Disbursed This Month, Active Loans, Active Borrowers, Arrears, PAR. The existing "Bank Balance" tile
is replaced by Total Available Liquidity.

## 9. Reports

Existing reports keep their routes, exports and print behaviour, and are re-pointed at the views:
Master Roll, LO Wise Group Realizable, Daily Overdue, Outstanding, Day Collection List, Overdue
Collection List, Portfolio at Risk, Loan Closure, Approval Pipeline, Reversal Register, Fee
Collection, Savings.

Added: **Financial Position**, **Cash Flow**, **Loan Portfolio**, **Collections**, **Arrears/PAR
ageing**, **Income**, **Expense**, **Capital & Funding**, **Account Ledger / Balance**, **Cash &
Bank Reconciliation**, **Loan Officer**, **Branch**, **Borrower Statement**, **Transaction Audit**,
**Profit & Loss** (rebuilt), **Statement of Financial Position**.

Rebuilt with correct accounting:

- **P&L** — income accounts only. Returned principal is a balance-sheet movement and is excluded by
  construction. On today's data: income 142,900 interest + 360,000 loan fees + 240,000 member fees
  = 742,900; expenses 0; net 742,900. Compare the current report's 851,100 "revenue".
- **Financial Statement** — the hard-coded 250,000,000 is deleted. Assets (liquid accounts, loans
  receivable, interest receivable), liabilities (security held), equity (capital introduced,
  retained result), from `account_class`. It will not balance to the shilling until the cut-over
  reconciliation in §6 is done, and it will say so on its face rather than pretending.
- **Cash Flow** — internal transfers presented as their own section, netting to nil.

Filters across all of them: date range, day/week/month/year, branch, officer, product, **account**,
transaction type, loan status, payment status. Existing PDF/Excel/CSV/Print export is preserved via
`reportPdf.ts`, `excelExporter.ts`, `csvExporter.ts`, `ReportExport.tsx`.

## 10. Permissions

| Action                                       | Who                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Read own-branch accounts and ledger          | Administrator, **Branch Manager** (closes R7), Auditor (read-only)                     |
| Read all accounts                            | Administrator, Auditor                                                                 |
| Post disbursement / repayment ledger entries | whoever may perform the operation — via the posting function, not direct insert        |
| Post expense, capital, internal transfer     | Administrator (Branch Manager for own-branch expenses, if you want it — **your call**) |
| Create/edit accounts                         | Administrator                                                                          |
| Reverse a transaction                        | Administrator                                                                          |
| Reconcile                                    | Administrator, Branch Manager for own branch                                           |
| Any write at all                             | never an Auditor — `NOT private.is_auditor()` on every policy                          |

New `private.*` helpers (`can_see_account`, `can_post_financial`) follow the existing pattern, in the
schema PostgREST does not expose. New functions pin `search_path` and have `EXECUTE` revoked from
`anon`, addressing the advisor warnings for the new surface.
