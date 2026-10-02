# Final production execution plan

Project `xfkuptxrrnzumzmulblg` · CHETU MICROFINANCE · PostgreSQL 17.6
Code on `main` at `75d092d` · 25 migrations · 273 assertions passing

**Nothing in this plan has been run.** Verified immediately before writing it: schema hash
`56463181be153145bce52b2974446439` over 1,407 object definitions, 34 tables, no financial tables, no
`reclassify_legacy_funds`, 13 registered migrations, 18 loans / 15 disbursed / 6,600,000.

SQL runs through the Supabase SQL editor or the Management API
(`POST /v1/projects/{ref}/database/query`). There is no Supabase CLI in this environment.

## Approved values

|                               |                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------: |
| Cash at Hand                  |                                                                 **UGX 383,600** |
| Centenary Bank ••••4875       |                                                                       **UGX 0** |
| Mobile money / merchant float |                                                                        **none** |
| Historical amount to classify |                                                               **UGX 2,452,500** |
| Destination                   | **`HISTORICAL-FUNDING-SUSPENSE`** — Unidentified Historical Funding (liability) |
| Cut-over date                 |                        `<fill in on the day>` — use the same date in every step |

## The one rule that governs the whole plan

**STOP means stop.** Do not improvise around a failed check, do not adjust a figure to make a check
pass, and do not continue to the next stage hoping it resolves. Every number below was derived from
production and reproduced by the test suite; a mismatch means reality is not what we measured, and
the right response is to halt and find out why.

Stages 1–8 are reversible by restoring the stage 1 snapshot. **Stage 9 is the point of no return** —
from there the ledger carries counted balances and rolling back means restoring, not undoing.

---

## Stage 1 — Production snapshot

Supabase dashboard → Database → Backups → take a manual backup.

```
Snapshot ID: ______________________    Taken (UTC): ______________________
Taken by: ________________________
```

**STOP if:** the backup is not listed as complete · you cannot record its ID · you have not confirmed
you know how to restore it. Do not proceed on a backup still running.

---

## Stage 2 — Verify the 13 registered historical migrations

Already registered on or before 2 October. **Verify, do not re-run.**

```sql
SELECT count(*) AS should_be_13 FROM supabase_migrations.schema_migrations;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

Expect exactly 13 rows, `20260101000000 core_schema` through `20260101001200 schedule_integrity`.

**STOP if:** the count is not 13 · any version is missing or misspelled · any row outside
`20260101000000`–`20260101001200` is present. A wrong history will make a later change replay a
migration that is not idempotent.

---

## Stage 3 — Freeze lending

Announce the freeze to every branch and confirm each has acknowledged. Nobody disburses, collects,
records an expense, admits a member or refunds security until stage 18.

```
Freeze announced (UTC): __________    Acknowledged by: ______________________
```

Then record the baseline the rest of the plan is measured against:

```sql
SELECT count(*) AS loans, count(*) FILTER (WHERE disbursed_at IS NOT NULL) AS disbursed,
       COALESCE(sum(principal_amount) FILTER (WHERE disbursed_at IS NOT NULL), 0) AS principal_disbursed
  FROM loans;
