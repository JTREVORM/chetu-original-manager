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