# Production cut-over checklist

For `xfkuptxrrnzumzmulblg` (CHETU MICROFINANCE, PostgreSQL 17.6). Execution order is strict.

Code merged to `main` as `8d41d90`. **Nothing in this file has been run.** The production database is
unchanged: 1,407 object definitions, hash `56463181be153145bce52b2974446439`, byte-identical to a
clean replay of migrations `000000`–`001200`.

SQL is run through the Supabase SQL editor or the Management API
(`POST /v1/projects/{ref}/database/query`). There is no Supabase CLI in this environment.

**Stop at the first step whose result does not match.** Every figure below was derived from
production read-only and reproduced by the 222-assertion harness against a seed that matches
production to the shilling.

---

## Before you start

Steps 1–7 are reversible by restoring the snapshot from step 1. **From step 8 the ledger carries
counted balances, and rolling back means restoring, not undoing.** Do not begin step 8 without the
five answers in §B.

---

## A. The sequence

### 1 — Snapshot, and write down the restore point

Supabase dashboard → Database → Backups. Take a manual backup and record its timestamp and ID here
before going further.

```
Snapshot ID: ______________________   Taken (UTC): ______________________
```

Confirm it is listed as complete. Do not proceed on a backup that is still running.

---

### 2 — Register migrations 000000–001200 as already applied

Run `supabase/REGISTER_APPLIED_MIGRATIONS.sql` **exactly as it is**, once.

It creates `supabase_migrations.schema_migrations` in the CLI's shape and inserts thirteen version
rows with `statements` NULL. It records only — it cannot re-run anything — and it aborts unless
exactly thirteen rows land. Several of those migrations are not idempotent (`…000000_core_schema`
creates 27 tables unconditionally), so this must never be used to replay them.

Expected: `NOTICE: Migration history now records 13 applied migrations.` followed by the thirteen
`version | name` pairs, `20260101000000 core_schema` through `20260101001200 schedule_integrity`.

Verify:

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- 13
```

---

### 3 — Apply 001300 → 002300, in order, one at a time

Eleven files, from `main`. Each validates itself and aborts rather than leaving a wrong ledger.

|   # | File                                            |
| --: | ----------------------------------------------- |
|   1 | `20260101001300_financial_accounts.sql`         |
|   2 | `20260101001400_financial_ledger.sql`           |
|   3 | `20260101001500_repayment_allocation.sql`       |
|   4 | `20260101001600_financial_posting.sql`          |
|   5 | `20260101001700_financial_views.sql`            |
|   6 | `20260101001800_backfill_legacy_financials.sql` |
|   7 | `20260101001900_financial_rls.sql`              |
|   8 | `20260101002000_financial_integrity.sql`        |
|   9 | `20260101002100_atomic_disbursement.sql`        |
|  10 | `20260101002200_financial_hardening.sql`        |
|  11 | `20260101002300_savings_financial_guard.sql`    |

`NOTICE: … does not exist, skipping` is normal — the migrations are written to be re-runnable.

**Three notices must appear exactly as written. Any other number: stop and restore.**

From `…001500`:

```
NOTICE:  Repayment allocation backfill complete: 851100.00 collected across 26 receipts
```

From `…001800`:

```
NOTICE:  Legacy backfill posted: 2 capital, 15 disbursements, 26 repayments, 24 member fees, 0 expenses
NOTICE:  Backfill validated. Loans Receivable 5891800.00, Legacy / Unclassified -2068900.00
```

Then record the versions you have just applied:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20260101001300','financial_accounts',NULL),
  ('20260101001400','financial_ledger',NULL),
  ('20260101001500','repayment_allocation',NULL),
  ('20260101001600','financial_posting',NULL),
  ('20260101001700','financial_views',NULL),
  ('20260101001800','backfill_legacy_financials',NULL),
  ('20260101001900','financial_rls',NULL),
  ('20260101002000','financial_integrity',NULL),
  ('20260101002100','atomic_disbursement',NULL),
  ('20260101002200','financial_hardening',NULL),
  ('20260101002300','savings_financial_guard',NULL)
ON CONFLICT (version) DO NOTHING;
-- 24 rows in total afterwards
```

