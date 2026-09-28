# Savings — closed until it can be journalled

Migration `20260101002300_savings_financial_guard.sql`, plus the navigation and application changes
that go with it. Production remains untouched and PR #3 is not merged.

Migration 002200 closed every way of moving money without a journal and named one exception:
savings. This closes it.

---

## What savings actually is in production

|                                                    |                                                  |
| -------------------------------------------------- | ------------------------------------------------ |
| Savings accounts                                   | **25**, every one at zero                        |
| Created                                            | 7–22 September 2026, one per member at admission |
| Savings transactions **ever recorded**             | **0**                                            |
| Savings liability account in the chart of accounts | none                                             |

The module has never been used. Accounts exist because `addClient` opens a zero-balance one for
every new member — and swallows the error if it fails, which is how they came to be there without
anyone deciding.

## The decision: Option B, disable

Integrating savings now would not have been a guard, it would have been building the product. There
is no savings liability account, and no answer recorded anywhere to what a savings account at Chetu
_is_: whether it earns interest, whether a balance may go negative, what a withdrawal may be refused
for, whether a group account is the sum of its members' or a thing in its own right. Those are
Chetu's decisions, not ours, and the brief was explicitly not to build savings features.

The code could not have been journalled as it stood either. `addSavingsTransaction` contained every
fault this programme removed elsewhere, at once:

| Fault                                                                                           | Where it has bitten before                                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| reference number from `savingsTransactions.length + 1`, an RLS-filtered array                   | the documented bug that stopped the second loan officer submitting their first application    |
| `if (!accError)` / `if (!txError)` — errors tested only to decide whether to update local state | the exact shape of the discarded error that left fifteen loans disbursed with no ledger entry |
| returns a transaction with a client-invented id when the insert fails                           | the screen prints a receipt for a row that does not exist                                     |
| `savings_accounts.balance` maintained as a stored total from the browser                        | "there is no stored balance anywhere — a stored total is a total that can drift"              |
| `Math.max(0, balance - amount)`                                                                 | an over-withdrawal is silently absorbed rather than refused                                   |
| balance and transaction written in two round trips                                              | non-atomic, like settlement and write-off were                                                |

Fixing all six _is_ rewriting the module. So it is closed, cleanly, rather than half-wired.

## What the migration does

- **`savings_transactions`** — `trg_guard_savings_transaction` refuses every INSERT, UPDATE and
  DELETE arriving from a PostgREST session. A savings transaction is money and nothing else.
- **`savings_accounts.balance`** — `trg_guard_savings_balance` refuses any change to that one
  column. The account itself is untouched: admission still opens one for every new member, and an
  account can still be closed or renamed, because none of that moves a shilling.
- Both use `private.is_api_write()` and are `SECURITY INVOKER`, for the same reason as every guard
  in 002200: a `SECURITY DEFINER` trigger would see the owner as `current_user` whoever called it,
  and that is the fact being read. `service_role` is not blocked, as everywhere else.
- **`v_ledger_health`** gained `savings_transaction_without_journal` and
  `savings_balance_without_ledger`. This is what makes leaving `service_role` open safe: if a
  savings transaction or a non-zero balance ever appears while savings cannot journal one, it is
  reported immediately. Both checks are proved to fire, not merely present — the suite creates the
  condition as the owner, asserts the view reports it, and puts it back.

## The seam for reopening it

`private.savings_ledger_ready()` returns `FALSE`. It is a **function rather than a settings row on
purpose**: no flag in the application, and no row a support engineer can flip in the SQL editor,
turns savings back on. It takes a migration, which is the right weight for the decision — a deposit
cannot be taken until the ledger has somewhere to put it.

A future `…002400_savings_ledger.sql` needs all of:

1. a `SAVINGS-HELD` liability account in `financial_accounts`;
2. `record_savings_deposit(account, amount, method, receiving_account)` — debit the cash, bank or
   wallet account, credit `SAVINGS-HELD`, write the transaction, one transaction;
3. `record_savings_withdrawal(...)` — the mirror, refusing rather than clamping when the balance
   will not cover it;
4. `undo_savings_transaction(...)` — a reversing journal, never a delete;
5. the balance derived from the ledger rather than stored, as `v_account_balances` does it;
6. `private.savings_ledger_ready()` replaced to return `TRUE`, last.

Until step 6, the guard stands and `v_ledger_health` watches.

## In the application

- **Savings is out of the navigation.** The whole "Savings — Management" section is gone from the
  sidebar; verified absent from the production bundle.
- `/savings` and `/savings-accounts` still resolve and render a closed notice, so an old bookmark
  meets a sentence rather than a 404. The notice says why, and shows how many accounts are open and
  that they hold nothing.
- `addSavingsTransaction` is a refusal that throws immediately. It is left in place rather than
  deleted, with the six faults listed in its docstring, because whoever reopens savings needs that
  list. The database is the control; this is so a caller fails legibly rather than at the edge.
- The interactive `Savings.tsx` is untouched and unreferenced, so reopening is a routing change plus
  the rewrite the docstring describes.

## Tests

**222 passed, 0 failed** — 201 before, 21 added.

| Proves                                         | How                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| direct savings writes are rejected             | deposit, withdrawal, update and delete attempted as a real signed-in caller                                                |
| unauthorized users rejected                    | Loan Officer, Branch Manager, Administrator and Auditor each refused                                                       |
| no partial state is possible                   | after every attempt: account count unchanged, balances unchanged and zero, no transaction created                          |
| the balance cannot move either                 | the other route to a shilling appearing, refused for officer and administrator alike                                       |
| existing records remain unchanged              | asserted before and after, and accounts are still openable and closable                                                    |
| the integration is genuinely absent            | `savings_ledger_ready()` is FALSE, no `record_savings_*` or `post_savings_*` function exists, no `SAVINGS%` account exists |
| no savings event can exist without its journal | both health checks present, empty, **and proved to fire** by creating the condition and putting it back                    |

The "authorized atomic savings operation works" and "failed journal posting rolls back" cases are
not applicable under Option B — there is no savings posting operation, and the suite asserts that
absence explicitly rather than skipping it quietly.

Typecheck and build clean. Lint 30 errors / 45 warnings, all pre-existing on `main`.
