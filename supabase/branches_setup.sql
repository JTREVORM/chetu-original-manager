-- RUN THIS IN THE SUPABASE SQL EDITOR.
--
-- Branch management:
--   * public.branches            — branches created by Administrators
--   * profiles.branch_ids        — branches a Loan Officer is attached to
--   * clients.branch_id          — branch that owns a member
--   * client_groups.branch_id    — branch that owns a group
--
-- Loan Officers only see data belonging to their attached branches. The app
-- enforces this in the UI; these RLS policies enforce it in the database.

CREATE TABLE IF NOT EXISTS public.branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_name text NOT NULL UNIQUE,
    branch_code text NOT NULL UNIQUE,
    location text,
    phone text,
    manager_name text,
    status text NOT NULL DEFAULT 'Active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read branches" ON public.branches;
CREATE POLICY "Authenticated can read branches" ON public.branches
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage branches" ON public.branches;
CREATE POLICY "Admins manage branches" ON public.branches
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'));

-- Staff <-> branch attachment
ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS branch_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.clients    ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_branch_id_idx ON public.clients (branch_id);
CREATE INDEX IF NOT EXISTS client_groups_branch_id_idx ON public.client_groups (branch_id);

-- Administrators must be able to set branch_ids on staff profiles.
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'));

-- Helper: branches the caller may see. Administrators and Auditors see all.
CREATE OR REPLACE FUNCTION public.caller_branch_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p.role IN ('Administrator', 'Auditor') THEN NULL ELSE COALESCE(p.branch_ids, '{}') END
  FROM public.profiles p WHERE p.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.caller_branch_ids() TO authenticated;

-- Restrict member/group reads to the caller's branches (NULL = all branches).
DROP POLICY IF EXISTS "Branch scoped client reads" ON public.clients;
CREATE POLICY "Branch scoped client reads" ON public.clients
    FOR SELECT TO authenticated
    USING (
      public.caller_branch_ids() IS NULL
      OR branch_id IS NULL
      OR branch_id = ANY (public.caller_branch_ids())
    );

DROP POLICY IF EXISTS "Branch scoped group reads" ON public.client_groups;
CREATE POLICY "Branch scoped group reads" ON public.client_groups
    FOR SELECT TO authenticated
    USING (
      public.caller_branch_ids() IS NULL
      OR branch_id IS NULL
      OR branch_id = ANY (public.caller_branch_ids())
    );

-- RLS policies are OR'd together, so any pre-existing permissive SELECT policy
-- on clients/client_groups would defeat the branch scoping above. Drop them and
-- keep only the branch-scoped policy.
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('clients', 'client_groups')
          AND cmd IN ('SELECT', 'ALL')
          AND policyname NOT IN ('Branch scoped client reads', 'Branch scoped group reads')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Re-create the write policies that the ALL-policy sweep above may have removed.
DROP POLICY IF EXISTS "Authenticated can insert clients" ON public.clients;
CREATE POLICY "Authenticated can insert clients" ON public.clients
    FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
CREATE POLICY "Authenticated can update clients" ON public.clients
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can insert groups" ON public.client_groups;
CREATE POLICY "Authenticated can insert groups" ON public.client_groups
    FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update groups" ON public.client_groups;
CREATE POLICY "Authenticated can update groups" ON public.client_groups
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can delete clients" ON public.clients;
CREATE POLICY "Admins can delete clients" ON public.clients
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'));
DROP POLICY IF EXISTS "Admins can delete client_groups" ON public.client_groups;
CREATE POLICY "Admins can delete client_groups" ON public.client_groups
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Administrator'));
