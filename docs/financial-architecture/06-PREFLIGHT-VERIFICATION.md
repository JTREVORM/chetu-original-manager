# Pre-flight verification — migration history, schema drift and PR review

Run on 28 September 2026 against the live project `xfkuptxrrnzumzmulblg` (CHETU MICROFINANCE,
PostgreSQL 17.6.1.155), **read-only**. No migration was applied, no production row was changed,
no branch was merged.

This document re-derives the findings of the earlier session from scratch rather than restating
them. Where it disagrees with an earlier note, the method is given so the disagreement can be
checked.

---

## 1. Method

Object-by-object existence checks answer _is it there_. They do not answer _is it the same_, which
is the question that matters before recording a migration as applied — a policy whose `USING`
clause drifted still exists.

So the check was done by construction instead:

1. A scratch PostgreSQL 16 cluster with the Supabase-compatible shim, minus the shim's
   `ALTER DEFAULT PRIVILEGES` lines, which grant privileges no real project grants.
2. Migrations `…000000` through `…001200` replayed **in order, into an empty database**. All 13
   applied without error.
3. Both databases fingerprinted with one query producing `kind ⇥ object ⇥ md5(definition)` over
   ten categories, and the per-category hash compared.

The fingerprint covers definitions, not names:

| Category   | What is hashed                                                               |
| ---------- | ---------------------------------------------------------------------------- |
| column     | type, nullability, default expression                                        |
| constraint | full `pg_get_constraintdef`                                                  |
| index      | full `pg_get_indexdef`                                                       |
| function   | `md5(prosrc)`, `prosecdef`, volatility, result type — `public` and `private` |
| trigger    | full `pg_get_triggerdef` — `public` **and `auth`**                           |
| policy     | command, roles, permissive, **`USING`**, **`WITH CHECK`**                    |
| rls        | `relrowsecurity`, `relforcerowsecurity`                                      |
| sequence   | start, increment, type                                                       |
| view       | `md5(definition)`                                                            |
| grant      | every table privilege held by `anon`, `authenticated`, `service_role`        |

Extension-owned functions are excluded: `pgcrypto` lives in `public` locally and in `extensions`
on Supabase, which is an artefact of where the extension was installed, not drift.

---

## 2. Result: production is byte-identical to a clean replay

| Category   |    Replay | Production |         Hash          |
| ---------- | --------: | ---------: | :-------------------: |
| column     |       507 |        507 | `32afcb09…` identical |
| constraint |       191 |        191 | `376254a4…` identical |
| function   |        57 |         57 | `76bea031…` identical |
| grant      |       362 |        362 | `b86b6c16…` identical |
| index      |       108 |        108 | `2a08e547…` identical |
| policy     |        87 |         87 | `0e8113dc…` identical |
| rls        |        34 |         34 | `807ed834…` identical |
| sequence   |        12 |         12 | `8ec1547d…` identical |
| trigger    |        48 |         48 | `3551dec0…` identical |
| view       |         1 |          1 | `92ee68a5…` identical |
| **Total**  | **1,407** |  **1,407** |     **no drift**      |

Because the category hash is taken over every object's definition, a single changed character in
one policy's `USING` clause or one trigger's `WHEN` would have changed the hash. None did.

The items left open by the previous session are therefore closed, and closed by definition rather
than by presence:

- **Policies** — all 87, with command, roles, `USING` and `WITH CHECK`.
- **Triggers** — all 48.
- **Dynamically generated triggers** — `trg_guard_business_day` is created by a loop in
  `…000800`, not a static `CREATE TRIGGER`. All **12** exist, on `bank_transactions`,
  `client_groups`, `clients`, `expenses`, `group_attendance`, `loan_applications`,
  `loan_repayment_schedule`, `loan_repayments`, `loans`, `savings_accounts`,
  `savings_transactions` and `transfers`, each with a matching `pg_get_triggerdef`.
- **Auth-schema triggers** — `auth.users.on_auth_user_created` exists and matches
  (`786e53a3…` on both sides). It is the only non-internal trigger in `auth`.

### The one difference, and why it is not drift

