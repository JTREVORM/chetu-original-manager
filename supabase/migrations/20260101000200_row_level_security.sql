-- ===========================================================================
-- CHETU MICROFINANCE — row level security
-- ===========================================================================
-- Every table is deny-by-default: RLS is enabled and only the policies below
-- open anything up. Two rules run through all of it:
--
--   1. An Auditor never writes. Every write policy carries
--      `NOT private.is_auditor()`, so the read-only role holds even if an
--      Auditor is somehow also reachable through another branch of the
--      predicate.
--   2. Reads and writes are separated. A Branch Manager can read everything in
--      their branches but only writes where a policy says so.
-- ===========================================================================

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_officers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_fees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_security_returns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bad_loan_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_reversals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Staff, roles, branches, reference data
-- ---------------------------------------------------------------------------
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_admin_or_auditor());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "staff read roles" ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write settings" ON public.settings FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "branch scoped branch reads" ON public.branches FOR SELECT TO authenticated
  USING (private.caller_branch_ids() IS NULL OR id = ANY (private.caller_branch_ids()));
CREATE POLICY "admins manage branches" ON public.branches FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "loan officers read" ON public.loan_officers FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_admin_or_auditor());
CREATE POLICY "loan officers write" ON public.loan_officers FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "products read" ON public.loan_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products write" ON public.loan_products FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
CREATE POLICY "groups read" ON public.client_groups FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR created_by = auth.uid()
      OR loan_officer_id = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));

CREATE POLICY "groups insert" ON public.client_groups FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (created_by = auth.uid()
          AND (private.caller_branch_ids() IS NULL
               OR (branch_id IS NOT NULL AND branch_id = ANY (private.caller_branch_ids()))))));

-- A Branch Manager must be able to update groups they did not create, because
-- approving or rejecting one is an update.
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR created_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR created_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))));

CREATE POLICY "groups delete" ON public.client_groups FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "group members read" ON public.group_members FOR SELECT TO authenticated
  USING (private.can_see_group(group_id));
CREATE POLICY "group members write" ON public.group_members FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_group(group_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

CREATE POLICY "attendance read" ON public.group_attendance FOR SELECT TO authenticated
  USING (private.can_see_group(group_id));
CREATE POLICY "attendance write" ON public.group_attendance FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_group(group_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR registered_by = auth.uid()
      OR loan_officer_id = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));

CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (registered_by = auth.uid()
          AND (private.caller_branch_ids() IS NULL
               OR (branch_id IS NOT NULL AND branch_id = ANY (private.caller_branch_ids()))))));

-- Same reasoning as groups: approving, rejecting and recording a death are all
-- updates a Branch Manager performs on rows an officer created.
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR registered_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR registered_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))));

CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "client docs read" ON public.client_documents FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "client docs write" ON public.client_documents FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_client(client_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));

CREATE POLICY "member fees read" ON public.member_fees FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR collected_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));
CREATE POLICY "member fees insert" ON public.member_fees FOR INSERT TO authenticated
  WITH CHECK (private.current_staff_role() IN ('Administrator', 'Branch Manager', 'Loan Officer'));
CREATE POLICY "member fees update" ON public.member_fees FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "member fees delete" ON public.member_fees FOR DELETE TO authenticated
  USING (private.is_admin());

-- ---------------------------------------------------------------------------
-- Loan applications and guarantors
-- ---------------------------------------------------------------------------
CREATE POLICY "applications read" ON public.loan_applications FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "applications insert" ON public.loan_applications FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "applications update" ON public.loan_applications FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
CREATE POLICY "applications delete" ON public.loan_applications FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "guarantors read" ON public.guarantors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications a
                 WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));
CREATE POLICY "guarantors write" ON public.guarantors FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.loan_applications a
                WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)))
  WITH CHECK (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.loan_applications a
                WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));

-- ---------------------------------------------------------------------------
-- Loans, schedules and receipts
-- ---------------------------------------------------------------------------
CREATE POLICY "loans read" ON public.loans FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "loans insert" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "loans update" ON public.loans FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
CREATE POLICY "loans delete" ON public.loans FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "schedule read" ON public.loan_repayment_schedule FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "schedule write" ON public.loan_repayment_schedule FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_loan(loan_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_loan(loan_id));

CREATE POLICY "repayments read" ON public.loan_repayments FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "repayments insert" ON public.loan_repayments FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "repayments update" ON public.loan_repayments FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
-- Deleting a receipt is how a repayment is reversed, so it is Administrator-only.
CREATE POLICY "repayments delete" ON public.loan_repayments FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "staff read loan security returns" ON public.loan_security_returns FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "management write loan security returns" ON public.loan_security_returns FOR INSERT TO authenticated
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "management update loan security returns" ON public.loan_security_returns FOR UPDATE TO authenticated
  USING (private.is_management() AND private.can_see_loan(loan_id))
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "admins delete loan security returns" ON public.loan_security_returns FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "staff read bad loan comments" ON public.bad_loan_comments FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "management write bad loan comments" ON public.bad_loan_comments FOR INSERT TO authenticated
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "admins delete bad loan comments" ON public.bad_loan_comments FOR DELETE TO authenticated
  USING (private.is_admin());

-- Anyone who can see the loan can read what was rolled back on it; only an
-- Administrator can record a rollback, and nobody can edit or erase one.
CREATE POLICY "staff read loan reversals" ON public.loan_reversals FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "admins write loan reversals" ON public.loan_reversals FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

-- ---------------------------------------------------------------------------
-- Savings
-- ---------------------------------------------------------------------------
CREATE POLICY "savings accounts read" ON public.savings_accounts FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id)));
CREATE POLICY "savings accounts write" ON public.savings_accounts FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id))));

CREATE POLICY "savings tx read" ON public.savings_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_accounts s
                 WHERE s.id = savings_transactions.account_id
                   AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));
CREATE POLICY "savings tx write" ON public.savings_transactions FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.savings_accounts s
                WHERE s.id = savings_transactions.account_id
                  AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))))
  WITH CHECK (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.savings_accounts s
                WHERE s.id = savings_transactions.account_id
                  AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));

-- ---------------------------------------------------------------------------
-- Ledger, notifications, reporting, audit
-- ---------------------------------------------------------------------------
CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor());
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "bank read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor());
CREATE POLICY "bank write" ON public.bank_transactions FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR recipient_id IS NULL OR private.is_admin_or_auditor());
-- Staff fan alerts out to each other, so any signed-in user may insert; a user
-- may only modify or clear notifications addressed to them.
CREATE POLICY "notifications write" ON public.notifications FOR ALL TO authenticated
  USING (recipient_id = auth.uid() OR private.is_admin())
  WITH CHECK (recipient_id = auth.uid() OR private.is_admin() OR NOT private.is_auditor());

CREATE POLICY "reports all" ON public.reports FOR ALL TO authenticated
  USING (generated_by = auth.uid() OR private.is_admin_or_auditor())
  WITH CHECK (generated_by = auth.uid() OR private.is_admin());

-- The audit trail is append-only for everyone; an entry is always filed
-- against the person who caused it.
CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor() OR user_id = auth.uid());
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit delete" ON public.audit_logs FOR DELETE TO authenticated
  USING (private.is_admin());
