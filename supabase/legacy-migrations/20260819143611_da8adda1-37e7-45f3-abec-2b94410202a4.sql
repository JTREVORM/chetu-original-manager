
CREATE OR REPLACE FUNCTION private.is_auditor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Auditor' $$;

CREATE OR REPLACE FUNCTION private.is_management() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator','Branch Manager') $$;

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

DROP POLICY IF EXISTS "staff write bad loan comments" ON public.bad_loan_comments;
DROP POLICY IF EXISTS "management write bad loan comments" ON public.bad_loan_comments;
CREATE POLICY "management write bad loan comments" ON public.bad_loan_comments FOR INSERT TO authenticated
WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));

DROP POLICY IF EXISTS "staff write loan security returns" ON public.loan_security_returns;
DROP POLICY IF EXISTS "management write loan security returns" ON public.loan_security_returns;
CREATE POLICY "management write loan security returns" ON public.loan_security_returns FOR INSERT TO authenticated
WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
DROP POLICY IF EXISTS "staff update loan security returns" ON public.loan_security_returns;
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