The first pass showed 373 grants locally against 362 in production. The extra 11 were
`service_role`'s `DELETE/INSERT/REFERENCES/TRIGGER/TRUNCATE/UPDATE` on `business_day_audit` and
`staff_directory` — objects the migrations deliberately grant narrowly (`…000900` gives
`business_day_audit` only `SELECT, INSERT`, since it is an append-only audit register;
`…001100` gives the `staff_directory` view only `SELECT`).

Production has **no default ACLs in schema `public`** (`pg_default_acl` is empty), so it has only
the explicit grants — which is correct. The extra 11 came from the harness shim's
`ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO service_role`. Removing that line brought the
replay to 362 grants and hash `b86b6c16…`, matching production exactly. Production was right and
the harness was wrong.

---

## 3. Migration-history reconciliation table

`supabase_migrations.schema_migrations` **does not exist** in production — the schema itself is
absent, not merely an empty table. Everything was hand-applied through the Management API.

Objects are attributed to the last migration that created or last changed them in the replay.

|     # | Migration                                   | Objects owned | Verdict                    |
| ----: | ------------------------------------------- | ------------: | -------------------------- |
|     1 | `20260101000000_core_schema`                |           842 | **Fully applied**          |
|     2 | `20260101000100_security_helpers`           |            10 | **Fully applied**          |
|     3 | `20260101000200_row_level_security`         |            97 | **Fully applied**          |
|     4 | `20260101000300_business_rules`             |            23 | **Fully applied**          |
|     5 | `20260101000400_transfers`                  |            59 | **Fully applied**          |
|     6 | `20260101000500_persist_loan_fees`          |             7 | **Fully applied**          |
|     7 | `20260101000600_reference_number_sequences` |            20 | **Fully applied**          |
|     8 | `20260101000700_real_email_login`           |             2 | **Fully applied**          |
|     9 | `20260101000800_business_day_control`       |           137 | **Fully applied**          |
|    10 | `20260101000900_business_day_traceability`  |            67 | **Fully applied**          |
|    11 | `20260101001000_branch_network`             |            32 | **Fully applied**          |
|    12 | `20260101001100_staff_management`           |           106 | **Fully applied**          |
|    13 | `20260101001200_schedule_integrity`         |             5 | **Fully applied**          |
| 14–22 | `…001300` … `…002100` (financial)           |             — | **Not applied** (intended) |

Nothing is _partially applied_; nothing shows _production differs from migration_.

Confirmed absent from production, as intended: `financial_accounts`, `financial_transactions`,
`financial_transaction_lines`, and every `post_*` / `v_*` financial object.

### Migrations safe to register in migration history

**All 13**, numbers 1–13 above. Each is proven fully represented, not by presence but by a
definition-level match of the whole schema.

They should be recorded as already-applied — version row only, no re-execution. Several are not
idempotent (`…000000` creates tables unconditionally), so re-running them would fail or destroy
data. Nothing has been written to `supabase_migrations` by this session.

---

## 4. Baseline control totals re-derived from production

Read-only, 28 September 2026. Every figure matches the audit.

| Control             | Production |  Expected |
| ------------------- | ---------: | --------: |
| Loans               |         16 |        16 |
| Disbursed loans     |         15 |        15 |
| Repayments          |         26 |        26 |
| Bank transactions   |          2 |         2 |
| Expenses            |          0 |         0 |
| Member fee records  |         24 |        24 |
| Capital introduced  |  2,090,000 | 2,090,000 |
| Principal disbursed |  6,600,000 | 6,600,000 |
| Net cash to members |  5,250,000 |         — |
| Total collected     |    851,100 |   851,100 |
| Principal collected |    708,200 |   708,200 |
| Interest collected  |    142,900 |   142,900 |
| Loans receivable    |  5,891,800 | 5,891,800 |
| Security held       |    990,000 |   990,000 |
| Overdue instalments |          0 |         0 |

`Principal collected` was computed by running the backfill's own formula against production's
rows, read-only — not by replaying the migration.

**Legacy / Unclassified** reconstructs to `2,090,000 + 851,100 + 240,000 − 5,250,000 − 0 =`
**−2,068,900**, identical in production and in the harness. It is the historical funding gap and
is meant to be visible, not absorbed.

