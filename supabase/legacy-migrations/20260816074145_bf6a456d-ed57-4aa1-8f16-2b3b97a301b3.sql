CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Administrator' $$;

CREATE OR REPLACE FUNCTION private.is_admin_or_auditor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator','Auditor') $$;

CREATE OR REPLACE FUNCTION private.is_branch_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Branch Manager' $$;

CREATE OR REPLACE FUNCTION private.caller_branch_ids()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT CASE WHEN p.role IN ('Administrator','Auditor') THEN NULL
                  ELSE COALESCE(p.branch_ids,'{}') END
     FROM public.profiles p WHERE p.id = auth.uid() $$;

CREATE OR REPLACE FUNCTION private.can_see_client(_client_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.clients c
                   WHERE c.id = _client_id AND c.registered_by = auth.uid()) $$;

CREATE OR REPLACE FUNCTION private.can_see_group(_group_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.client_groups g
                   WHERE g.id = _group_id AND (g.created_by = auth.uid() OR g.loan_officer_id = auth.uid())) $$;

CREATE OR REPLACE FUNCTION private.can_see_loan(_loan_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.loans l JOIN public.clients c ON c.id = l.client_id
                   WHERE l.id = _loan_id AND c.registered_by = auth.uid()) $$;

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['current_staff_role()','is_admin()','is_admin_or_auditor()','is_branch_manager()','caller_branch_ids()','can_see_client(text)','can_see_group(text)','can_see_loan(text)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION private.' || f || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.' || f || ' TO authenticated, service_role';
  END LOOP;
END
$do$;

CREATE TEMP TABLE _pol_snapshot AS SELECT * FROM pg_policies WHERE schemaname = 'public';

DO $do$
DECLARE
  p record; q text; c text; roles text; f text;
BEGIN
  FOR p IN SELECT * FROM _pol_snapshot LOOP
    q := p.qual; c := p.with_check;
    FOREACH f IN ARRAY ARRAY['current_staff_role','is_admin_or_auditor','is_branch_manager','is_admin','caller_branch_ids','can_see_client','can_see_group','can_see_loan'] LOOP
      q := regexp_replace(coalesce(q,''), '(public\.|private\.)?' || f || '\(', 'private.' || f || '(', 'g');
      c := regexp_replace(coalesce(c,''), '(public\.|private\.)?' || f || '\(', 'private.' || f || '(', 'g');
    END LOOP;
    IF q = '' THEN q := NULL; END IF;
    IF c = '' THEN c := NULL; END IF;
    IF q IS DISTINCT FROM p.qual OR c IS DISTINCT FROM p.with_check THEN
      roles := array_to_string(p.roles, ', ');
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
        p.policyname, p.tablename,
        CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        p.cmd, roles,
        CASE WHEN q IS NOT NULL THEN 'USING ('||q||')' ELSE '' END,
        CASE WHEN c IS NOT NULL THEN 'WITH CHECK ('||c||')' ELSE '' END);
    END IF;
  END LOOP;
END
$do$;

DROP TABLE _pol_snapshot;

DROP FUNCTION IF EXISTS public.current_staff_role();
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_admin_or_auditor();
DROP FUNCTION IF EXISTS public.is_branch_manager();
DROP FUNCTION IF EXISTS public.caller_branch_ids();
DROP FUNCTION IF EXISTS public.can_see_client(text);
DROP FUNCTION IF EXISTS public.can_see_group(text);
DROP FUNCTION IF EXISTS public.can_see_loan(text);

DROP POLICY IF EXISTS "guarantors all" ON public.guarantors;
CREATE POLICY "guarantors all" ON public.guarantors FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.loan_applications a
               WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.loan_applications a
               WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));

DROP POLICY IF EXISTS "savings tx all" ON public.savings_transactions;
CREATE POLICY "savings tx all" ON public.savings_transactions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.savings_accounts s
               WHERE s.id = savings_transactions.account_id
                 AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))))
WITH CHECK (EXISTS (SELECT 1 FROM public.savings_accounts s
               WHERE s.id = savings_transactions.account_id
                 AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));

DROP POLICY IF EXISTS "notifications write" ON public.notifications;
CREATE POLICY "notifications write" ON public.notifications FOR ALL TO authenticated
USING (recipient_id = auth.uid() OR private.is_admin())
WITH CHECK (recipient_id = auth.uid() OR private.is_admin());