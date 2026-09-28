# Audit of the current financial architecture

**Scope:** Phases 1–6 of the financial-architecture brief — repository read, live Supabase
inspection, repository-versus-production comparison, money-flow trace on real records, baseline
control totals, and this audit.
**Status:** no production data or schema was changed. No code was changed. Read-only throughout.
**Date:** 2026-09-28. **Project:** `xfkuptxrrnzumzmulblg` (CHETU MICROFINANCE), Postgres 17.6, eu-west-1.

Control totals live in `01-BASELINE-CONTROL-TOTALS.md`; re-runnable queries in `baseline-controls.sql`.

---

## 0. The headline

Chetu's financial ledger records **2,090,000 UGX of capital in and nothing out**. In the same
period the business actually handed **5,250,000 UGX** to 15 borrowers and took **1,091,100 UGX**
back over the counter (851,100 in repayments plus 240,000 in member fees). None of the outflows and
none of the inflows reached the ledger.

This is not a data-entry failure. The disbursement code **does** write a ledger row, and it ran 15
times. Every one of those writes was rejected by row-level security and the error was discarded by
the calling code. Section 1 proves it.

The loan book itself, by contrast, is in **excellent** shape: stored balances agree with the
instalment schedule to the shilling on all 16 loans, and every fee identity holds. The problem is
confined to the money-location layer, which is the layer this programme replaces.

---

## 1. The silent ledger failure — root cause

### 1.1 The evidence

| Fact | Value |
| --- | --- |
| Loans disbursed | 15 |
| `audit_logs` entries for "Disbursed Loan" | 15 |
| `bank_transactions` rows with category `Loan Disbursement` | **0** |
| `audit_logs` entries for "Recorded Bank Deposit" | 2 |
| `bank_transactions` rows in total | 2 |
| Distinct `disbursed_by` on all 15 loans | one user — **Wankya Enosh, role `Loan Officer`** |

The disbursement path ran to completion 15 times (it logged an audit entry each time, which happens
*after* the ledger insert). The ledger row is the only step that produced nothing.

### 1.2 The mechanism

`src/context/DatabaseContext.tsx` (`disburseLoan`, ~line 1752) builds and inserts a
`bank_transactions` row, then:

```ts
const { data: btData, error: txError } = await supabase
  .from("bank_transactions").insert([btInsertPayload]).select().single();
if (!txError && btData) {
  setBankTransactions((prev) => [btData as BankTransaction, ...prev]);
}
// …execution continues unconditionally to logAudit() and sendNotification()
```

`txError` is tested only to decide whether to update local state. It is never thrown, never
surfaced, never logged. The operator sees "Loan disbursed" and a notification either way.

Meanwhile the only write policy on the table is:

```
bank_transactions "bank write"  ALL  to authenticated
  USING (private.is_admin())  WITH CHECK (private.is_admin())
```

and `private.is_admin()` is `SELECT private.current_staff_role() = 'Administrator'`, where
`current_staff_role()` is `SELECT role FROM public.profiles WHERE id = auth.uid()`.

A Loan Officer is not an Administrator. Every insert returned `42501 insufficient_privilege`, and
every one was swallowed. Disbursement is otherwise open to Loan Officers — nothing in
`guard_loan_lifecycle_transition` restricts it — so the two rules disagree, and the ledger loses.

### 1.3 Why this is worse than a missing number

Three consequences compound:

1. **The ledger looks healthy.** 2,090,000 in, nothing out, a clean running `balance_after`. There
   is no gap, no error row, no null. Nothing on any screen suggests the figure is wrong.
2. **A rollback would create money.** `undoDisbursement` (~line 2185) posts a **contra `Deposit`**
   of the principal back into the ledger — and rollback is Administrator-only, so *that* insert
   would succeed. Undoing any of the 15 existing disbursements today would credit the ledger with
   a disbursement that was never debited, silently inflating liquidity by the principal amount.
3. **The same swallow pattern is elsewhere.** `addSavingsTransaction` (~line 2686) updates
   `savings_accounts.balance` first and only then inserts the transaction, testing `txError` only
   for local state — a rejected insert leaves a mutated balance with no transaction behind it.

### 1.4 Related: the amount posted would have been wrong anyway

