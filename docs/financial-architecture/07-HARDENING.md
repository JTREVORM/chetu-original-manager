# Hardening — closing the last ways round the ledger

Migration `20260101002200_financial_hardening.sql`, plus the application and test changes that go
with it. Production is still untouched: nothing here has been applied, and PR #3 is not merged.

The pre-flight review left three findings. All three are closed, and looking for them turned up two
more that were worse — not bypassable, but never wired at all.

---

## The rule this states

> No financial business event may be committed unless its balanced journal is committed in the same
> database transaction.

Migration 002100 made the application obey that. It did not make the database enforce it, so the
guarantee ended at the edge of the application: a signed-in officer holding the anon key could
update `loans` or insert into `loan_repayments` directly and the ledger would never hear about it.
That is the original failure reachable by a second door.

## How the guard knows

PostgREST runs a request as the role in the caller's token — `anon` or `authenticated`. Every
posting function is `SECURITY DEFINER` owned by the database owner, so inside one, `current_user` is
the owner rather than the caller. `private.is_api_write()` reads exactly that difference.

It needs no session flag a client might try to set, and no change to migrations 001300–002100. The
guards themselves are deliberately **`SECURITY INVOKER`**: a `SECURITY DEFINER` trigger would see
the owner as `current_user` whoever called it, which is the very fact being read.

`service_role` is not blocked. It already bypasses row level security and holds the keys to the
database; the seed, clear and repair scripts run under it. The boundary being drawn is the one
`private.is_admin()` and its neighbours already draw: a signed-in user with the anon key.

Triggers, not `REVOKE`, for two reasons. A `REVOKE` is silently undone by any later
`GRANT … ON ALL TABLES IN SCHEMA public`, which this repository's own migrations do. And a trigger
can name the function to call instead, which is the difference between a developer fixing their code
in a minute and filing a bug. `block_legacy_bank_write` set the pattern in 001900.

---

## 1. Direct-write paths, closed

`loans` keeps its non-financial life: approval creates it, terms are edited while it is Pending, the
bad-debt flag is set from the screen. What is guarded is the handful of column changes that **are**
the financial event.

| Table                     | Guarded                                                                                                                                                                                                                                                                                                                  | Still allowed                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `loans`                   | INSERT already disbursed or closed; any change to `disbursed_at`, `settled_at`, `writeoff_at`, `outstanding_balance`, `security_balance`, `settlement_amount`, `writeoff_amount`, `writeoff_status`, the principal of a disbursed loan, or a status move into or out of the active lifecycle; DELETE of a disbursed loan | creating a Pending loan, editing a Pending loan, deleting a Pending loan (the approval rollback), the bad-debt flag and its comment |
| `loan_repayments`         | every INSERT, UPDATE and DELETE                                                                                                                                                                                                                                                                                          | —                                                                                                                                   |
| `expenses`                | every INSERT, UPDATE and DELETE                                                                                                                                                                                                                                                                                          | —                                                                                                                                   |
| `member_fees`             | every INSERT, UPDATE and DELETE                                                                                                                                                                                                                                                                                          | —                                                                                                                                   |
| `loan_security_returns`   | every INSERT, UPDATE and DELETE                                                                                                                                                                                                                                                                                          | —                                                                                                                                   |
| `loan_reversals`          | every INSERT, UPDATE and DELETE                                                                                                                                                                                                                                                                                          | —                                                                                                                                   |
| `loan_repayment_schedule` | changes to `paid_amount` and `remaining_balance`                                                                                                                                                                                                                                                                         | building a schedule, correcting a due date                                                                                          |
| `bank_transactions`       | everything, as before — now on the precise discriminator                                                                                                                                                                                                                                                                 | reading                                                                                                                             |

The legacy register's guard previously allowed anything when `auth.uid()` was NULL. That was meant
to say "service role". It also said "signed out", and — a real hole — it said "a token carrying
`role: authenticated` with no `sub` claim", which `auth.uid()` reports as NULL. It now uses the same
discriminator as everything else.

### Half a financial event is closed too

With settlement, write-off, member fees and security refunds atomic, `post_disbursement`,
`post_repayment`, `post_expense`, `post_member_fee`, `post_security_refund` and `post_writeoff` are
each called by an atomic function and by nothing else. Left granted, they were the mirror of the
hole being closed: a journal posted for a business record nothing wrote. EXECUTE is revoked from
`authenticated`; the atomic functions still reach them as the owner. They are gone from
`ledger.ts` too.

`post_capital_injection`, `post_capital_withdrawal`, `post_internal_transfer`,
`post_reconciliation_adjustment`, `post_opening_balance` and `reverse_financial_transaction` stay
open: each is a financial event in its own right, driven from the Financial Ledger screen, with no
business row to be atomic with.

## 2. Settlement and write-off, made atomic

`settle_loan(...)` closes every unpaid instalment, writes the receipt, releases the security, moves
the loan to `Settled` and posts the journal — one transaction. `write_off_loan(...)` closes the
loan, minutes it against the member and posts the loss — one transaction.

Both replace a sequence of round trips that could, and one day would, stop half way. The old
settlement even said so in its error message: _"Reverse the receipt before retrying."_