---

## 5. A real defect found in the verification harness, and fixed

The seed built each instalment on an even split. Production floors the instalment and its interest
to a whole 100 and hands the leftover hundreds to the **earliest** weeks:

```
loan 500,000 / 16 weeks       weeks 1–8:  37,500 = 31,200 principal + 6,300 interest
                              weeks 9–16: 37,500 = 31,300 principal + 6,200 interest
```

The repayment-allocation backfill splits every receipt by its instalment's own ratio. All 26 of
Chetu's receipts land on early instalments, so the even split moved **UGX 1,050** from interest
income into Loans Receivable — in the very opening balances the harness exists to prove. The
harness reported 5,890,750 / 141,850 where production yields 5,891,800 / 142,900.

Fixed in `01-seed-production-shape.sql` by reproducing production's rule, and the four assertions
that hard-coded `31,250 / 6,250` now read the expected split off the instalment, so they assert the
rule rather than a number. The suite is **138 passed, 0 failed**, now against a seed that
reproduces production's control totals to the shilling.

`05-PRODUCTION-READINESS.md` §5 quoted the old figures as "what production will produce"; it has
been corrected. §6 was read off production and was always right.

---

## 6. PR #3 review

### Clean

| Checked                              | Result                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard-coded financial values          | **None.** `250000000` appears only in two comments explaining its removal. `FEES` is referenced only for prospective quotes and for displaying the published schedule; historical loans read `storedLoanFees()`.                                                                                                                                         |
| Legacy writes to `bank_transactions` | **None in application code.** The table is closed by `trg_block_legacy_bank_write` on INSERT/UPDATE/DELETE _and_ by `REVOKE INSERT, UPDATE, DELETE … FROM authenticated`. Verified: a signed-in Administrator is refused.                                                                                                                                |
| Direct ledger writes                 | **Refused.** `INSERT` into `financial_transactions` as an Administrator fails with `permission denied`. Only the `SECURITY DEFINER` posting functions can write it.                                                                                                                                                                                      |
| Frontend-only permission checks      | **None that stand alone.** The `isAdmin && !isAuditor` gates in `FinancialLedger.tsx` sit on top of database checks. Verified live: a Loan Officer calling `reverse_financial_transaction` gets _"Only an Administrator may reverse a financial transaction"_; an Auditor calling `post_repayment` gets _"Auditors cannot post financial transactions"_. |
| Swallowed Supabase errors            | **None on a money path.** Every function in `src/lib/financial/ledger.ts` raises. Seven residual `if (!error)` sites remain in `DatabaseContext`, all non-financial (clients, groups, products, application rejection, attendance).                                                                                                                      |
| Duplicate financial calculations     | **None.** Reports read `v_money_position`, `v_income_statement`, `v_cash_flow`, `v_account_ledger`, `v_transaction_audit`, `v_repayment_allocation`, `v_ledger_health`. The client only sums rows the database already aggregated.                                                                                                                       |
| Undo-disbursement ledger behaviour   | **Correct.** `undo_loan_disbursement` posts a reversing journal, refuses when no posted journal exists, refuses when collections exist, and does it all in one function.                                                                                                                                                                                 |
| Typecheck / build                    | Clean.                                                                                                                                                                                                                                                                                                                                                   |
| Lint                                 | 30 errors, 45 warnings — **all pre-existing on `main`**, byte-identical file list. The PR adds none.                                                                                                                                                                                                                                                     |
| Advisors                             | The PR fixes both `function_search_path_mutable` findings live on production today (`block_audit_mutation`, `block_audit_log_update`) and revokes public `EXECUTE` on nine trigger functions.                                                                                                                                                            |

### Finding 1 — the money workflows are atomic in the application, not in the database

`disburse_loan`, `record_loan_repayment`, `undo_loan_disbursement`, `undo_loan_repayment` and
`record_expense` are each a single transaction that writes the row **and** posts the journal.
Through the application, nothing can half-happen. The 30 atomicity assertions confirm it.