The disbursement row posts `amount: targetLoan.principal_amount` — 6,600,000 across the 15 loans.
The cash that actually left the branch is `net_disbursed_amount` — **5,250,000**. The difference
(360,000 fees + 990,000 security) never leaves Chetu; it is retained. Had RLS permitted the write,
liquidity would have been understated by 1,350,000 and the retained fees and security would have
vanished from the accounts entirely.

---

## 2. Current financial architecture, module by module

### 2.1 The tables that hold money

| Table | Rows | What it really is |
| --- | ---: | --- |
| `bank_transactions` | 2 | The entire "Financial Ledger". One implicit, unnamed institutional bank account. `transaction_type` is `Deposit`/`Withdrawal` only; `category` is free text; `balance_after` is a **client-computed stored running balance**; there is no account dimension, no counter-account, no reversal link, no approval state. |
| `expenses` | 0 | Category, amount, date, `payment_method` ∈ {Cash, Bank Transfer, Mobile Money}, branch. **No source account** — `payment_method` is the only hint and it is not an account reference. Nothing debits anything. |
| `member_fees` | 24 | Admission 5,000 + passbook 5,000 per member, all Cash, 240,000 total. Real cash received. Touches no ledger. |
| `loans` | 16 | Carries `outstanding_balance`, `security_balance`, `completion_percentage` as mutable stored totals, plus the four frozen fee columns. No funding-account reference. |
| `loan_repayments` | 26 | `amount_paid`, `payment_method`, `security_amount`. **No principal / interest / penalty columns.** No receiving-account reference. |
| `loan_repayment_schedule` | 263 | The real arithmetic source of truth: per week `principal_portion`, `interest_portion`, `paid_amount`. |
| `savings_accounts` / `savings_transactions` | 25 / 0 | Unused (all balances zero). `balance` is a mutable stored total. |
| `loan_security_returns` | 0 | Would record refunds of the 990,000 security held. Never used. |
| `loan_reversals` | 0 | Reversal register. Never used. |

There is **no** table for financial accounts, capital injections (they are a `category` string on
`bank_transactions`), penalties, internal transfers of money, or reconciliation.

`public.transfers` is **member/group** transfers between branches and officers — **not** money
movement. It must not be confused with the internal-transfer requirement.

### 2.2 How the dashboard gets its financial totals

`src/pages/Dashboard.tsx` has **no Money Position section**. It shows a single "Bank Balance" tile
fed by `currentBankBalance` from `DatabaseContext`, mixed in among operational KPIs. There is no
cash at hand, no mobile money, no liquidity total, no interest receivable, no total financial
position.

`currentBankBalance` (`DatabaseContext.tsx` ~line 648) is:

```ts
visibleBankTransactions.reduce((b, t) =>
  b + (t.transaction_type === "Deposit" ? +t.amount : -t.amount), 0)
```

— recomputed from **RLS-filtered rows in the browser**. `balance_after`, the stored running balance,
is written but never read for the headline figure. Two sources of truth for the same number.

### 2.3 Three independent implementations of the same arithmetic

| Where | What it computes | Reads |
| --- | --- | --- |
| `DatabaseContext.tsx` §"derived views" | `currentBankBalance`, `totalDeposits`, `totalWithdrawals`, `totalExpenses`, `totalRepaymentsCollected`, collections today/week/month | in-memory arrays |
| `src/lib/branchMetrics.ts` | `cash.bankBalance`, `portfolio.outstanding`, `arrears`, `par30`, `collections.*`, `disbursements.*` | the same arrays, re-sliced per branch |
| `src/pages/Reports.tsx` + `src/pages/reports/*` | P&L, Financial Statement, PAR, Outstanding, Collections | the same arrays again |

Each defines its own period boundaries. `DatabaseContext` uses *rolling* windows (`Date.now() − 7
days`, `− 30 days`); `branchMetrics` uses *calendar* month-start and a 6-day week. The Dashboard's
"Month" and a branch card's "Month" are therefore different numbers by construction.

### 2.4 Hard-coded and fabricated values

**`src/pages/Reports.tsx`, "Financial Statement" report** — the reduce seed is a literal:

