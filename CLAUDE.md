# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A group-lending management information system for Chetu Microfinance Ltd (Uganda). It records the
full life of a loan: group formation → member admission → loan application → approval →
disbursement → weekly collection → closure by repayment, early settlement or write-off.

TanStack Start (file-based routing) + React 19 + Tailwind v4, on Supabase (PostgreSQL 17) with row
level security.

## Commands

```sh
npm run dev            # vite dev — serves on http://localhost:8080
npm run build          # builds client, server and SSR bundles
npm run lint           # eslint
npm run format         # prettier --write .
```

There is **no test runner** and there are no test files. Verify changes by typechecking, building
and driving the running app.

Financial changes have their own harness, which is not a test framework:

```sh
scripts/financial-verify/run.sh        # needs a local PostgreSQL on port 55432
node scripts/verify-financials.mjs --project <ref> --migrate --seed
```

It rebuilds a throwaway database, applies the base migrations, seeds production's exact control
totals, applies the financial migrations so the backfills run over realistic data, then asserts
266 checks across journal balance, duplicate prevention, disbursement, repayment, allocation,
overdue, penalty, capital, expense, transfer, reversal, immutability, reconciliation, closure,
write-off, branch scoping, permissions, report reconciliation, the direct-write guards, the savings closure, internal transfers and the legacy reclassification. Both scripts refuse to run
against production — they post and reverse real journals.

### Typechecking

`npx tsc` resolves to an unrelated `tsc@2.0.4` package. Always invoke the local compiler directly:

```sh
node ./node_modules/typescript/lib/tsc.js --noEmit
```

### Shell

The user is on Windows. **Windows PowerShell 5.1 has no `&&` or `||`** — chaining with them is a
parser error. Use `;` or separate lines when handing the user commands to run.

Node is on the PATH in Git Bash but not necessarily in PowerShell.

## Database

There is no Supabase CLI and no `psql` in this environment. SQL is executed through the Supabase
Management API:

```
POST https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_ID}/database/query
Authorization: Bearer {SUPABASE_ACCESS_TOKEN}      # both are in .env
```

`.env` holds the service-role key and a management access token — either grants full control of the
database and bypasses every RLS policy. It is gitignored; keep it that way. The GitHub repo is
public.

### Migrations

`supabase/migrations/` holds twenty-five files that are replayable in order against an empty
database. The first four build the system and **must run in sequence**, because each depends on
the one before:

| File                         | Contents                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `…000000_core_schema`        | 27 tables, sequences, indexes, seed rows                                         |
| `…000100_security_helpers`   | the `private` schema and its 10 helper functions                                 |
| `…000200_row_level_security` | RLS enabled on every table, ~70 policies                                         |
| `…000300_business_rules`     | triggers: signup, `updated_at`, reference numbers, approval and lifecycle guards |

`…000400` through `…001200` add transfers, frozen loan fees, sequence-backed reference numbers,
real-email login, business-day control, the branch network, staff management and schedule
integrity. `…001300` through `…002400` are the financial ledger — see below.

Production carries **no migration history**: the `supabase_migrations` schema does not exist at
all, because everything was applied by hand through the SQL editor. Migrations 000000–001200 have
been verified byte-identical to production across 1,407 object definitions, so they can be recorded
as applied — `supabase/REGISTER_APPLIED_MIGRATIONS.sql` does exactly that and nothing else. Run it
before applying anything new, or the same drift recurs.

`supabase/legacy-migrations/` contains 48 archived files from the original history. They are **not
replayable** — that history contained several full `DROP SCHEMA public CASCADE` rebuilds, so running
it in order collides with itself. It is kept as documentation only; never add to it.

`supabase/RESET_AND_MIGRATE.sql` is the four files concatenated behind a schema drop, for pasting
into the Supabase SQL editor.

## Architecture

### Authorisation is in the database, not the UI

Four roles: Administrator, Branch Manager, Loan Officer, Auditor. Two independent mechanisms enforce
them, and UI checks are a courtesy on top of both:

