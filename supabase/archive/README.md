# Archive

Files kept for the record. Nothing here is replayable, and nothing here is served.

## Why this directory exists

`2026-04-schema-restore.sql` sat in `public/` — the web root — so every build published it at
`https://<site>/schema_restore.sql`, and the repository is public. It is a complete schema dump:
26 tables, 24 function bodies and 94 row level security policies, which together describe the whole
permission model to anyone who asked for the URL.

It held no credentials, no connection string and no key; a scan of the full Git history found none
either, and `.env` has never been committed. Nothing in the application ever read the file. So this
is an information leak, not a breach, and no history was rewritten — the file remains in the Git
history and in any build already deployed, which is the honest position to take: the structure it
describes should be treated as public, and it is safe to treat that way, because authorisation here
is enforced by row level security and trigger guards rather than by anyone not knowing the table
names.

`schema_test.sql`, one line long (`CREATE TABLE test_hello (id int);`), was deleted outright.

## What the dump is worth

Less than it looks. It predates the current system: its `profiles.role` check allows only
`Administrator`, `Loan Officer` and `Auditor`, so it was written before Branch Managers existed,
and it knows nothing of business days, the branch network, staff management, the schedule integrity
work or the financial ledger.

`supabase/migrations/` is the live description of the schema, and it has been verified
object-by-object against production: 1,407 object definitions, byte-identical. Read that instead.
This file is kept only so the earlier shape stays legible.