```ts
bankTransactions.reduce(
  (s, t) => t.transaction_type === "Deposit" ? s + +t.amount : s - +t.amount,
  250000000,                    // ← fabricated opening balance
)
```

The *Institutional Financial Statement* therefore reports Bank Liquidity of **252,090,000 UGX**
against an actual ledger of 2,090,000. This is the single most dangerous line in the codebase: it is
a formal-looking statement, exportable to branded PDF, carrying a fabricated quarter-billion.

Other hard-coding: `BankManagement.tsx` defaults the new-transaction amount to `10000000`; the
transaction-number prefixes `CM-TX-2026-…`, `CM-EXP-2026-…`, `CM-STX-2026-…` hard-code the year
2026 in the client.

### 2.5 Accounting model: principal treated as income

**`Reports.tsx`, "Profit and Loss":**

```ts
const totalIncome = repayments.reduce((s, r) => s + +r.amount_paid, 0);
const netProfit   = totalIncome - totalExpenses;
```

Labelled *"Gross Interest & Collections Inflow — Revenue"*. Today that reports **851,100 as revenue**
when only **142,900** is interest income; the other **708,200 is returned principal**, a balance-sheet
movement. The P&L overstates income by **496%**. Loan disbursement, symmetrically, is absent from the
P&L — correct by accident, since it never reaches the ledger at all.

The *Financial Statement* report lists "Operating Expenses Accumulated" as a balance-sheet pillar
alongside portfolio and bank — mixing a flow into a position statement, with no liabilities and no
capital section.

### 2.6 Reference-number allocation: fixed in the DB, still wrong in the client

The database has proper `BEFORE INSERT` triggers backed by sequences
(`set_bank_transaction_number`, `set_expense_number`, `set_repayment_numbers`, …), and they defend
themselves: they re-allocate if the supplied value is null, empty, **or already taken**.

But the client still computes `rows.length + 1` first:

- `addBankTransaction` → `CM-TX-2026-${bankTransactions.length + 1}`
- `addExpense` → `CM-EXP-2026-${expenses.length + 1}`
- `addSavingsTransaction` → `CM-STX-…` / `CM-SREC-…`
- `disburseLoan` / `undoDisbursement` → `CM-TX-…`

Because `bankTransactions` is RLS-filtered, two administrators with different visibility generate
the same candidate. The trigger catches the collision and re-allocates, so no data is lost — but the
client then **displays and notifies with its own wrong number** (`addBankTransaction` builds the
toast and the notification body from the locally computed `transaction_number`, not the returned
one). Note the prefix mismatch too: the client writes `CM-EXP-`, the trigger allocates `CM-EX-`.

### 2.7 Stale balance fields and unsafe manual updates

| Field | Maintained by | Risk |
| --- | --- | --- |
| `bank_transactions.balance_after` | client, from RLS-filtered rows | wrong per-viewer; never read back |
| `loans.outstanding_balance` | client, on each repayment | currently correct, but nothing enforces it |
| `loans.completion_percentage` | client, rounded to integer | display-only, drifts from the balance |
| `loans.security_balance` | client | the 990,000 member liability, with no ledger behind it |
| `savings_accounts.balance` | client, **before** the transaction insert | can be left mutated with no transaction |
| `loan_repayment_schedule.paid_amount` | client, row-by-row in a loop | not atomic — a mid-loop failure leaves a partly applied receipt |

No database trigger maintains any financial total. Every one of them is a browser-side write, none
of them transactional, all of them dependent on the writer's RLS visibility.

### 2.8 Repayment allocation — what the existing rule actually is

From `src/lib/scheduleView.ts` (`allocatePayment`), the rule is:

> Apply the payment to unpaid instalments **oldest due-date first** (ties broken by week number),
> filling each to its `installment_amount` before moving on. Anything left over is `unapplied`.

It allocates **across instalments** and stops there. It does **not** split principal, interest,
penalty or fees. Within an instalment, the split is implicit in the schedule's frozen
`principal_portion` / `interest_portion`, and a pro-rata reading of `paid_amount` against those two
columns is the only defensible interpretation of the existing data — it is what produced the
708,200 / 142,900 split in the baseline, and it reconciles exactly.

