-- ===========================================================================
-- CHETU MICROFINANCE — security helper functions
-- ===========================================================================
-- Every row level security policy is expressed in terms of these functions.
-- They live in a `private` schema that is deliberately not exposed through
-- PostgREST, so a signed-in client cannot call them directly to probe the
-- permission model — only the policy engine evaluates them.
--
-- All are SECURITY DEFINER with a pinned search_path: they read
-- `public.profiles`, which is itself protected by RLS, and would otherwise
-- recurse into their own policies.
--
-- The visibility model, in one place:
--   Administrator  institution-wide, read and write
--   Auditor        institution-wide, read only (every write policy denies)
--   Branch Manager everything in the branches on their profile
--   Loan Officer   only the records they registered or are assigned to
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_staff_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Administrator' $$;

CREATE OR REPLACE FUNCTION private.is_auditor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Auditor' $$;

CREATE OR REPLACE FUNCTION private.is_branch_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Branch Manager' $$;

CREATE OR REPLACE FUNCTION private.is_admin_or_auditor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator', 'Auditor') $$;

-- The two roles that may approve or reject a submission.
CREATE OR REPLACE FUNCTION private.is_management()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator', 'Branch Manager') $$;

-- NULL means "not branch-scoped at all" (Administrator, Auditor). Policies
-- test `IS NULL OR <id> = ANY (...)`, so NULL reads as institution-wide.
CREATE OR REPLACE FUNCTION private.caller_branch_ids()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT CASE WHEN p.role IN ('Administrator', 'Auditor') THEN NULL
                  ELSE COALESCE(p.branch_ids, '{}') END
      FROM public.profiles p WHERE p.id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Record reachability
-- ---------------------------------------------------------------------------
-- A Branch Manager reaches every record in their branches — without this they
-- could not approve the group and member submissions their officers raise, nor
-- see the loans behind them, which is the entire point of the role.
CREATE OR REPLACE FUNCTION private.can_see_client(_client_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.clients c
                   WHERE c.id = _client_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_group(_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.client_groups g
                   WHERE g.id = _group_id
                     AND (g.created_by = auth.uid()
                          OR g.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND g.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_loan(_loan_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.loans l
                   JOIN public.clients c ON c.id = l.client_id
                   WHERE l.id = _loan_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;

-- ---------------------------------------------------------------------------
-- Lock the helpers down: reachable by the policy engine, not by clients.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'current_staff_role()', 'is_admin()', 'is_auditor()', 'is_branch_manager()',
    'is_admin_or_auditor()', 'is_management()', 'caller_branch_ids()',
    'can_see_client(text)', 'can_see_group(text)', 'can_see_loan(text)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION private.' || f || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.' || f || ' TO authenticated, service_role';
  END LOOP;
END
$do$;
