-- CHETU MICROFINANCE
-- Add Branch Manager support and branch attribution for financial ledgers.
-- This migration is additive and does not delete or rewrite existing records.



ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'));

INSERT INTO public.roles (name, description)
VALUES ('Branch Manager', 'Branch-scoped operations, loan approvals, portfolio monitoring and branch reporting')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_branch_id ON public.bank_transactions(branch_id);

CREATE OR REPLACE FUNCTION public.is_branch_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_staff_role() = 'Branch Manager'
$$;

CREATE OR REPLACE FUNCTION public.can_see_client(_client_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = _client_id
          AND (
            c.registered_by = auth.uid()
            OR (public.is_branch_manager() AND c.branch_id = ANY(public.caller_branch_ids()))
          )
      )
$$;

CREATE OR REPLACE FUNCTION public.can_see_group(_group_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (
        SELECT 1
        FROM public.client_groups g
        WHERE g.id = _group_id
          AND (
            g.created_by = auth.uid()
            OR g.loan_officer_id = auth.uid()
            OR (public.is_branch_manager() AND g.branch_id = ANY(public.caller_branch_ids()))
          )
      )
$$;

CREATE OR REPLACE FUNCTION public.can_see_loan(_loan_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (
        SELECT 1
        FROM public.loans l
        WHERE l.id = _loan_id AND public.can_see_client(l.client_id)
      )
$$;

REVOKE EXECUTE ON FUNCTION public.is_branch_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_branch_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_client(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_group(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_loan(TEXT) TO authenticated;

DROP POLICY IF EXISTS "branch managers view branch staff" ON public.profiles;
CREATE POLICY "branch managers view branch staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_branch_manager()
    AND role IN ('Branch Manager', 'Loan Officer')
    AND branch_ids && public.caller_branch_ids()
  );

-- Branch Managers can manage branch client profiles, while Loan Officers
-- remain limited to the clients they registered.
DROP POLICY IF EXISTS "clients read" ON public.clients;
CREATE POLICY "clients read" ON public.clients
  FOR SELECT TO authenticated
  USING (public.can_see_client(id));

DROP POLICY IF EXISTS "clients insert" ON public.clients;
CREATE POLICY "clients insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.current_staff_role() IN ('Branch Manager', 'Loan Officer')
      AND registered_by = auth.uid()
      AND branch_id = ANY(public.caller_branch_ids())
    )
  );

DROP POLICY IF EXISTS "clients update" ON public.clients;
CREATE POLICY "clients update" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR registered_by = auth.uid()
    OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids()))
  )
  WITH CHECK (
    public.is_admin()
    OR registered_by = auth.uid()
    OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids()))
  );

DROP POLICY IF EXISTS "groups update" ON public.client_groups;
CREATE POLICY "groups update" ON public.client_groups
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR loan_officer_id = auth.uid()
    OR public.can_see_group(id)
  )
  WITH CHECK (
    public.is_admin()
    OR created_by = auth.uid()
    OR loan_officer_id = auth.uid()
    OR public.can_see_group(id)
  );

-- Branch Managers may review and approve applications and generate schedules;
-- Loan Officers may submit, disburse where authorized, and collect.
DROP POLICY IF EXISTS "applications insert" ON public.loan_applications;
CREATE POLICY "applications insert" ON public.loan_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "applications update" ON public.loan_applications;
CREATE POLICY "applications update" ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() IN ('Administrator', 'Branch Manager')
    AND public.can_see_client(client_id)
  )
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Branch Manager')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "loans insert" ON public.loans;
CREATE POLICY "loans insert" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Branch Manager')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "loans update" ON public.loans;
CREATE POLICY "loans update" ON public.loans
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  )
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "schedule write" ON public.loan_repayment_schedule;
DROP POLICY IF EXISTS "schedule insert" ON public.loan_repayment_schedule;
DROP POLICY IF EXISTS "schedule update" ON public.loan_repayment_schedule;
CREATE POLICY "schedule insert" ON public.loan_repayment_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Branch Manager')
    AND public.can_see_loan(loan_id)
  );
CREATE POLICY "schedule update" ON public.loan_repayment_schedule
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_loan(loan_id)
  )
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_loan(loan_id)
  );

DROP POLICY IF EXISTS "attendance all" ON public.group_attendance;
CREATE POLICY "attendance read" ON public.group_attendance
  FOR SELECT TO authenticated
  USING (public.can_see_group(group_id));
CREATE POLICY "attendance write" ON public.group_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_group(group_id)
  );

-- Branch Managers can read, but not alter, branch ledgers.
DROP POLICY IF EXISTS "expenses read" ON public.expenses;
CREATE POLICY "expenses read" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_auditor()
    OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids()))
  );

DROP POLICY IF EXISTS "bank read" ON public.bank_transactions;
CREATE POLICY "bank read" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_auditor()
    OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids()))
  );

DROP POLICY IF EXISTS "bank disbursement insert" ON public.bank_transactions;
CREATE POLICY "bank disbursement insert" ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'Loan Officer'
    AND category = 'Loan Disbursement'
    AND branch_id = ANY(public.caller_branch_ids())
  );

-- Reconcile the later group-policy override with branch-manager visibility.
DROP POLICY IF EXISTS "groups read" ON public.client_groups;
CREATE POLICY "groups read" ON public.client_groups
  FOR SELECT TO authenticated
  USING (public.can_see_group(id));

-- Branch Managers can review and approve applications/loans in their branch
-- through the existing can_see_client-based policies, but collections and
-- savings mutations remain limited to Administrators and Loan Officers.
DROP POLICY IF EXISTS "repayments insert" ON public.loan_repayments;
CREATE POLICY "repayments insert" ON public.loan_repayments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "repayments update" ON public.loan_repayments;
CREATE POLICY "repayments update" ON public.loan_repayments
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  )
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND public.can_see_client(client_id)
  );

DROP POLICY IF EXISTS "savings accounts write" ON public.savings_accounts;
CREATE POLICY "savings accounts write" ON public.savings_accounts
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND (
      (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id))
    )
  )
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND (
      (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id))
    )
  );

DROP POLICY IF EXISTS "savings tx all" ON public.savings_transactions;
DROP POLICY IF EXISTS "savings tx read" ON public.savings_transactions;
DROP POLICY IF EXISTS "savings tx write" ON public.savings_transactions;
CREATE POLICY "savings tx read" ON public.savings_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.savings_accounts s
      WHERE s.id = account_id
        AND (
          (s.client_id IS NOT NULL AND public.can_see_client(s.client_id))
          OR (s.group_id IS NOT NULL AND public.can_see_group(s.group_id))
        )
    )
  );
CREATE POLICY "savings tx write" ON public.savings_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() IN ('Administrator', 'Loan Officer')
    AND EXISTS (
      SELECT 1 FROM public.savings_accounts s
      WHERE s.id = account_id
        AND (
          (s.client_id IS NOT NULL AND public.can_see_client(s.client_id))
          OR (s.group_id IS NOT NULL AND public.can_see_group(s.group_id))
        )
    )
  );