**There is no penalty concept anywhere.** `loan_products.penalty_rate` exists (default 1.00) and is
read by nothing. Any penalty capability is genuinely new, not a migration.

### 2.9 Missing money locations

Money that demonstrably exists in the real business and has no home in the system:

| Money | Amount today | Where it is now |
| --- | ---: | --- |
| Cash at hand / till / branch cash | unknown | nowhere; one ledger row *describes* itself as "Cash at hand" |
| Mobile Money / merchant float | unknown | nowhere; `payment_method` on expenses and repayments hints only |
| Member fees received | 240,000 | `member_fees` only; no ledger |
| Loan fees retained at disbursement | 360,000 | `loans` columns only; no ledger, no income recognition |
| Security deposits held | 990,000 | `loans.security_balance`; a member liability with no counterpart |
| Repayments received | 851,100 | `loan_repayments` only; no ledger |
| Net cash paid to members | 5,250,000 | `loans.net_disbursed_amount`; no ledger |

### 2.10 Reconciliation

No reconciliation exists. No statement balance, no counted balance, no difference, no reconciler, no
date, and — because there are no accounts — nothing to reconcile against.

### 2.11 Permissions as they bear on money

| Action | UI gate | DB gate | Assessment |
| --- | --- | --- | --- |
| Post a bank transaction | Administrator | `is_admin()` | consistent |
| Record an expense | Administrator | `is_admin()` | consistent |
| Read the ledger / expenses | — | `is_admin_or_auditor()` | **Branch Managers cannot see their own branch's finances at all** |
| Disburse a loan | Admin / BM / LO | none beyond `can_see_client` | **inconsistent with the ledger write it triggers — this is the bug in §1** |
| Record a repayment | Admin / BM / LO | `can_see_client` | consistent |
| Write off a loan | Administrator | `is_admin()` in the lifecycle guard | consistent |

Auditors are correctly excluded from writes throughout (`NOT private.is_auditor()`).

`get_advisors(security)` additionally reports: 2 functions with mutable `search_path`
(`block_audit_mutation`, `block_audit_log_update`), 20 `SECURITY DEFINER` functions executable by
`anon` and 24 by `authenticated` via `/rest/v1/rpc/…` (mostly trigger functions that should never be
callable directly), and leaked-password protection disabled. None of these caused the financial
problems, but new ledger functions must not repeat the pattern.

---

## 3. Repository versus production — discrepancies

| # | Finding | Severity |
| --- | --- | --- |
| 1 | `supabase_migrations.schema_migrations` is **empty**. Production carries 34 public tables and 57 functions that no migration history records. Migrations were applied by hand through the SQL editor. There is no way to tell from the database which repository migrations are live. | **High** — forward-only migrations need a real ledger, or the same drift recurs |
| 2 | `CLAUDE.md` says `supabase/migrations/` holds **eight** files. It holds **thirteen** (`…000400_transfers` through `…001200_schedule_integrity`). The documentation is stale. | Low |
| 3 | `profiles` has `branch_ids` (array) in production; several places reason about a singular branch. `database.types.ts` must be checked against this before new code touches it. | Medium |
| 4 | `src/types/database.types.ts` (hand-written, used by `DatabaseContext`) and `src/integrations/supabase/types.ts` (generated) are **two parallel type systems** for the same tables. The hand-written one has no `business_day_id` on `BankTransaction` or `Expense`, though production has the column on both. | Medium |
| 5 | `supabase/functions/admin-users/` duplicates `src/lib/admin-users.functions.ts`; no Edge Function is deployed (`list_edge_functions` would confirm). Dead weight. | Low |
| 6 | `public/schema_restore.sql`, `public/schema_test.sql` — schema dumps served **publicly** from the web root of a public repo. | Medium (disclosure) |
| 7 | `src/pages/Reports.tsx` references a "Bank Liquidity Balance" that no production data supports (§2.4). | **High** |
| 8 | `supabase/legacy-migrations/` (48 files) contains `DROP SCHEMA public CASCADE` rebuilds and is not replayable. Correctly documented as such; must never be added to. | Informational |

No table, column, constraint, index, trigger or policy exists in production that is *missing* from
the repository migrations — the drift is in the other direction (no history, stale docs, duplicate
types), which is the safer direction.