SELECT count(*) AS repayments, COALESCE(sum(amount_paid), 0) AS collected FROM loan_repayments;
SELECT count(*) AS member_fees, COALESCE(sum(total_amount), 0) AS fees FROM member_fees;
SELECT count(*) AS bank_tx, COALESCE(sum(amount), 0) AS capital FROM bank_transactions;
SELECT count(*) AS expenses FROM expenses;
```

Expect: 18 / 15 / **6,600,000** · 26 / **851,100** · 24 / **240,000** · 2 / **2,090,000** · 0.

> **Re-checked live on 2 October.** Every posting input is identical — principal disbursed
> 6,600,000, net cash to members 5,250,000, security withheld 990,000, collected 851,100, principal
> collected 708,200, member fees 240,000, capital 2,090,000, expenses 0, savings transactions 0,
> 13 registered migrations, no financial tables.
>
> **One derived figure has moved: arrears.** Ten instalments totalling **UGX 311,100** across ten
> loans fell due between 29 September and 1 October. No payment was recorded and no instalment was
> marked paid — time simply passed while collections were paused. Nothing was posted, so no backfill
> input changed and every cut-over figure below is unaffected. The stage 6 arrears expectation is
> corrected accordingly; PAR 30 is still 0, because the oldest arrear is three days old.

**STOP if:** `principal_disbursed` is not 6,600,000 · collected is not 851,100 · fees are not 240,000
· capital is not 2,090,000 · expenses are not 0. Any of those means business activity has moved the
backfill's inputs since they were derived. Do not continue: re-derive every expected figure in stages
6 and 10 from the new baseline first, and have the new numbers checked before applying anything.

**STOP if:** the freeze is not confirmed by every branch. A disbursement landing mid-cut-over is the
one failure this plan cannot clean up.

---

## Stage 4 — Apply `001300` through `002400`, in order, one at a time

Twelve files, from `main` at `75d092d`. Each is a single transaction and rolls back whole.

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

Apply them one at a time, in this order, reading the output of each before starting the next.

**STOP if:** any file raises an error · you are tempted to apply them out of order or in one paste ·
a file appears to have partially applied. `NOTICE: … does not exist, skipping` is normal and expected.

Then record the twelve versions:

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

SELECT count(*) AS should_be_25 FROM supabase_migrations.schema_migrations;
```

---

## Stage 5 — Verify the migration notices

Three notices must appear **exactly** as written.

From `…001500`:

```
NOTICE:  Repayment allocation backfill complete: 851100.00 collected across 26 receipts
```

From `…001800`:

```
NOTICE:  Legacy backfill posted: 2 capital, 15 disbursements, 26 repayments, 24 member fees, 0 expenses
NOTICE:  Backfill validated. Loans Receivable 5891800.00, Legacy / Unclassified -2068900.00
```

**STOP if:** any count differs · either amount differs by so much as a shilling · a notice is absent.
The backfill validates itself against the data in front of it, so a different number means the data
is not what we measured. **Restore the stage 1 snapshot** rather than investigating forward.

---

## Stage 6 — Verify 67 backfilled journals and the control totals

```sql
SELECT entry_type, count(*) FROM financial_transactions GROUP BY 1 ORDER BY 1;
SELECT count(*) AS total_journals FROM financial_transactions;
```

| entry_type          | expected |
| ------------------- | -------: |
| `capital_injection` |        2 |
| `disbursement`      |       15 |
| `repayment`         |       26 |
| `fee_collection`    |       24 |
| **total**           |   **67** |

```sql
SELECT account_code, current_balance FROM v_account_balances
 WHERE round(current_balance,2) <> 0 ORDER BY account_code;
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

Credit balances read negative: the view reports signed amounts.

Then run `docs/financial-architecture/baseline-controls.sql` and check every line: loans 18 /
disbursed 15 · repayments 26 · member fees 24 · expenses 0 · capital 2,090,000 · principal disbursed
6,600,000 · net cash to members 5,250,000 · collected 851,100 · **principal collected 708,200** ·
**interest collected 142,900** · receivable 5,891,800 · security 990,000 · fee income 360,000 ·
arrears **10 instalments / UGX 311,100** (re-derived 2 October; **PAR 30 still 0**).

Arrears is the one control that will keep moving while lending is frozen, because instalments keep
falling due. Re-derive it immediately before this stage rather than trusting the number above, and
do not treat a larger figure as a reason to stop — it is a consequence of the freeze, not a fault.
Every _posting_ input must still match exactly.

**STOP if:** the journal count is not 67 · any entry-type count differs · any balance differs ·
any control line differs. **Restore.**

---

## Stage 7 — `v_ledger_health` must be empty

```sql
SELECT * FROM v_ledger_health;
```

**Zero rows.** Fourteen checks run here, and every one is proved to fire by the test suite, so a row
is real, not noise.

**STOP if:** any row returns. Read `check_name` and `detail` — each names a specific financial fact
the ledger has lost track of. **Restore.** Do not adjust around it.

---

## Stage 8 — Rename the accounts

```sql
UPDATE financial_accounts SET account_name = 'Cash at Hand'
 WHERE account_code = 'CASH-HO';
