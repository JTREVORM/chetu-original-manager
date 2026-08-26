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

There is **no test suite** — no test runner is installed and there are no test files. Verify changes
by typechecking, building, and driving the running app.

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

`supabase/migrations/` holds eight files that are replayable in order against an empty database. The
first four build the system and **must run in sequence**, because each depends on the one before:

| File | Contents |
| --- | --- |
| `…000000_core_schema` | 27 tables, sequences, indexes, seed rows |
| `…000100_security_helpers` | the `private` schema and its 10 helper functions |
| `…000200_row_level_security` | RLS enabled on every table, ~70 policies |
| `…000300_business_rules` | triggers: signup, `updated_at`, reference numbers, approval and lifecycle guards |

`supabase/legacy-migrations/` contains 48 archived files from the original history. They are **not
replayable** — that history contained several full `DROP SCHEMA public CASCADE` rebuilds, so running
it in order collides with itself. It is kept as documentation only; never add to it.

`supabase/RESET_AND_MIGRATE.sql` is the four files concatenated behind a schema drop, for pasting
into the Supabase SQL editor.

## Architecture

### Authorisation is in the database, not the UI

Four roles: Administrator, Branch Manager, Loan Officer, Auditor. Two independent mechanisms enforce
them, and UI checks are a courtesy on top of both:

1. **RLS policies** answer *may this person touch this row?* They are written entirely in terms of
   `private.*` helper functions (`is_admin()`, `is_management()`, `can_see_client()`, …). The
   `private` schema is not exposed through PostgREST, so a signed-in client cannot call the helpers
   to probe the permission model. Every write policy carries `NOT private.is_auditor()`.

2. **Trigger guards** answer *may this person make **this** change?* Approving a group, writing a
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

| Import | Typed? | Use for |
| --- | --- | --- |
| `src/lib/supabase.ts` | no | `DatabaseContext` and general app queries |
| `src/integrations/supabase/client.ts` | yes, from `types.ts` | anything wanting generated types |
| `src/integrations/supabase/client.server.ts` | — | **service role, server only** |

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