---

## 4. Money-flow trace on real records (Phase 3)

Traced end to end for each flow that exists in production.

### Capital injection — CM-TX-2026-0001, 2,000,000 on 2026-09-07
`BankManagement.tsx` form → `addBankTransaction` → `requireRoles(["Administrator"])` →
client computes `CM-TX-2026-0001` and `balance_after = 0 + 2,000,000` → insert →
`trg_guard_business_day` stamps `business_day_id` → `trg_set_bank_transaction_number` accepts the
number (not taken) → row lands. Dashboard tile and Bank Management both recompute
`Σ(+deposits −withdrawals)` in the browser. **Destination account: none recorded.**

### Loan disbursement — CM-LN-2026-0002, 300,000 principal on 2026-09-07
`LoanWaitingDisburse` → `disburseLoan` → `loans` UPDATE sets `status='Active'`, `disbursed_at`,
`disbursed_by` (succeeds) → `bank_transactions` INSERT of 300,000 **rejected by RLS, discarded** →
`logAudit("Disbursed Loan")` (succeeds) → notification sent. Net effect on the ledger: **zero**.
Net effect on reality: 238,000 cash left the branch; 12,000 + 3,000 + 2,000 fees and 45,000 security
were retained. None of these four amounts is recorded anywhere but on the loan row.

### Repayment — CM-RP-2026-0002 / receipt CM-REC-2026-0002, 22,500 on 2026-09-11
`Collections` → `recordRepayment` → `allocatePayment(schedule, 22500)` returns one allocation
against week 1 → `loans` UPDATE `outstanding_balance 315,000 → 292,500`,
`completion_percentage`, `status='Partially Paid'` → `loan_repayments` INSERT (DB allocates
`CM-RP-2026-0002` / `CM-REC-2026-0002`) → **loop** of per-row `loan_repayment_schedule` UPDATEs
setting `paid_amount`, `remaining_balance`, `status`, `paid_at`. **No ledger row is written at any
point** — there is no code that writes one. Cash received: 22,500, of which 18,750 principal and
3,750 interest. The business has no record that the money arrived anywhere.

### Member fee — 10,000 per member, 24 members
`MemberAdmission` → `member_fees` INSERT, `payment_method='Cash'`. 240,000 cash received.
No ledger row. Not in any income report except the dedicated Fee Collection Report.

### Expense, internal transfer, reversal, correction, write-off, settlement, savings
**None have ever occurred in production** (0 rows in `expenses`, `loan_reversals`,
`loan_security_returns`, `savings_transactions`, and no loan in `Settled`/`Written Off`/`Fully Paid`).
The code paths exist and were read; their behaviour is described in §1.3 and §2.7. Internal transfers
of money have no code path and no table at all.

---

## 5. Risk register

| # | Risk | Impact | Likelihood |
| --- | --- | --- | --- |
| R1 | Ledger silently drops every officer-initiated disbursement (§1) | Liquidity overstated indefinitely; no alert | **Certain — already occurred 15×** |
| R2 | Financial Statement reports a fabricated 250m opening balance (§2.4) | A signed, exported statement is materially false | **Certain — on every export** |
| R3 | P&L counts returned principal as revenue (§2.5) | Income overstated 496% today | **Certain** |
| R4 | Rollback posts a contra deposit with no matching debit (§1.3) | Liquidity inflated by the principal, per rollback | High, if rollback is ever used |
| R5 | `savings_accounts.balance` mutated before the transaction insert (§2.7) | Orphan balance, unauditable | Medium |
| R6 | Schedule updated row-by-row, non-atomically | Partly applied receipt on failure | Medium |
| R7 | Branch Managers cannot read their own branch's finances | Manual, off-system record-keeping | High |
| R8 | No migration history in production | Next hand-applied change drifts again | High |
| R9 | Three divergent period definitions across three metric engines (§2.3) | Same KPI, different answers per screen | **Certain** |
| R10 | 990,000 of member security money is a liability with no counterpart | Under-stated obligations | Certain |
| R11 | Client-side reference numbers displayed after DB re-allocation (§2.6) | Receipt/voucher quotes a number the DB did not issue | Medium |

---