UPDATE financial_accounts SET account_name = 'Centenary Bank ••••4875'
 WHERE account_code = 'BANK-MAIN';

SELECT account_code, account_name, account_type, account_class, status
  FROM financial_accounts WHERE account_class = 'asset_liquid' ORDER BY sort_order;
```

**No new accounts.** Chetu confirmed no mobile money or merchant float, so nothing else is created.

**STOP if:** either UPDATE reports `UPDATE 0` · either name is wrong, including the four digits ·
you are about to create a mobile-money or merchant account that nobody asked for.

---

## Stage 9 — Post the opening balances · POINT OF NO RETURN

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

The cash call returns a journal id. **The bank call returns NULL, and that is correct** — a counted
zero stamps `opening_balance_date` and posts no journal, because a journal of zero would have no
lines and `v_ledger_health` would rightly report it.

```sql
SELECT a.account_code, a.account_name, v.current_balance, a.opening_balance_date
  FROM v_account_balances v JOIN financial_accounts a ON a.id = v.account_id
 WHERE v.account_class = 'asset_liquid' ORDER BY a.account_code;
```

Expect `BANK-MAIN` 0.00, `CASH-HO` 383,600.00, both stamped with the cut-over date.

**STOP if:** either call raises · cash is not 383,600.00 · either date is unstamped · you are about
to post a second opening balance for an account (the function refuses; a correction goes through
`post_reconciliation_adjustment`).

**From here, rollback means restoring the stage 1 snapshot.**

---

## Stage 10 — Verify Legacy / Unclassified is −2,452,500

```sql
SELECT current_balance FROM v_account_balances WHERE account_code = 'LEGACY-UNCLASSIFIED';
```

Expect **−2,452,500.00**: −2,068,900 from the backfill, less 383,600 released as the counted cash,
less 0 for the bank.

It gets _larger_, not smaller, and that is the point — counted money nobody can account for is more
unexplained funding, not less.

**STOP if:** the figure is not exactly −2,452,500.00. Do not reclassify an amount you cannot explain
the arithmetic of.

---

## Stage 11 — The controlled reclassification

```sql
SELECT * FROM reclassify_legacy_funds(
  _destination_code        => 'HISTORICAL-FUNDING-SUSPENSE',
  _reason                  => 'Management instructed that this historical unexplained balance be cleared. The source of the funding has not been identified, so it is held as an unidentified-funding liability rather than treated as owner capital.',
  _authorised_by           => 'Chetu Microfinance management',
  _amount                  => NULL,            -- NULL = the whole balance
  _authorisation_reference => '<minute, email or instruction reference>',
  _transaction_date        => DATE '<cut-over date>');
```

Returns:

| Column                    |                      Expected |
| ------------------------- | ----------------------------: |
| `source_code`             |         `LEGACY-UNCLASSIFIED` |
| `original_legacy_balance` |                 −2,452,500.00 |
| `amount_reclassified`     |                  2,452,500.00 |
| `residual_after`          |                      **0.00** |
| `destination_code`        | `HISTORICAL-FUNDING-SUSPENSE` |

**STOP if:** the call raises · `residual_after` is not 0.00 · the amount is not 2,452,500.00 · you
are tempted to pass a destination other than `HISTORICAL-FUNDING-SUSPENSE`. Equity is **not** an
approved destination today: nobody has identified the source, and booking it to capital would assert
the owners provided it.

---

## Stage 12 — Verify Legacy = 0 and Suspense = 2,452,500

```sql
SELECT account_code, account_class, current_balance, natural_balance
  FROM v_account_balances
 WHERE account_code IN ('LEGACY-UNCLASSIFIED','HISTORICAL-FUNDING-SUSPENSE','CAPITAL-INTRODUCED');