---

### 4 — Check the backfill counts and the control totals

```sql
SELECT entry_type, count(*) FROM financial_transactions GROUP BY 1 ORDER BY 1;
```

| entry_type          | expected |
| ------------------- | -------: |
| `capital_injection` |        2 |
| `disbursement`      |       15 |
| `repayment`         |       26 |
| `fee_collection`    |       24 |
| **total journals**  |   **67** |

```sql
SELECT account_code, current_balance FROM v_account_balances
 WHERE current_balance <> 0 ORDER BY account_code;
```

| Account               |      Expected |
| --------------------- | ------------: |
| `CAPITAL-INTRODUCED`  | −2,090,000.00 |
| `INC-FEE-ADMISSION`   |   −120,000.00 |
| `INC-FEE-CRB`         |    −66,000.00 |
| `INC-FEE-GROUP-MAINT` |    −30,000.00 |
| `INC-FEE-PASSBOOK`    |   −120,000.00 |
| `INC-FEE-PROCESSING`  |   −264,000.00 |
| `INC-INTEREST`        |   −142,900.00 |
| `LEGACY-UNCLASSIFIED` | −2,068,900.00 |
| `LOANS-RECEIVABLE`    |  5,891,800.00 |
| `SECURITY-HELD`       |   −990,000.00 |

(Income, liability and equity balances are negative because the view reports signed amounts; a
credit balance is negative.)

Then run `docs/financial-architecture/baseline-controls.sql` and compare every line against:

| Control                 |  Expected |
| ----------------------- | --------: |
| Loans / disbursed loans |   16 / 15 |
| Repayments              |        26 |
| Member fee records      |        24 |
| Expenses                |         0 |
| Capital introduced      | 2,090,000 |
| Principal disbursed     | 6,600,000 |
| Net cash to members     | 5,250,000 |
| Total collected         |   851,100 |
| Principal collected     |   708,200 |
| Interest collected      |   142,900 |
| Loans receivable        | 5,891,800 |
| Security held           |   990,000 |
| Fee income recognised   |   360,000 |
| Arrears / PAR 30        |         0 |

---

### 5 — Check `v_ledger_health`

```sql
SELECT * FROM v_ledger_health;
```

**It must return zero rows.** If it does not, stop and restore. Each row names a financial fact the
ledger has lost track of, and every one of the eleven checks is proved to fire by the harness, so a
row here is real.

---

### 6 — Rename the seeded accounts, and add the real ones

`Main Bank Account` and `Head Office Cash` are placeholders. Production has never recorded which
bank Chetu uses, so inventing one would be a fabrication in a financial record.

```sql
UPDATE financial_accounts
   SET account_name = :'real_bank_account_name'      -- from §B item 3
 WHERE account_code = 'BANK-MAIN';

UPDATE financial_accounts
   SET account_name = :'real_cash_location_name'     -- e.g. 'Buyende Branch Till'
 WHERE account_code = 'CASH-HO';
```

Then add any till, mobile-money or merchant account Chetu actually uses (§B item 4). One row per
real place money sits — not per payment method:

```sql
INSERT INTO financial_accounts
  (account_code, account_name, account_type, account_class, branch_id, allow_manual_posting, status)
VALUES
  ('MM-MTN',   'MTN Mobile Money float', 'mobile_money', 'asset_liquid', :branch_id, true, 'Active'),
  ('TILL-BUY', 'Buyende cashier till',   'cashier_till', 'asset_liquid', :branch_id, true, 'Active');
```

`payment_method` is not an account. "Cash" says the member handed over notes; it does not say where
those notes went. Do not create an account per payment method.

Verify each new account appears and is postable:

```sql
SELECT account_code, account_name, account_type, branch_id, allow_manual_posting, status
  FROM financial_accounts WHERE account_class = 'asset_liquid' ORDER BY sort_order;
```

