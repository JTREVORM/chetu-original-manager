# Production cut-over checklist

For `xfkuptxrrnzumzmulblg` (CHETU MICROFINANCE, PostgreSQL 17.6). Execution order is strict.

Code merged to `main`. **No migration in this file has been run.** The schema is undrifted: 1,407
object definitions, hash `56463181be153145bce52b2974446439`, byte-identical to a clean replay of
migrations `000000`–`001200`, re-checked 2 October.

Two things in production have changed since the figures were first derived, neither of them a schema
change:

- **Step 2 has already been done.** `supabase_migrations.schema_migrations` exists and holds the
  thirteen versions `20260101000000`–`20260101001200`, exactly as the registration script writes
  them. Step 2 is now a verification, not an execution.
- **The system is live and in use.** Two loan applications were approved on 1 October —
  `CM-LN-2026-0018` (400,000) and `CM-LN-2026-0019` (500,000) — both **Pending**, neither disbursed.
  Loans are therefore 18, not 16. Every figure the backfill depends on is unchanged, which was
  verified by re-running the whole cut-over against a seed carrying all 18.

> **Freeze lending before step 3.** The backfill's expected notices are derived from the 15 loans
> disbursed so far. If one of the three Pending loans is disbursed between now and step 3, principal
> disbursed moves off 6,600,000, the notices in step 3 will not match, and the cut-over will — quite
> correctly — stop. Either hold disbursement until step 9 is done, or re-derive §4 immediately before
> step 3 and use the new numbers.

SQL is run through the Supabase SQL editor or the Management API
(`POST /v1/projects/{ref}/database/query`). There is no Supabase CLI in this environment.

**Stop at the first step whose result does not match.** Every figure below was derived from
production read-only and reproduced by the 273-assertion harness against a seed that matches
production to the shilling.

**Chetu's figures are in, and the cut-over has been simulated end to end against them.** Cash at
Hand UGX 383,600; Centenary Bank ••••4875 holding UGX 0; no mobile money or merchant float. §D
carries the computed result, and §A now names the real values rather than placeholders.

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

### 2 — Confirm migrations 000000–001200 are registered

**Already done.** Someone ran `supabase/REGISTER_APPLIED_MIGRATIONS.sql` on or before 2 October, and
the thirteen rows are present and correct. Do not run it again — it is guarded by
`ON CONFLICT DO NOTHING`, so a second run is harmless, but there is nothing for it to do.

Verify rather than execute:

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- 13
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

Expected: exactly thirteen rows, `20260101000000 core_schema` through
`20260101001200 schedule_integrity`. If the count is anything but 13, stop and find out why before
applying anything.

---

### 3 — Apply 001300 → 002400, in order, one at a time

Twelve files, from `main`. Each validates itself and aborts rather than leaving a wrong ledger.

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
|  12 | `20260101002400_legacy_reclassification.sql`    |

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
  ('20260101002300','savings_financial_guard',NULL),
  ('20260101002400','legacy_reclassification',NULL)
ON CONFLICT (version) DO NOTHING;
-- 25 rows in total afterwards
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
| Loans / disbursed loans |   18 / 15 |
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
UPDATE financial_accounts SET account_name = 'Cash at Hand'
 WHERE account_code = 'CASH-HO';
UPDATE financial_accounts SET account_name = 'Centenary Bank ••••4875'
 WHERE account_code = 'BANK-MAIN';
```

**No mobile money or merchant accounts are to be created.** Chetu has confirmed none is in use, so
step 6 is those two renames and nothing else. If a float is opened later it gets its own account
then, not now.

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

Two calls, with Chetu's counted figures:

```sql
-- Cash at Hand: UGX 383,600
SELECT post_opening_balance(
  (SELECT id FROM financial_accounts WHERE account_code = 'CASH-HO'),
  383600, DATE '<cut-over date>', 'Counted at cut-over by <name>');

-- Centenary Bank ••••4875: UGX 0 on the statement
SELECT post_opening_balance(
  (SELECT id FROM financial_accounts WHERE account_code = 'BANK-MAIN'),
  0, DATE '<cut-over date>', 'Centenary Bank statement closing balance');
```

The bank call returns **NULL**, and that is correct: migration 002400 records a counted zero by
stamping `opening_balance_date` and posting no journal. A journal of zero would have no lines, which
`v_ledger_health` rightly reports as a fault. The zero is a fact; it is recorded as a date, not as a
movement.

Each account accepts an opening balance **once**. A later correction goes through
`post_reconciliation_adjustment`, not a second opening balance.

Verify:

```sql
SELECT account_code, account_name, current_balance, opening_balance_date
  FROM v_account_balances v JOIN financial_accounts a USING (id)
 WHERE account_class = 'asset_liquid' ORDER BY account_code;