```

| Account                       | Class          |                     Expected |
| ----------------------------- | -------------- | ---------------------------: |
| `LEGACY-UNCLASSIFIED`         | asset · liquid |                     **0.00** |
| `HISTORICAL-FUNDING-SUSPENSE` | **liability**  |             **2,452,500.00** |
| `CAPITAL-INTRODUCED`          | equity         | **2,090,000.00** (unchanged) |

The journal and the audit trail:

```sql
SELECT r.reclassification_ref, r.source_code, r.original_legacy_balance, r.amount,
       r.residual_after, r.destination_code, r.reason, r.authorised_by,
       r.authorisation_reference, r.performed_by, r.performed_at, t.transaction_number
  FROM legacy_reclassifications r JOIN financial_transactions t ON t.id = r.transaction_id;

SELECT a.account_code, a.account_class, l.direction, l.amount
  FROM financial_transaction_lines l JOIN financial_accounts a ON a.id = l.account_id
  JOIN financial_transactions t ON t.id = l.transaction_id
 WHERE t.reference_number LIKE 'CM-RECLASS%' ORDER BY l.line_no;
```

Expect `LEGACY-UNCLASSIFIED` debit 2,452,500.00 and `HISTORICAL-FUNDING-SUSPENSE` credit
2,452,500.00, and one audit row carrying all of the above.

The Statement of Financial Position:

```sql
SELECT cash_at_hand, cash_at_bank, outstanding_principal, security_held,
       unidentified_funding, total_liabilities, capital_introduced, total_income, net_worth_ledger
  FROM v_money_position;
```

|                                     |                                                    Expected |
| ----------------------------------- | ----------------------------------------------------------: |
| Cash at Hand                        |                                                  383,600.00 |
| Bank                                |                                                        0.00 |
| Loans Receivable                    |                                                5,891,800.00 |
| **Member security held**            | **990,000.00** — members' money alone, and a liability only |
| **Unidentified historical funding** |                                            **2,452,500.00** |
| Total liabilities                   |                                                3,442,500.00 |
| Capital introduced                  |                                                2,090,000.00 |
| Income                              |                                                  742,900.00 |

**Assets 6,275,400 = liabilities 3,442,500 + equity 2,090,000 + income 742,900.**

**STOP if:** Legacy is not 0.00 · Suspense is not 2,452,500.00 · Capital Introduced has moved off
2,090,000 · `security_held` reads anything but 990,000 (if it reads 3,442,500 the view fix did not
apply, and three reports will misdescribe members' deposits) · the statement does not balance.

### Member security exceeds available cash, and that is correct

Management has confirmed the 990,000 of member security is **deployed in operations** — it is working
in the loan book, not ring-fenced in cash or at the bank. The ledger already records it that way and
always has: at disbursement the security is credited to the liability while only the _net_ cash
leaves the funding account, so the money stays in the business. It is debited only when
`return_loan_security` actually pays a member back.

So the books will show 990,000 owed to members against 383,600 of cash, and **that is the true
position, not an error**. Do not create a cash or bank account for the security, do not post a
balancing adjustment, and do not touch any historical transaction to make the two numbers meet. The
obligation is real and the liquidity gap is real; both belong on the statement.

The Financial Position report, the printed statement and the Financial Ledger panel each now carry a
note saying so, so a reader does not mistake it for a fault.

---

## Stage 13 — Mark the cut-over complete

```sql
UPDATE settings
   SET financial_cutover_date = DATE '<cut-over date>',
       financial_cutover_completed = TRUE
 WHERE id = 1;

