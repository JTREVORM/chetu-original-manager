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

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS voter_id text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'Member',
  ADD COLUMN IF NOT EXISTS loan_officer_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS inactive_reason text,
  ADD COLUMN IF NOT EXISTS inactive_date date,
  ADD COLUMN IF NOT EXISTS death_date date,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS readmitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'Approved';

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS security_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS security_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cycle_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_bad_debt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bad_debt_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS bad_debt_comment text,
  ADD COLUMN IF NOT EXISTS writeoff_status text;

ALTER TABLE public.loan_repayments
  ADD COLUMN IF NOT EXISTS collection_type text NOT NULL DEFAULT 'Regular',
  ADD COLUMN IF NOT EXISTS security_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date;

CREATE TABLE IF NOT EXISTS public.loan_security_returns (
  id text PRIMARY KEY DEFAULT ('LSR-' || substr(md5(random()::text), 1, 10)),
  loan_id text NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.branches(id),
  return_date date NOT NULL DEFAULT current_date,
  return_amount numeric NOT NULL DEFAULT 0,
  previous_amount numeric NOT NULL DEFAULT 0,
  present_amount numeric NOT NULL DEFAULT 0,
  duration_weeks integer NOT NULL DEFAULT 0,
  principal numeric NOT NULL DEFAULT 0,
  interest numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  processed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_security_returns TO authenticated;
GRANT ALL ON public.loan_security_returns TO service_role;
ALTER TABLE public.loan_security_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read loan security returns" ON public.loan_security_returns
  FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));
CREATE POLICY "admins delete loan security returns" ON public.loan_security_returns
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE TRIGGER trg_lsr_updated_at BEFORE UPDATE ON public.loan_security_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.bad_loan_comments (
  id text PRIMARY KEY DEFAULT ('BLC-' || substr(md5(random()::text), 1, 10)),
  loan_id text NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bad_loan_comments TO authenticated;
GRANT ALL ON public.bad_loan_comments TO service_role;
ALTER TABLE public.bad_loan_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read bad loan comments" ON public.bad_loan_comments
  FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));
CREATE POLICY "admins delete bad loan comments" ON public.bad_loan_comments
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE INDEX IF NOT EXISTS idx_lsr_loan ON public.loan_security_returns(loan_id);
CREATE INDEX IF NOT EXISTS idx_blc_loan ON public.bad_loan_comments(loan_id);
CREATE INDEX IF NOT EXISTS idx_clients_officer ON public.clients(loan_officer_id);

CREATE OR REPLACE FUNCTION private.is_auditor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Auditor' $$;

CREATE OR REPLACE FUNCTION private.is_management() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator','Branch Manager') $$;

REVOKE ALL ON FUNCTION private.is_auditor() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_management() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_auditor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_management() TO authenticated, service_role;

DROP POLICY IF EXISTS "clients insert" ON public.clients;
CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR ((registered_by = auth.uid()) AND ((private.caller_branch_ids() IS NULL) OR ((branch_id IS NOT NULL) AND (branch_id = ANY (private.caller_branch_ids())))))));
DROP POLICY IF EXISTS "clients update" ON public.clients;
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR registered_by = auth.uid()))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR registered_by = auth.uid()));

DROP POLICY IF EXISTS "loans insert" ON public.loans;
CREATE POLICY "loans insert" ON public.loans FOR INSERT TO authenticated
WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
DROP POLICY IF EXISTS "loans update" ON public.loans;
CREATE POLICY "loans update" ON public.loans FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));

DROP POLICY IF EXISTS "repayments insert" ON public.loan_repayments;
CREATE POLICY "repayments insert" ON public.loan_repayments FOR INSERT TO authenticated
WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
DROP POLICY IF EXISTS "repayments update" ON public.loan_repayments;
CREATE POLICY "repayments update" ON public.loan_repayments FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));

DROP POLICY IF EXISTS "management write bad loan comments" ON public.bad_loan_comments;
CREATE POLICY "management write bad loan comments" ON public.bad_loan_comments FOR INSERT TO authenticated
WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));

DROP POLICY IF EXISTS "management write loan security returns" ON public.loan_security_returns;
CREATE POLICY "management write loan security returns" ON public.loan_security_returns FOR INSERT TO authenticated
WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
DROP POLICY IF EXISTS "management update loan security returns" ON public.loan_security_returns;
CREATE POLICY "management update loan security returns" ON public.loan_security_returns FOR UPDATE TO authenticated
USING (private.is_management() AND private.can_see_loan(loan_id))
WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));