---

### 7 — Post the counted opening balances

**This is the point of no return.** Do not start without §B items 1 and 2 in writing.

One call per real account, using the counted figure and the date it was counted:

```sql
SELECT post_opening_balance(
  (SELECT id FROM financial_accounts WHERE account_code = 'CASH-HO'),
  :actual_cash_at_hand,          -- §B item 1
  DATE :cutover_date,
  'Counted at cut-over by <name>');

SELECT post_opening_balance(
  (SELECT id FROM financial_accounts WHERE account_code = 'BANK-MAIN'),
  :actual_bank_balance,          -- §B item 2
  DATE :cutover_date,
  'Statement closing balance at cut-over');
```

Repeat for every till, wallet and merchant account added in step 6, including ones holding zero —
a counted zero is a fact worth recording.

Each account accepts an opening balance **once**. A later correction goes through
`post_reconciliation_adjustment`, not a second opening balance.

Verify:

```sql
SELECT account_code, current_balance FROM v_account_balances
 WHERE account_class = 'asset_liquid' ORDER BY account_code;
SELECT * FROM v_ledger_health;   -- still zero rows
```

---

### 8 — The Legacy / Unclassified residual

**Read this before acting. The step as described in the earlier readiness report is not executable,
and this supersedes it.**

After step 7, `LEGACY-UNCLASSIFIED` reads:

```
−(2,068,900 + Cash at Hand + Bank balance)
```

It gets _larger_, not smaller. That is correct and it is the point: the account measures how much
funding reached the business from a source the historical records never captured. Counted cash you
cannot explain is more unexplained funding, not less.

**Every shipped posting function refuses this account.** It is a control account
(`allow_manual_posting = false`), so `post_reconciliation_adjustment`, `post_capital_injection` and
`post_opening_balance` all fail on it with _"Account Legacy / Unclassified Funds is a control
account and cannot be used as a source or destination"_. That is deliberate — nobody should be able
to adjust a control account from the interface — and it was verified against the real functions, not
inferred.

So the residual **cannot be cleared during cut-over**, and it does not need to be. The balance sheet
balances with it in place. Verified:

```
assets 3,822,900 = liabilities 990,000 + equity 2,090,000 + income 742,900
```

with `v_ledger_health` empty. Go-live is not blocked by it.

**Do this instead:** leave the residual where it is, record its value, and reclassify it later once
Chetu answers §B item 5. That answer decides the destination — unrecorded capital, a director's
loan, or something else — and a short follow-up migration
(`20260101002400_legacy_reclassification.sql`) supplies a function to move it, since no shipped one
can. Doing it in that order means the number is explained before it is moved, rather than being
tidied away into whichever account looked plausible on the day.

Record it:

```sql
SELECT current_balance AS legacy_residual FROM v_account_balances
 WHERE account_code = 'LEGACY-UNCLASSIFIED';
```

```
Residual at cut-over: ______________________
```

---

### 9 — Mark the cut-over complete

```sql
UPDATE settings
   SET financial_cutover_date = DATE :cutover_date,
       financial_cutover_completed = TRUE
 WHERE id = 1;
```

This is also the switch that **permanently disables the system reset**: `reset_operational_data()`
refuses outright once it is set. From here the only rollback is restoring the step 1 snapshot.

```sql
SELECT financial_cutover_date, financial_cutover_completed FROM settings WHERE id = 1;
```

---

### 10 — Regenerate the database types

```
GET https://api.supabase.com/v1/projects/xfkuptxrrnzumzmulblg/types/typescript
```

Write the result to `src/integrations/supabase/types.ts`, commit, and confirm
`node ./node_modules/typescript/lib/tsc.js --noEmit` is clean. The typed client rejects the new
columns until this is done.

---

### 11 — Deploy the frontend

Deploy `main` at `8d41d90` or later — after step 10, the commit carrying the regenerated types.