SELECT financial_cutover_date, financial_cutover_completed FROM settings WHERE id = 1;
SELECT * FROM v_ledger_health;   -- still zero rows
```

This also **permanently disables the system reset**: `reset_operational_data()` refuses outright from
now on. And it arms the `legacy_unresolved_after_cutover` check, so a legacy balance cannot drift
back unnoticed.

**STOP if:** the flag does not read `true` · `v_ledger_health` returns any row. It will now report a
non-zero Legacy balance, which is exactly what you want it watching.

---

## Stage 14 — Regenerate the Supabase types

```
GET https://api.supabase.com/v1/projects/xfkuptxrrnzumzmulblg/types/typescript
```

Write to `src/integrations/supabase/types.ts`, then:

```sh
node ./node_modules/typescript/lib/tsc.js --noEmit
npm run build
```

Commit the regenerated file.

**STOP if:** typecheck fails · the build fails · the generated file is empty or truncated. The typed
client rejects the new columns until this is done, so do not deploy ahead of it.

---

## Stage 15 — Deploy the frontend

Deploy `main` at the commit carrying the regenerated types (stage 14), not `75d092d` itself.

Confirm the deployed build carries none of these: a `.sql` file served from the web root · a
"Savings — Management" section in the sidebar · a "Reset all operational data" panel in Settings.

**STOP if:** any of those three is present · the deployed commit is not the one you just built ·
the site does not load for a signed-in user.

---

## Stage 16 — Smoke tests, with real staff on real roles

Lending is still frozen. Use small amounts and reverse what you can. Someone watches the Financial
Ledger screen throughout.

|   # | Test                                                            | Expected                                                                               |
| --: | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
|   1 | Sign in as Administrator, Branch Manager, Loan Officer, Auditor | each lands on their own scoped dashboard                                               |
|   2 | Financial Ledger → account balances                             | Cash 383,600 · Bank 0 · Receivable 5,891,800                                           |
|   3 | Financial Ledger → ledger health panel                          | empty                                                                                  |
|   4 | Reports → Financial Position                                    | member security **990,000**, unidentified funding **2,452,500**, capital **2,090,000** |
|  4b | Reports → Financial Position, read the liabilities note         | states that member security is deployed in operations and not ring-fenced as cash      |
|   5 | Reports → Profit & Loss                                         | loan principal does **not** appear as revenue                                          |
|   6 | Disburse one small test loan, choosing a funding account        | loan Active **and** a disbursement journal, together                                   |
|   7 | Undo that disbursement                                          | reversing journal; balances return exactly                                             |
|   8 | Record a collection on a test loan, then reverse it             | receipt, instalment, loan balance and journal all move, then return                    |
|   9 | Record a small expense                                          | refused without an account; posts with one                                             |
|  10 | Internal transfer Cash at Hand → Centenary Bank, then reverse   | both balances move, then return; no income or expense touched                          |
|  11 | Internal transfer of more than the account holds                | refused, naming what it holds                                                          |
|  12 | Admit a test member                                             | admission fee posts its journal; a retry posts nothing                                 |
|  13 | Visit `/savings`                                                | closed notice, not the old screen                                                      |
|  14 | As a Loan Officer, try to open another officer's member         | refused                                                                                |
|  15 | Settings → Danger zone                                          | the reset panel is absent                                                              |

**STOP if:** any test fails · any journal is missing after an action that should have posted one ·
any balance does not return after a reversal · a report shows 3,442,500 as member security. Do not
reopen lending on a failing smoke test.

---

## Stage 17 — `v_ledger_health` still empty

```sql
SELECT * FROM v_ledger_health;
SELECT count(*) AS unbalanced FROM (
  SELECT transaction_id FROM financial_transaction_lines
   GROUP BY transaction_id HAVING sum(signed_amount) <> 0) x;