The underlying tables are still writable, so the guarantee does not survive anything that does not
go through those functions. Tested against the full 22-migration schema, as a signed-in user over
the same PostgREST surface the app uses, from a clean baseline of **0** unjournalled loans and
**0** unjournalled receipts:

|   # | Actor         | Action                                                 | Result                                                |
| --: | ------------- | ------------------------------------------------------ | ----------------------------------------------------- |
|   1 | Loan Officer  | `UPDATE loans SET status='Active', disbursed_at=now()` | Loan becomes Active, **no disbursement journal**      |
|   2 | Loan Officer  | `INSERT INTO loan_repayments`                          | Receipt written, **no repayment journal**             |
|   3 | Administrator | `INSERT INTO expenses`                                 | Expense written, **no expense journal**               |
|   4 | Administrator | `UPDATE loans SET status='Written Off'`                | Loan written off, **no write-off journal**            |
|   5 | Administrator | `UPDATE loans SET status='Settled'`                    | Loan settled, **no journal**                          |
|   6 | Loan Officer  | `INSERT INTO member_fees`                              | Passed RLS; stopped only by an unrelated unique index |

This is the original failure re-reachable by another door: fifteen loans were disbursed with no
financial entry precisely because the row moved and the ledger did not. `CLAUDE.md` states the
standard — _"When adding a role check, put it in the database first. An `if (isAdmin)` in a
component is not a control."_ The same reasoning applies to an invariant.

The shape of the fix already exists in this PR: `block_legacy_bank_write` closes
`bank_transactions` with a `BEFORE INSERT OR UPDATE OR DELETE` trigger. Guards on `loans`
(the disbursement, write-off and settlement transitions), `loan_repayments`, `expenses` and
`member_fees` that reject the money-moving change unless it arrives from a posting function would
close it. Not a blocker for a supervised cut-over; it should not stay open.

### Finding 2 — settlement and write-off are two round trips, not one

Every other money path is one RPC. These two are not:

- `writeOffLoan` (`DatabaseContext.tsx:2211`) `UPDATE`s the loan, then calls `post_writeoff`
  separately at `:2249`.
- Early settlement writes the receipt, then calls `post_repayment` separately at `:2147`.

The error is not swallowed — both raise a `LedgerError`, and the settlement one even says
_"Reverse the receipt before retrying"_. But a dropped connection between the two calls leaves the
loan written off or settled with no journal, and no transaction to roll back. The remedy matches
what `…002100` already did for disbursement and collection: one `SECURITY DEFINER` function that
does both.

### Finding 3 — `clearAllData` does not clear the ledger

`clearAllData` (`DatabaseContext.tsx:3055`) deletes the operational tables but not
`financial_transactions`, `financial_transaction_lines` or the allocation columns. It also still
calls `.delete()` on `bank_transactions`, which `trg_block_legacy_bank_write` now refuses — and
the call binds no `error`, so it fails silently. Administrator-only and destructive by intent, but
after a wipe the ledger and the operational tables no longer describe the same institution.

---

## 7. Remaining test limitations

- **Supabase branching is still unavailable.** `create_branch` was attempted once and timed out
  after 60 s; `list_branches` confirms none was created. Not retried, and no destructive
  alternative was attempted. Note that a Supabase branch would not have removed the main risk
  anyway: branches are created **without production data**, so the backfill — the part that acts
  on real rows — could not have been exercised on one. The local harness with a
  production-faithful seed tests more, not less.
- **PostgreSQL 16 against production's 17.6.** Nothing in the nine migrations uses a
  version-sensitive construct; they are ordinary DDL and PL/pgSQL. The assumption remains
  untested on 17.
- **The seed is production's shape, not its bytes.** It now reproduces every control total
  exactly, including the instalment rounding, but it is reconstructed rather than restored.
- **Savings is unwired.** All 25 accounts are zero and savings transactions do not post. Nothing
  is lost today; it must be wired before the module is used.
- **Penalties are architecture, not feature.** The accounts exist and are proven; no penalty logic
  is wired into collections.

## 8. Unresolved issues