DROP POLICY IF EXISTS "groups insert" ON public.client_groups;
CREATE POLICY "groups insert" ON public.client_groups FOR INSERT TO authenticated
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR ((created_by = auth.uid()) AND ((private.caller_branch_ids() IS NULL) OR ((branch_id IS NOT NULL) AND (branch_id = ANY (private.caller_branch_ids())))))));
DROP POLICY IF EXISTS "groups update" ON public.client_groups;
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR created_by = auth.uid()))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR created_by = auth.uid()));

DROP POLICY IF EXISTS "applications insert" ON public.loan_applications;
CREATE POLICY "applications insert" ON public.loan_applications FOR INSERT TO authenticated
WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
DROP POLICY IF EXISTS "applications update" ON public.loan_applications;
CREATE POLICY "applications update" ON public.loan_applications FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));

DROP POLICY IF EXISTS "client docs read" ON public.client_documents;
DROP POLICY IF EXISTS "client docs write" ON public.client_documents;
CREATE POLICY "client docs read" ON public.client_documents FOR SELECT TO authenticated USING (private.can_see_client(client_id));
CREATE POLICY "client docs write" ON public.client_documents FOR ALL TO authenticated
USING (NOT private.is_auditor() AND private.can_see_client(client_id))
WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));

DROP POLICY IF EXISTS "attendance all" ON public.group_attendance;
DROP POLICY IF EXISTS "attendance read" ON public.group_attendance;
DROP POLICY IF EXISTS "attendance write" ON public.group_attendance;
CREATE POLICY "attendance read" ON public.group_attendance FOR SELECT TO authenticated USING (private.can_see_group(group_id));
CREATE POLICY "attendance write" ON public.group_attendance FOR ALL TO authenticated
USING (NOT private.is_auditor() AND private.can_see_group(group_id))
WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

DROP POLICY IF EXISTS "group members all" ON public.group_members;
DROP POLICY IF EXISTS "group members read" ON public.group_members;
DROP POLICY IF EXISTS "group members write" ON public.group_members;
CREATE POLICY "group members read" ON public.group_members FOR SELECT TO authenticated USING (private.can_see_group(group_id));
CREATE POLICY "group members write" ON public.group_members FOR ALL TO authenticated
USING (NOT private.is_auditor() AND private.can_see_group(group_id))
WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

DROP POLICY IF EXISTS "guarantors all" ON public.guarantors;
DROP POLICY IF EXISTS "guarantors read" ON public.guarantors;
DROP POLICY IF EXISTS "guarantors write" ON public.guarantors;
CREATE POLICY "guarantors read" ON public.guarantors FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));
CREATE POLICY "guarantors write" ON public.guarantors FOR ALL TO authenticated
USING (NOT private.is_auditor() AND EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)))
WITH CHECK (NOT private.is_auditor() AND EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));

DROP POLICY IF EXISTS "schedule read" ON public.loan_repayment_schedule;
DROP POLICY IF EXISTS "schedule write" ON public.loan_repayment_schedule;
CREATE POLICY "schedule read" ON public.loan_repayment_schedule FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));
CREATE POLICY "schedule write" ON public.loan_repayment_schedule FOR ALL TO authenticated
USING (NOT private.is_auditor() AND private.can_see_loan(loan_id))
WITH CHECK (NOT private.is_auditor() AND private.can_see_loan(loan_id));

DROP POLICY IF EXISTS "savings accounts read" ON public.savings_accounts;
DROP POLICY IF EXISTS "savings accounts write" ON public.savings_accounts;
CREATE POLICY "savings accounts read" ON public.savings_accounts FOR SELECT TO authenticated
USING (private.is_admin_or_auditor() OR (client_id IS NOT NULL AND private.can_see_client(client_id)) OR (group_id IS NOT NULL AND private.can_see_group(group_id)));
CREATE POLICY "savings accounts write" ON public.savings_accounts FOR ALL TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR (client_id IS NOT NULL AND private.can_see_client(client_id)) OR (group_id IS NOT NULL AND private.can_see_group(group_id))))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR (client_id IS NOT NULL AND private.can_see_client(client_id)) OR (group_id IS NOT NULL AND private.can_see_group(group_id))));

DROP POLICY IF EXISTS "savings tx all" ON public.savings_transactions;
DROP POLICY IF EXISTS "savings tx read" ON public.savings_transactions;
DROP POLICY IF EXISTS "savings tx write" ON public.savings_transactions;
CREATE POLICY "savings tx read" ON public.savings_transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = savings_transactions.account_id AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));
CREATE POLICY "savings tx write" ON public.savings_transactions FOR ALL TO authenticated
USING (NOT private.is_auditor() AND EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = savings_transactions.account_id AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))))
WITH CHECK (NOT private.is_auditor() AND EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = savings_transactions.account_id AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));