```

Zero rows, zero unbalanced journals — after all the smoke-test activity.

**STOP if:** either returns anything. Something in stage 16 left the ledger inconsistent, and that
must be understood before staff start work.

---

## Stage 18 — Reopen lending

Only now. Tell every branch the freeze is lifted, and brief the operators in person:

- Disbursement, collection and expense now **require** an account — where the money came from or went
  to, not just how it moved.
- A wrong or missing account now **fails** where it used to silently succeed. That is the fix, not a
  fault.
- Savings is closed until it can be journalled.
- The Financial Ledger screen shows ledger health; if it ever shows a row, tell management the same
  day.

```
Freeze lifted (UTC): __________    Briefed by: ______________________
```

**STOP if:** any earlier stage is unresolved · the snapshot from stage 1 has been deleted · nobody
has been briefed.

---

## After cut-over, still open

**Where the UGX 2,452,500 came from.** It now sits as a liability, which is the prudent reading while
the source is unknown. When Chetu identifies it, one controlled journal moves it on — the same
function, the same audit series:

```sql
SELECT * FROM reclassify_legacy_funds(
  _destination_code        => 'CAPITAL-INTRODUCED',   -- or a director's-loan liability
  _reason                  => '<what Chetu confirmed>',
  _authorised_by           => '<who confirmed it>',
  _amount                  => NULL,
  _authorisation_reference => '<reference>',
  _transaction_date        => CURRENT_DATE,
  _source_code             => 'HISTORICAL-FUNDING-SUSPENSE');
```

**Savings** stays closed until a migration integrates it. **Penalties** remain architecture, not
feature. **Interest** is recognised when collected, not accrued.

---

## Execution log — attempt 1, 2026-10-02, halted at stage 4

Stages 1–3 passed. Stage 1 could take no snapshot (no tool on the current plan; the
Management API was denied by the egress proxy), and the user authorised proceeding without
one. Stage 3's gate returned `PROCEED` at 07:36:55 UTC — every posting input matched.

**Stage 4 could not be executed, and nothing was applied.** Every attempt to commit a write
to production hung for 60 seconds and rolled back whole.

| Attempt                                        | Result               | Production after      |
| ---------------------------------------------- | -------------------- | --------------------- |
| `execute_sql`, `001300`                        | timed out after 60 s | unchanged, verified   |
| `execute_sql`, `001300` (retry)                | timed out after 60 s | unchanged, verified   |
| `apply_migration`, `001300`                    | timed out after 60 s | unchanged, verified   |

Diagnosis, established by probe rather than assumption:

- A read returns in well under a second.
- `create temp table … ; insert … ; select …` succeeds instantly — the SQL itself is fine.
- `begin; create table public._cutover_probe(x int); … ; rollback;` succeeds instantly, which
  also proves the session is **not** a Postgres read-only transaction.
- The same `create table` **without** the rollback times out.

So the gate is on **commit**: a statement that would persist a change waits on an interactive
confirmation that a cloud session cannot surface, and the client gives up at 60 s. It is not
a timeout in Postgres, not a lock, and not the size of the migration.

No alternative channel exists from this container:

- `api.supabase.com` — CONNECT denied 403 by the environment's network policy.
- `db.xfkuptxrrnzumzmulblg.supabase.co` — AAAA only, and the container has no IPv6.
- `aws-0/aws-1-eu-west-1.pooler.supabase.com:5432` — resolves over IPv4, raw TCP egress blocked.

`psql` and `SUPABASE_DB_PASSWORD`/`SUPABASE_ACCESS_TOKEN` are all present; only the network
stands in the way.

### State after the halt — verified at 07:48:30 UTC

`financial_accounts` absent · `guard_financial_account_change` absent · probe table absent ·
`supabase_migrations.schema_migrations` 13 rows, latest `20260101001200` · 18 loans ·
26 repayments · 24 member fees · 2 bank transactions totalling 2,090,000.00 · 0 expenses ·
0 savings transactions.

Identical to the stage 3 baseline. **Lending remains frozen**, because the ledger is not in
place and the cut-over has not happened.

### To resume

Either widen the environment's network access to reach `api.supabase.com`, then re-run from
stage 3 (re-derive the baseline first — it is a gate, not a formality), or apply
`001300`–`002400` from a machine with database access, in order, one at a time.