1. Findings 1–3 above.
2. **Legacy / Unclassified −2,068,900** is unresolved by design and only a physical count can
   resolve it. Note the direction: posting the counted Cash at Hand and Bank balances _credits_
   Legacy further, so the residual after step 7 below is larger than 2,068,900 and needs the
   explicit step 8 adjustment.
3. **No migration history row has been written.** Recording the 13 is step 2 of the sequence.
4. `public/schema_restore.sql` and `public/schema_test.sql` are schema dumps served from the web
   root of a public repository.

---

## 9. Production deployment sequence

Nothing here is automated, and nothing before step 3 touches the financial schema.

1. **Snapshot the project** and record the restore point.
2. **Create `supabase_migrations.schema_migrations`** and insert the 13 versions `20260101000000`
   through `20260101001200` as already-applied — **version rows only, no re-execution**. Several
   are not idempotent.
3. **Apply `…001300` → `…002100` in order.** Each validates itself and aborts rather than leaving a
   wrong ledger. Expect the notices: allocation `851100.00 collected across 26 receipts`; backfill
   `2 capital, 15 disbursements, 26 repayments, 24 member fees, 0 expenses`; validation
   `Loans Receivable 5891800.00, Legacy / Unclassified -2068900.00`. **Any other number: stop.**
4. **Run `baseline-controls.sql`** and compare against §4. Every line must match.
5. **Check `v_ledger_health` is empty.** If it is not, stop.
6. **Rename the seeded accounts** to the real ones (see §10) and add any branch tills or
   mobile-money accounts actually in use.
7. **Count the cash and read the bank statement** on the cut-over date; enter each account's
   opening balance under Financial Ledger → Reconciliation.
8. **Post the residual** against Legacy / Unclassified as one signed reconciliation adjustment
   with a reason. It stays visible in the ledger and the reports permanently.
9. **Set `settings.financial_cutover_completed = true`.**
10. **Regenerate `src/integrations/supabase/types.ts`** from the live database.
11. **Brief the operators.** Disbursement, collection and expense now require an account, and a
    wrong account now _fails_ where it used to silently succeed. Staff should hear that from a
    person.
12. Deploy the frontend.

Steps 1–5 are reversible by restoring the snapshot. From step 7 the ledger carries counted
balances and rolling back means restoring, not undoing.

---

## 10. What Chetu must supply before cut-over

None of this can be derived, inferred or defaulted. Inventing any of it would be a fabrication in
a financial record.

|   # | Required                   | Why                                                                                                                         | Form                                                                                                                                                                          |
| --: | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | **Actual Cash at Hand**    | Posted as the opening balance of `CASH-HO`. Production has never recorded a cash position; the ledger currently holds none. | One counted figure in UGX, with the date and time of the count and the name of who counted it. Per till if cash is held in more than one place.                               |
|   2 | **Actual Bank balance**    | Posted as the opening balance of `BANK-MAIN`. The register holds only two capital deposits, which is not a balance.         | The closing balance from the bank statement on the cut-over date, in UGX, with the statement date.                                                                            |
|   3 | **Real bank account name** | `Main Bank Account` is a placeholder. Production has never recorded which bank Chetu uses.                                  | Bank name, branch, account name and the last four digits of the account number — enough to identify it on a statement without putting the full number in a public repository. |

Two further things are worth asking for at the same time, because the answer changes how the
residual is classified rather than whether cut-over can happen:

- **Where the 2,068,900 came from.** More cash reached members than the recorded capital,
  collections and fees explain. If it was unrecorded capital or a director's loan, say so, and the
  step 8 adjustment names it instead of leaving it unclassified.
- **Whether any mobile-money or merchant float is in use.** If it is, it needs its own account
  before step 7, not after.

---

## 11. Verdict

The migration history can be recorded for all 13 historical migrations: production is byte-identical
to a clean replay across 1,407 object definitions, with zero drift. The nine financial migrations
are correct on production's real data, verified by 138 assertions against a seed that now
reproduces production's control totals to the shilling.

Three findings remain open, none of which blocks a supervised cut-over and all of which should be
closed before the system runs unsupervised. The three figures in §10 are hard blockers: without
them the opening balances cannot be posted, and a ledger without opening balances is not a ledger.
