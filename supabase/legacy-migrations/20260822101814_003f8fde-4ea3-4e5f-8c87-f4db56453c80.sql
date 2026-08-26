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