The settlement split follows the rule the rest of the ledger uses: principal first, up to what the
loan book still says is owed, and the remainder is interest. A settlement discounted below the
outstanding principal leaves the shortfall on Loans Receivable exactly as the loan book leaves it,
so `v_ledger_health` stays quiet and the loss stays visible until someone writes it off on purpose.

## 3. Two paths that were never wired at all

`post_member_fee` and `post_security_refund` have existed since 001600 and **nothing called them**.

- Member admission wrote the fee row straight from the screen. Every admission fee taken after
  cut-over would have been invisible to the ledger.
- The security-return screen wrote the refund row and reduced `loans.security_balance`, and posted
  nothing. Cash would have left the building against a liability that never moved.

Both now go through `record_member_fee(...)` and `return_loan_security(...)`, each atomic, each
needing an account — so the screens gained an account picker, because the ledger will not accept
"Cash" as an answer to _where did the money go_. `record_member_fee` is once per member: a retry
returns the existing row and posts nothing, so fee income cannot double-count.

`v_ledger_health` learned three checks it could not previously make:
`member_fee_without_journal`, `security_refund_without_journal` and `writeoff_without_journal`.

## 4. `clearAllData`

It is a demonstration and training reset, reached from Settings behind a typed confirmation. It
predates the ledger: fifteen `delete()` calls from the browser with no error checked, which would
have deleted the loans while leaving every journal standing, and whose `bank_transactions` delete
now fails against the legacy-register guard — silently, because nothing read the error.

It is now `reset_operational_data('RESET ALL DATA')`: one transaction, foreign-key order, ledger
first, every table the financial schema added, a row count returned per table, and **it refuses
outright once `settings.financial_cutover_completed` is set**. Once a real opening balance has been
posted, these rows are Chetu's financial history and there is no button that erases them. The chart
of accounts survives as configuration; its cut-over stamps are cleared.

The Settings panel is additionally behind `import.meta.env.DEV`, so it is not in a production
bundle at all — verified absent from `.output/` after a build. That is a convenience; the database
refusal is the control.

## 5. The schema dumps under the web root

`public/schema_restore.sql` and `public/schema_test.sql` were copied verbatim into
`.output/public/` by every build and served from a public repository's web root.

`schema_restore.sql` is a complete dump — 26 tables, 24 function bodies, 94 row level security
policies — describing the whole permission model to anyone who requested the URL. It contains no
credential, connection string or key; a scan of the full Git history found none either, and `.env`
has never been committed. So: an information leak, not a breach, and **no history was rewritten**,
which is the honest position — the file remains in Git history and in any build already deployed.
That is survivable because authorisation here is enforced by row level security and trigger guards,
not by nobody knowing the table names.

It moved to `supabase/archive/`, which is not served, with a README explaining that it also predates
Branch Managers, business days, the branch network, staff management and the ledger, so it is
historical rather than useful. `schema_test.sql` was one line (`CREATE TABLE test_hello (id int);`)
and was deleted. After rebuilding, no `.sql` is served.

---

## Tests

**201 passed, 0 failed** — 138 before, 63 added. The new `hardening` area proves, as a real
signed-in caller over the same surface PostgREST exposes:

- a Loan Officer cannot mark a loan Active, stamp `disbursed_at`, insert a receipt, mark an
  instalment paid, record a member fee or record a security refund;
- a loan cannot be created already disbursed;
- an Administrator cannot insert an expense, settle a loan, write one off, move a balance, release
  security, forge a reversal or delete a disbursed loan;
- the legacy bank register is closed to a signed-in caller;
- **and the non-financial writes still go through**: creating a Pending loan, deleting a Pending
  loan, declaring a bad debt, correcting a due date;
- `settle_loan` and `write_off_loan` do the whole job, balance their journals, and a settlement to a
  closed account leaves _no_ receipt, _no_ paid instalment and the loan still open;
- `record_member_fee` posts once and only once; `return_loan_security` refuses to refund more than
  is held;
- Auditors are refused settlement, fees and refunds; Loan Officers and Branch Managers are refused
  write-off;
- no single-step posting is callable from a session, while the five standalone ones still are;
- the reset is refused without the phrase, refused to a Loan Officer, and refused outright once the
  cut-over is complete;
- reversal still works, and `v_ledger_health` is empty at the end of all of it.

Typecheck and build are clean. Lint is 30 errors and 45 warnings, all pre-existing on `main` with an
identical file list.

## Still open

- **Savings is the one money-shaped module with no ledger integration.** All 25 accounts are zero
  and the module is unused, so `savings_accounts` and `savings_transactions` are writable and post
  no journal. Nothing is lost today. It must be wired before Chetu uses savings, and until then the
  module should stay out of staff hands.
- **Penalties remain architecture, not feature.** The accounts exist and are proven; no penalty
  logic is wired into collections and no historical penalty was invented.
- **Interest is recognised when collected**, not accrued.
- **Legacy / Unclassified −2,068,900** is unresolved by design; only a physical count resolves it.
- **PostgreSQL 16 locally against production's 17.6**, and Supabase branching remains unavailable.