Confirm the build is the one you expect, and that it carries none of these: no `.sql` served from
the web root, no "Savings — Management" in the sidebar, no "Reset all operational data" panel.

---

### 12 — Smoke tests, on production, with real staff

Do these in order, with someone watching the Financial Ledger screen. Each is a real posting;
use small amounts and reverse what you can.

|   # | Test                                                    | Expected                                               |
| --: | ------------------------------------------------------- | ------------------------------------------------------ |
|   1 | Sign in as each of the four roles                       | Each lands on their own scoped dashboard               |
|   2 | Open Financial Ledger → account balances                | Match step 7 exactly                                   |
|   3 | `v_ledger_health` panel                                 | Empty                                                  |
|   4 | Disburse a small test loan, choosing a funding account  | Loan Active **and** a disbursement journal, together   |
|   5 | Undo that disbursement                                  | A reversing journal; balances return exactly           |
|   6 | Record a collection                                     | Receipt, instalment, loan balance and journal all move |
|   7 | Record an expense                                       | Refused without an account; posts with one             |
|   8 | Admit a member                                          | Admission fee posts its journal; a retry posts nothing |
|   9 | Try the same collection with the account field empty    | Refused, with a readable message                       |
|  10 | Visit `/savings`                                        | Closed notice, not the old screen                      |
|  11 | Reports → Financial Position                            | Reads from the ledger; no 250,000,000 anywhere         |
|  12 | Reports → Profit & Loss                                 | Loan principal does **not** appear as revenue          |
|  13 | As a Loan Officer, try to view another officer's member | Refused                                                |
|  14 | `SELECT * FROM v_ledger_health;`                        | Still empty at the end                                 |

Then brief the operators, in person. Disbursement, collection and expense now require an account,
and a wrong account now _fails_ where it used to silently succeed. That is the intended behaviour
and staff should hear it from a person rather than from an error message.

---

## B. What Chetu must supply first

Steps 6, 7 and 8 cannot start without these. None can be derived, inferred or defaulted, and
inventing any of them would be a fabrication in a financial record.

|   # | Needed                                            | Form                                                                                                                                                                     | Blocks                                    |
| --: | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
|   1 | **Actual Cash at Hand**                           | One counted figure in UGX, with the date, the time and the name of who counted it. Separately per till if cash is held in more than one place.                           | step 7                                    |
|   2 | **Actual Bank balance**                           | Closing balance from the bank statement on the cut-over date, in UGX, with the statement date.                                                                           | step 7                                    |
|   3 | **Real bank account name**                        | Bank, branch, account name and the last four digits of the account number — enough to identify it on a statement without putting the full number in a public repository. | step 6                                    |
|   4 | **Whether Mobile Money or merchant float exists** | Yes/no. If yes: provider, account name and the counted balance of each, on the same date as items 1 and 2.                                                               | steps 6 and 7                             |
|   5 | **Source of the historical UGX 2,068,900**        | A sentence naming where it came from — unrecorded capital, a director's loan, or something else — and from whom.                                                         | the step 8 follow-up, not cut-over itself |

Items 1–4 are hard blockers. Item 5 is not: cut-over proceeds with the residual on
`LEGACY-UNCLASSIFIED`, and the answer is needed for the reclassification afterwards.

---

## C. If something goes wrong

| When                                          | Do                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Any step 3 notice shows a different number    | Stop. Restore the step 1 snapshot. The backfill validated itself against data that is not what we measured.              |
| `v_ledger_health` returns rows at step 5 or 7 | Stop. Read the `check_name` and `detail`; each names a specific financial fact. Restore rather than adjusting around it. |
| A migration fails part-way                    | Each is a single transaction and rolls back whole. Fix the cause and re-run that file; the earlier ones are unaffected.  |
| An opening balance was posted wrong           | Do not post a second one — the function refuses. Use `post_reconciliation_adjustment` on that account, with a reason.    |
| After step 9                                  | Restore the snapshot. There is no undo.                                                                                  |
