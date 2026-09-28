-- ===========================================================================
-- Register the already-applied migrations in Supabase's migration history
-- ===========================================================================
-- DO NOT RUN THIS UNTIL YOU HAVE READ THE PARAGRAPH BELOW.
--
-- This file records that migrations 20260101000000 through 20260101001200 are
-- already present in production. It records only. It creates no table, drops
-- nothing, and changes no row outside `supabase_migrations.schema_migrations`.
--
-- It is safe because the claim it records was proved, not assumed: the thirteen
-- migrations were replayed into an empty database and both sides fingerprinted
-- over 1,407 object definitions — column types and defaults, constraint and
-- index definitions, function bodies, trigger definitions, policy commands with
-- their USING and WITH CHECK expressions, RLS flags, sequences, views and every
-- table grant. All ten categories hashed identically. See
-- `docs/financial-architecture/06-PREFLIGHT-VERIFICATION.md`.
--
-- IT MUST NOT BE USED TO RE-RUN ANYTHING. Several of these migrations are not
-- idempotent — `…000000_core_schema` creates twenty-seven tables and seeds them
-- unconditionally. `statements` is left NULL, which is what the CLI itself
-- writes for a migration repaired as already applied: it says "this version is
-- accounted for", not "here is how to reproduce it".
--
-- Run it once, in the Supabase SQL editor or through the Management API, as
-- step 2 of the deployment sequence — before applying …001300 onward, so the
-- new migrations are recorded in a history that is already complete.
-- ===========================================================================

BEGIN;

-- The schema and table as the Supabase CLI creates them. Each ALTER is
-- conditional, so this matches whatever column set the installed CLI expects:
-- older versions know version/statements/name, newer ones add the last two.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT NOT NULL PRIMARY KEY
);

ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS statements      TEXT[];
ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS name            TEXT;
ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS created_by      TEXT;
ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- `version` is the timestamp prefix and `name` the remainder of the filename,
-- which is how the CLI splits them and how `supabase migration list` pairs a
-- local file with a remote row. Getting either wrong shows the migration as
-- missing locally and invites someone to apply it again.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20260101000000', 'core_schema',               NULL),
  ('20260101000100', 'security_helpers',          NULL),
  ('20260101000200', 'row_level_security',        NULL),
  ('20260101000300', 'business_rules',            NULL),
  ('20260101000400', 'transfers',                 NULL),
  ('20260101000500', 'persist_loan_fees',         NULL),
  ('20260101000600', 'reference_number_sequences',NULL),
  ('20260101000700', 'real_email_login',          NULL),
  ('20260101000800', 'business_day_control',      NULL),
  ('20260101000900', 'business_day_traceability', NULL),
  ('20260101001000', 'branch_network',            NULL),
  ('20260101001100', 'staff_management',          NULL),
  ('20260101001200', 'schedule_integrity',        NULL)
ON CONFLICT (version) DO NOTHING;

-- Refuse to commit unless exactly the thirteen are on record. If this raises,
-- nothing above is kept.
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
   WHERE version BETWEEN '20260101000000' AND '20260101001200';
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'Expected 13 registered migrations, found %', v_n;
  END IF;
  RAISE NOTICE 'Migration history now records % applied migrations.', v_n;
END $$;

COMMIT;

-- Afterwards, `supabase migration list` should show 000000–001200 present both
-- locally and remotely, and 001300–002200 local-only, waiting to be applied.
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