SELECT * FROM v_ledger_health;   -- still zero rows
```

Expected: `CASH-HO` 383,600.00, `BANK-MAIN` 0.00, `LEGACY-UNCLASSIFIED` −2,452,500.00, both real
accounts stamped with the cut-over date.

---

### 8 — Clear the Legacy / Unclassified balance

Management has instructed that this historical balance should no longer sit unresolved. It cannot be
cleared with anything that shipped before migration 002400: `LEGACY-UNCLASSIFIED` is a control
account, so `post_reconciliation_adjustment`, `post_capital_injection` and `post_opening_balance` all
refuse it — correctly, because nobody should be able to adjust a control account from a screen.

`reclassify_legacy_funds` is the controlled way. Administrator only. It writes the journal and the
audit row in one transaction, and it refuses a cash destination outright, because this moves a
classification and not money.

**It goes to `HISTORICAL-FUNDING-SUSPENSE`, classified as a LIABILITY.** Not equity. Booking it to
equity would assert that the owners put the money in, and nobody knows that. If it came from a
director, a shareholder or anyone else on terms, the business owes it, and an equity line would have
hidden a real obligation inside owners' funds — overstating equity and understating what is owed,
which is the wrong error to make with someone else's money. A suspense account is the conventional
instrument for an amount whose classification is not yet determined, and prudence says recognise the
obligation until the source is known rather than the other way round.

`CAPITAL-INTRODUCED` stays at 2,090,000 throughout. Documented capital and unidentified funding never
share a line.

When Chetu identifies the source, the **same function** moves it on — liability to equity if it was
capital, or to a director's-loan liability if it was lending — with its own audit row in the same
series. Pass `_source_code => 'HISTORICAL-FUNDING-SUSPENSE'`. That second hop is tested.

```sql
SELECT * FROM reclassify_legacy_funds(
  _destination_code        => 'HISTORICAL-FUNDING-SUSPENSE',
  _reason                  => 'Management instructed that this historical unexplained balance be cleared. The source of the funding was not identified, so it is classified as unrecorded historical funding rather than merged with documented capital.',
  _authorised_by           => 'Chetu Microfinance management',
  _amount                  => NULL,          -- NULL = the whole balance
  _authorisation_reference => '<minute, email or instruction reference>',
  _transaction_date        => DATE '<cut-over date>');
```

Expected, with Chetu's figures:

| Returned                  |                         Value |
| ------------------------- | ----------------------------: |
| `original_legacy_balance` |                 −2,452,500.00 |
| `amount_reclassified`     |                  2,452,500.00 |
| `residual_after`          |                      **0.00** |
| `destination_code`        | `HISTORICAL-FUNDING-SUSPENSE` |

Then confirm the audit trail and that nothing was destroyed:

```sql
SELECT reclassification_ref, original_legacy_balance, amount, residual_after,
       destination_code, reason, authorised_by, authorisation_reference,
       performed_by, performed_at, transaction_id
  FROM legacy_reclassifications ORDER BY performed_at;

SELECT a.account_code, l.direction, l.amount, l.memo
  FROM financial_transaction_lines l JOIN financial_accounts a ON a.id = l.account_id
 WHERE l.transaction_id = '<transaction_id from above>' ORDER BY l.line_no;
```

The journal must be `LEGACY-UNCLASSIFIED` debit 2,452,500.00 and `HISTORICAL-FUNDING-SUSPENSE`
credit 2,452,500.00, summing to zero. No historical journal is edited or deleted by any of this — the
backfilled entries stay exactly as posted, and this is a new entry on top of them. If it is ever
wrong, it is reversed with `reverse_financial_transaction`, never removed.

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

## D. The computed cut-over result

Measured by replaying all twelve financial migrations over a seed carrying production's exact
control totals, then applying the renames, the counted balances and the reclassification in the
order above. Not a hand calculation.

|                                                      |                                                                                   UGX |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------: |
| **1. Opening Cash at Hand**                          |                                                                        **383,600.00** |
| **2. Opening Centenary Bank ••••4875**               |                                                                              **0.00** |
| **3. Total opening available liquidity**             |                                                                        **383,600.00** |
| **4. Legacy / Unclassified before reclassification** |                                                                     **−2,452,500.00** |
| 5. Reclassification journal                          | Dr `LEGACY-UNCLASSIFIED` 2,452,500.00 / Cr `HISTORICAL-FUNDING-SUSPENSE` 2,452,500.00 |
|                                                      |                                                                Legacy after: **0.00** |

How the legacy figure arises: −2,068,900 after the backfill, then −383,600 as the counted cash is
released from it and −0 for the bank, giving −2,452,500. Posting counted money against the legacy
account makes it _more_ negative, because cash nobody can account for is more unexplained funding,
not less.

### 6. Final financial position

| Account                                   | Class              |                       UGX |
| ----------------------------------------- | ------------------ | ------------------------: |
| Cash at Hand                              | asset · liquid     |                383,600.00 |
| Centenary Bank ••••4875                   | asset · liquid     |                      0.00 |
| Loans Receivable                          | asset · receivable |              5,891,800.00 |
| Legacy / Unclassified                     | asset · liquid     |                      0.00 |
| Member Security Deposits                  | **liability**      |                990,000.00 |
| Unidentified Historical Funding           | **liability**      |              2,452,500.00 |
| Capital Introduced                        | equity             |              2,090,000.00 |
| Interest Income                           | income             |                142,900.00 |
| Processing / CRB / Group maintenance fees | income             | 264,000 / 66,000 / 30,000 |
| Admission / Passbook fees                 | income             |         120,000 / 120,000 |

| Totals      |              UGX |
| ----------- | ---------------: |
| Assets      | **6,275,400.00** |
| Liabilities |     3,442,500.00 |
| Equity      |     2,090,000.00 |
| Income      |       742,900.00 |
| Expenses    |             0.00 |

**Assets 6,275,400 = liabilities 3,442,500 + equity 2,090,000 + income 742,900.** Verified balanced,
zero unbalanced journals, `v_ledger_health` empty.

### What this says about the business

Available cash is **383,600**. Against it the balance sheet now shows **3,442,500** of liabilities:
990,000 of members' security money held on their behalf, and 2,452,500 whose owner is unknown and
which therefore has to be treated as potentially repayable. Equity stands at the 2,090,000 that is
actually documented.

That is a harder picture than an equity treatment would have painted, and it is the honest one. It is
worth putting in front of management before go-live rather than after, together with the question
that resolves it: where did the 2,452,500 come from?

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