## 6. Historical-data limitations — what can and cannot be reconstructed

This is the constraint that shapes the whole migration. **The system has never recorded where money
physically was.** Not for one transaction.

### What the history *does* support

| Fact | Evidence | Confidence |
| --- | --- | --- |
| Amount of every disbursement and its fee split | `loans` frozen fee columns; identity verified | **Certain** |
| Amount, date, payer and receipt of every repayment | `loan_repayments`, DB-allocated numbers | **Certain** |
| Principal/interest split of every repayment | pro-rata over `loan_repayment_schedule` portions; reconciles exactly | **High** |
| Capital introduced (2,090,000) and its date | `bank_transactions` | **Certain** |
| Member fees collected (240,000), all Cash | `member_fees.payment_method` | **Certain** |
| Branch of every transaction | single branch | **Certain** |
| Actor and timestamp of every transaction | `recorded_by` / `created_at` / `audit_logs` | **Certain** |

### What it does *not* support

| Unknown | Why |
| --- | --- |
| Which account the 2,000,000 capital went into | `category='Capital Equity Injection'`, description "Cash Deposit". Bank or till? Unknowable. |
| Which account the 90,000 went into | described "Cash at hand" — *suggestive*, but a free-text field is not a posting |
| Which account funded each of the 15 disbursements | never captured |
| Which account received each of the 26 repayments | `payment_method='Cash'` tells us the *instrument*, not the *destination* |
| Whether any mobile-money float exists | never captured |
| The real cash-at-hand balance today | never captured |

`payment_method` must **not** be silently promoted to an account. "Cash" means the member handed
over notes; it does not say whether those notes were banked that evening, kept in the till, or used
to fund the next disbursement. Treating the two as the same thing would fabricate the very
allocation the brief forbids.

### Recommended strategy

1. **Do not guess.** Every historical movement is backfilled to a single system account,
   **`LEGACY-UNCLASSIFIED`**, flagged `is_legacy = true`.
2. **Reconstruct what is certain.** Amounts, dates, actors, branches, references, principal/interest
   splits and the loan/receipt/fee they belong to are all carried across exactly.
3. **Require an opening reconciliation.** Before the new Money Position can be trusted, management
   performs a **physical cash count and a bank-statement read** on a chosen cut-over date, and
   enters those as opening balances on the real accounts. The difference against
   `LEGACY-UNCLASSIFIED` is then posted as an explicit, signed, auditable reconciliation
   adjustment — visible forever, never silently absorbed.
4. **Capture the account from cut-over onward.** Disbursement, repayment, expense, capital and
   transfer screens all require a source/destination account from day one.
5. **Never rewrite history to balance.** The legacy account will not reconcile. That is the honest
   answer and it must be shown as such.

The scale makes this genuinely tractable: **2 ledger rows, 15 disbursements, 26 receipts, 24 fee
records, 0 expenses, 1 branch, 3 staff.** 68 financial events in total. A physical reconciliation of
that is an afternoon's work, not a project.

---

## 7. What is already sound and must be preserved

Worth stating plainly, because the migration must not disturb any of it:

- **Loan arithmetic is exact.** All 16 loans satisfy
  `outstanding_balance = total_amount_payable − Σ paid_amount`, and schedule portions sum to the
  loan's principal and interest, to the shilling. Zero drift.
- **The fee identity holds** on every disbursed loan:
  `principal − processing − CRB − group maintenance − security = net_disbursed`.
- **Fees are correctly frozen** onto the loan row at approval and read back via `storedLoanFees()`,
  so a rate change cannot restate history. `src/lib/fees.ts` is a genuine single source.
- **Reference numbers are DB-allocated** by sequence-backed triggers that defend against collision.
- **RLS is comprehensive** — ~70 policies, all written through `private.*` helpers in a schema
  PostgREST does not expose; every write policy carries `NOT private.is_auditor()`.
- **Business-day control is real** — `guard_business_day_write` blocks writes outside an open day and
  stamps `business_day_id` on every financial row, giving each transaction a day to belong to.
- **The audit trail is immutable** — `block_audit_log_update` / `block_audit_mutation`.
- **Arrears are genuinely zero.** Every instalment due to date is paid. The portfolio is current.