1. **RLS policies** answer _may this person touch this row?_ They are written entirely in terms of
   `private.*` helper functions (`is_admin()`, `is_management()`, `can_see_client()`, …). The
   `private` schema is not exposed through PostgREST, so a signed-in client cannot call the helpers
   to probe the permission model. Every write policy carries `NOT private.is_auditor()`.

2. **Trigger guards** answer _may this person make **this** change?_ Approving a group, writing a
   loan off and reopening a closed loan are all ordinary UPDATEs as far as RLS is concerned; only
   `guard_group_approval_transition`, `guard_client_approval_transition` and
   `guard_loan_lifecycle_transition` can tell them apart.

When adding a role check, put it in the database first. An `if (isAdmin)` in a component is not a
control.

### DatabaseContext is the data layer

`src/context/DatabaseContext.tsx` (~2000 lines) fetches every table once, stitches relations
together (`loan.client`, `loan.schedule`, `repayment.loan`), derives role-scoped views
(`visibleLoans`, `visibleClients`, …) and exposes every mutation. Pages consume `useDatabase()` and
should not query Supabase directly for domain data.

Scoping is enforced **once**, in this file. Screens read the already-scoped collections rather than
re-filtering by role.

### Reference numbers come from the database

Loan numbers, receipts and the rest are allocated by `BEFORE INSERT` triggers backed by sequences.
Do **not** generate them client-side from `rows.length + 1`: that array is RLS-filtered, so every
officer counts only their own rows and they all produce `CM-LA-2026-0001`. This was a real bug — the
second loan officer could not submit their first application at all.

### Two Supabase clients — pick deliberately

| Import                                       | Typed?               | Use for                                   |
| -------------------------------------------- | -------------------- | ----------------------------------------- |
| `src/lib/supabase.ts`                        | no                   | `DatabaseContext` and general app queries |
| `src/integrations/supabase/client.ts`        | yes, from `types.ts` | anything wanting generated types          |
| `src/integrations/supabase/client.server.ts` | —                    | **service role, server only**             |

`types.ts` is generated. After a schema change, regenerate it from the live database (Management API
`/types/typescript`) or the typed client will reject the new columns.

Privileged staff operations go through `src/lib/admin-users.functions.ts`, a TanStack Start server
function that holds the service-role key server-side and re-checks that the caller is an active
Administrator. `supabase/functions/admin-users/` is a superseded duplicate — no Edge Function needs
deploying.

### MIS screens share one kit

`src/components/mis/MisKit.tsx` provides `useMisScope` (branch/officer/group filters with role
locking), `MisFilters`, `MisTable`, `MisModal`, `ActionButton`, `ScopeFields`, `MisDataCard` and the
`money`/`shortDate` formatters. Nearly every list screen is built from these; match the pattern
rather than hand-rolling a table.

`MisTable` renders a dense table on desktop and pale-blue `Label : Value` cards on mobile — the
layout the original UMIS system used. Columns keyed `act`/`action`/`pick`, or labelled `Action`,
become a button strip at the foot of the mobile card. Supply `text()` on a column whose `render`
returns JSX, or exports and tooltips get nothing.

### Money moves through a balanced ledger

`financial_transactions` + `financial_transaction_lines`: one journal per financial event, two or
more lines that **must sum to zero**, enforced by a deferred constraint trigger. Posted journals
are immutable — a mistake is corrected by a reversal that references the original, never by an
edit or a delete.

`financial_accounts` is the chart of accounts: real money locations (cash, till, branch cash,
bank, mobile money, merchant) alongside control accounts (Loans Receivable, Security Held,
Capital, the income and expense categories). **There is no stored balance anywhere.** A balance is
`opening_balance + SUM(lines)`, served by `v_account_balances`. A stored total is a total that can
drift, and drift is what this replaced.

**Never insert into the ledger directly** — no signed-in role can. Money moves only through the
`post_*` and atomic operation functions, which check the _business_ permission for the action,
validate the account, and post the journal in the same transaction:

| Function                                            | What it does                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `disburse_loan(loan, funding_account)`              | marks the loan, closes the application, posts the journal — together               |
| `record_loan_repayment(...)`                        | receipt, instalments, loan balance, journal — together                             |
| `record_expense(...)`                               | an expense cannot exist without the account that paid it                           |
| `post_capital_injection` / `post_internal_transfer` | capital has a destination; a transfer touches no income account                    |
| `undo_loan_disbursement` / `undo_loan_repayment`    | reverse the real journal, line for line                                            |
| `reverse_financial_transaction`                     | mirrors any journal and links back to it                                           |
| `settle_loan(...)`                                  | closes every instalment, releases the security, closes the loan, posts the journal |
| `write_off_loan(loan, reason)`                      | closes the loan, minutes it, recognises the loss                                   |
| `record_member_fee(...)`                            | admission and passbook fees; once per member, a retry posts nothing                |
| `return_loan_security(...)`                         | the refund record, the loan's remaining security and the journal                   |
| `record_account_reconciliation`                     | counts an account and, on approval, posts the adjustment                           |

This exists because of a real failure. `disburseLoan` used to insert into `bank_transactions`,
row level security rejected it for every Loan Officer, and the caller discarded the error —
`if (!txError && btData)`. Fifteen loans were disbursed with no financial record, and the ledger
read UGX 2,090,000 while 5,250,000 had gone out. **Never test a financial error only to decide
whether to update local state.**

`v_ledger_health` is the standing check that it has not come back. Any row is a financial fact the
ledger has lost track of; it should always be empty, and the Financial Ledger screen shows it.

Reports and the dashboard read `src/lib/financial/reports.ts`, one function per view, so they
cannot disagree. Do not re-sum rows in a screen — that is how the Dashboard, `branchMetrics.ts`
and `Reports.tsx` came to define "this month" three different ways.

`LEGACY-UNCLASSIFIED` holds every pre-ledger cash movement, because production never recorded
whether a shilling was in a till, a bank or a wallet. **`payment_method` is not an account** —
"Cash" says the member handed over notes, not where those notes went. Do not promote one to the
other. The legacy balance is resolved once, at cut-over, against a real count.

Clearing it needs `reclassify_legacy_funds` (migration `…002400`), because every other posting
function refuses a control account — rightly. It is Administrator-only, moves the balance only to an
equity or liability account (never to cash: this moves a classification, not money), and writes the
journal and a row in `legacy_reclassifications` together — the balance before, the amount, where it
went, why, on whose authority, by whom and when. That table is append-only and not writable by
`authenticated` at all. The destination is `CAPITAL-UNRECORDED`, kept apart from
`CAPITAL-INTRODUCED` so money of unknown origin is never merged with money of documented origin.

`post_internal_transfer` moves money between two liquid accounts: one balanced journal, no income,
no expense, and since `…002400` it refuses to spend more than the source holds. A blanket
non-negative rule would block disbursement on a day the bank is empty, so overdrafts arriving by any
other path are reported by `v_ledger_health` (`liquid_account_overdrawn`) instead of being blocked.
`post_opening_balance` accepts zero: it stamps the date and posts no journal, because a journal of
zero would have no lines.

`bank_transactions` is a closed legacy register: read-only, superseded, backfilled.

**The tables underneath are closed too.** Migration `…002200` puts a guard trigger on `loans`,
`loan_repayments`, `expenses`, `member_fees`, `loan_security_returns`, `loan_reversals` and the
paid columns of `loan_repayment_schedule`. It refuses any write arriving straight from PostgREST,
because `private.is_api_write()` sees `current_user` as `anon` or `authenticated` rather than the
owner a `SECURITY DEFINER` posting function runs as. The guards are `SECURITY INVOKER` for exactly
that reason. `service_role` is not blocked — the seed and repair scripts need it, and it bypasses
RLS anyway.

