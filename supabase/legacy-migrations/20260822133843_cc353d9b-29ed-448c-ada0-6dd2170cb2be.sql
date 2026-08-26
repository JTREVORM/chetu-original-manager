ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_auditor());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "staff read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write settings" ON public.settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "branch scoped branch reads" ON public.branches FOR SELECT TO authenticated
  USING (public.caller_branch_ids() IS NULL OR id = ANY (public.caller_branch_ids()));
CREATE POLICY "admins manage branches" ON public.branches FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "groups insert" ON public.client_groups FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (created_by = auth.uid()
        AND (public.caller_branch_ids() IS NULL
             OR (branch_id IS NOT NULL AND branch_id = ANY (public.caller_branch_ids()))))
  );
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "groups delete" ON public.client_groups FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (registered_by = auth.uid()
        AND (public.caller_branch_ids() IS NULL
             OR (branch_id IS NOT NULL AND branch_id = ANY (public.caller_branch_ids()))))
  );
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
  USING (public.is_admin() OR registered_by = auth.uid())
  WITH CHECK (public.is_admin() OR registered_by = auth.uid());
CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "client docs read" ON public.client_documents FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "client docs write" ON public.client_documents FOR ALL TO authenticated
  USING (public.can_see_client(client_id)) WITH CHECK (public.can_see_client(client_id));

CREATE POLICY "products read" ON public.loan_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products write" ON public.loan_products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "applications read" ON public.loan_applications FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "applications insert" ON public.loan_applications FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "applications update" ON public.loan_applications FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "applications delete" ON public.loan_applications FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "guarantors all" ON public.guarantors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = application_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = application_id));

CREATE POLICY "loans read" ON public.loans FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "loans insert" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "loans update" ON public.loans FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "loans delete" ON public.loans FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "schedule read" ON public.loan_repayment_schedule FOR SELECT TO authenticated
  USING (public.can_see_loan(loan_id));
CREATE POLICY "schedule write" ON public.loan_repayment_schedule FOR ALL TO authenticated
  USING (public.can_see_loan(loan_id)) WITH CHECK (public.can_see_loan(loan_id));

CREATE POLICY "repayments read" ON public.loan_repayments FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "repayments insert" ON public.loan_repayments FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "repayments update" ON public.loan_repayments FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "repayments delete" ON public.loan_repayments FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor());
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bank read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor());
CREATE POLICY "bank write" ON public.bank_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR recipient_id IS NULL OR public.is_admin_or_auditor());
CREATE POLICY "notifications write" ON public.notifications FOR ALL TO authenticated
  USING (recipient_id = auth.uid() OR public.is_admin())
  WITH CHECK (true);

CREATE POLICY "reports all" ON public.reports FOR ALL TO authenticated
  USING (generated_by = auth.uid() OR public.is_admin_or_auditor())
  WITH CHECK (generated_by = auth.uid() OR public.is_admin());

CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor() OR user_id = auth.uid());
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit delete" ON public.audit_logs FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "savings accounts read" ON public.savings_accounts FOR SELECT TO authenticated
  USING ((client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)));
CREATE POLICY "savings accounts write" ON public.savings_accounts FOR ALL TO authenticated
  USING (public.is_admin()
      OR (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)))
  WITH CHECK (public.is_admin()
      OR (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)));

CREATE POLICY "savings tx all" ON public.savings_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = account_id));

CREATE POLICY "group members all" ON public.group_members FOR ALL TO authenticated
  USING (public.can_see_group(group_id)) WITH CHECK (public.can_see_group(group_id));
CREATE POLICY "attendance all" ON public.group_attendance FOR ALL TO authenticated
  USING (public.can_see_group(group_id)) WITH CHECK (public.can_see_group(group_id));

CREATE POLICY "loan officers read" ON public.loan_officers FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin_or_auditor());
CREATE POLICY "loan officers write" ON public.loan_officers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'));

INSERT INTO public.roles (name, description)
VALUES ('Branch Manager', 'Branch-scoped operations, loan approvals, portfolio monitoring and branch reporting')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_branch_id ON public.bank_transactions(branch_id);

CREATE OR REPLACE FUNCTION public.is_branch_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_staff_role() = 'Branch Manager'
$$;

ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS loan_officer_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS loan_officer_name text;
ALTER TABLE public.client_groups
  ADD COLUMN IF NOT EXISTS meeting_frequency text NOT NULL DEFAULT 'Weekly',
  ADD COLUMN IF NOT EXISTS formation_date date;
ALTER TABLE public.client_groups DROP CONSTRAINT IF EXISTS client_groups_meeting_frequency_check;
ALTER TABLE public.client_groups ADD CONSTRAINT client_groups_meeting_frequency_check
  CHECK (meeting_frequency IN ('Daily','Weekly','Monthly'));

CREATE POLICY "clients read" ON public.clients
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR registered_by = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);

CREATE POLICY "groups read" ON public.client_groups
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR created_by = auth.uid()
  OR loan_officer_id = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);

CREATE OR REPLACE FUNCTION public.can_see_group(_group_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.client_groups g
                 WHERE g.id = _group_id AND (g.created_by = auth.uid() OR g.loan_officer_id = auth.uid()))
$$;

CREATE SEQUENCE IF NOT EXISTS public.client_group_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.savings_account_number_seq;

CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_code IS NULL OR NEW.group_code = '' OR EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code) THEN
    NEW.group_code := 'CM-GRP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.client_group_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_group_code ON public.client_groups;
CREATE TRIGGER trg_set_group_code BEFORE INSERT ON public.client_groups
FOR EACH ROW EXECUTE FUNCTION public.set_group_code();

CREATE OR REPLACE FUNCTION public.set_client_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_number IS NULL OR NEW.client_number = '' OR EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number) THEN
    LOOP
      NEW.client_number := 'CM-CL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.client_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_savings_account_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = '' OR EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number) THEN
    LOOP
      NEW.account_number := 'CM-SAV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.savings_account_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_client_number ON public.clients;
CREATE TRIGGER trg_set_client_number BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_client_number();

DROP TRIGGER IF EXISTS trg_set_savings_account_number ON public.savings_accounts;
CREATE TRIGGER trg_set_savings_account_number BEFORE INSERT ON public.savings_accounts FOR EACH ROW EXECUTE FUNCTION public.set_savings_account_number();

CREATE TABLE public.member_fees (
  id text NOT NULL DEFAULT ('CM-FEE-' || to_char(now(),'YYYY') || '-' || substr(gen_random_uuid()::text,1,8)) PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  admission_fee numeric NOT NULL DEFAULT 0,
  passbook_fee numeric NOT NULL DEFAULT 0,
  crb_fee numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  receipt_number text,
  branch_id text REFERENCES public.branches(id),
  collected_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_fees TO authenticated;
GRANT ALL ON public.member_fees TO service_role;

ALTER TABLE public.member_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view member fees" ON public.member_fees
FOR SELECT TO authenticated
USING (public.is_admin_or_auditor() OR collected_by = auth.uid() OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids())));

CREATE POLICY "Staff can record member fees" ON public.member_fees
FOR INSERT TO authenticated
WITH CHECK (public.current_staff_role() IN ('Administrator','Branch Manager','Loan Officer'));

CREATE POLICY "Admins can update member fees" ON public.member_fees
FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete member fees" ON public.member_fees
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_member_fees_updated_at
BEFORE UPDATE ON public.member_fees
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_branch_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_client(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_group(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_loan(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_client_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_savings_account_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;