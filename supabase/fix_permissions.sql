-- ============================================================================
-- FIX: "permission denied for schema public"
-- ============================================================================
-- Your RLS policies (fix-rls-policies-safe.sql / migrations) are correct,
-- but Postgres also requires base GRANTs on the schema and tables BEFORE
-- RLS is ever evaluated. The fresh_schema_with_rls.sql migration only
-- granted privileges to `service_role`, never to `anon` / `authenticated`.
-- That's why every insert/select from the app (using the anon/authenticated
-- key) fails with "permission denied for schema public".
--
-- Run this whole file once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Allow the roles to even "see" the public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant table-level privileges for all EXISTING tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public
  TO anon;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  TO service_role;

-- 3. Grant sequence privileges (needed for SERIAL/IDENTITY id columns,
--    and harmless if you use gen_random_uuid()/TEXT ids instead)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, anon;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  TO service_role;

-- 4. Make sure any FUTURE tables/sequences you create automatically get
--    these same privileges (so this class of bug can't happen again)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- ============================================================================
-- DONE. Your existing RLS policies (per-table USING/WITH CHECK clauses)
-- remain in full effect on top of these grants — this only unblocks the
-- base permission check that happens before RLS is evaluated.
-- ============================================================================
SELECT 'Base schema/table permissions granted to anon and authenticated.' AS status;