Non-financial writes still go through: creating, editing and deleting a _Pending_ loan, the
bad-debt flag, building a schedule, correcting a due date. Only the money moves are guarded.

The single-step `post_disbursement`, `post_repayment`, `post_expense`, `post_member_fee`,
`post_security_refund` and `post_writeoff` are no longer callable by `authenticated`: each writes
half a financial event and each is now reached only by the atomic function that owns it.

The Settings "System reset" is `reset_operational_data()` — one transaction, ledger first, and
**permanently refused once `settings.financial_cutover_completed` is set**. The panel is also
behind `import.meta.env.DEV`, so it is not in a production bundle.

**Savings is closed**, because it is the one money-shaped module that posts no journal. Production
has 25 accounts, all at zero, and has never recorded a savings transaction. Migration `…002300`
refuses every write to `savings_transactions` and any change to `savings_accounts.balance`; opening
and closing an account still works, because neither moves a shilling. Savings is out of the
sidebar, `/savings` renders a closed notice, and `addSavingsTransaction` throws — its docstring
lists the six faults that must be fixed before it can be reopened. The seam is
`private.savings_ledger_ready()`, a function rather than a settings row so that reopening takes a
migration; `v_ledger_health` reports any savings transaction or non-zero balance that appears
meanwhile.

### Fees are frozen onto each loan

`src/lib/fees.ts` is the single source: admission and passbook UGX 5,000 each; processing 4%, CRB 1%,
refundable security 15% of principal; UGX 2,000 group maintenance per loan.

All four charges are written onto the loan row at approval. Read them back with `storedLoanFees()`,
never by recomputing from `FEES` — otherwise a rate change retroactively restates every historical
loan. `feesMatchStored()` flags divergence so disbursement can warn.

The `settings` table's `default_interest_rate` and `default_processing_fee` are **dead columns**
nothing reads; loan terms come from the loan product, charges from the fee schedule.

### Authentication

Staff sign in with **their real email address, or their phone number**. Phone sign-in resolves to the
account email through `public.account_email_for_phone()`, which is deliberately callable before
authentication because nothing can be read from `profiles` without a session. Accounts created before
real emails existed still carry a derived `…@staff.chetumicrofinance.local` address, which the login
path tries as a fallback.

`scripts/create-admin.mjs` bootstraps the first Administrator — User Management requires an existing
Administrator, so the first one cannot be made in the app.

## Routing

TanStack Start file-based routing in `src/routes/`, using **dot notation for nesting**:
`reports.master-roll.tsx` → `/reports/master-roll`. Every page route wraps its component in
`<ProtectedLayout>`.

`src/routeTree.gen.ts` is generated at dev/build time. Typecheck errors saying a new route path is
"not assignable to `keyof FileRoutesByPath`" mean it is simply stale — run a build.

## Scripts

```sh
node scripts/create-admin.mjs <07xxxxxxxx> "<Full Name>" "<password>"
node scripts/seed-demo.mjs           # demo data across every module
node scripts/clear-demo.mjs          # removes exactly what the seed created, via its manifest
node scripts/build-icons.mjs         # regenerates the PWA icons from public/logo.svg
node scripts/capture-manual-shots.mjs   # needs a running dev server + demo data
node scripts/build-manual.mjs        # assembles docs/…User-Manual.pdf from those shots
```

The demo scripts read `.env` and use the service role. `clear-demo.mjs` deletes only what
`demo-manifest.json` records, so anything added through the app afterwards survives.

## Notes

- `README.md` is a stale leftover ("Sandbox Import Hub") describing a different project.
- `vite.config.ts`, `package.json` and `bunfig.toml` still reference the original hosting platform.
  These are load-bearing build configuration; the branding was deliberately left alone.
- The app is an installable PWA. `public/sw.js` exists mainly so browsers will offer installation —
  it deliberately caches nothing but an offline notice, because a cached bundle would strand staff on
  an old version and a cached response could show a stale balance as current.
