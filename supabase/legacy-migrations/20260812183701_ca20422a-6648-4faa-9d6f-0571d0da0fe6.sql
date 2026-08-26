DROP POLICY IF EXISTS "clients read" ON public.clients;
CREATE POLICY "clients read" ON public.clients
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR registered_by = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);

DROP POLICY IF EXISTS "groups read" ON public.client_groups;
CREATE POLICY "groups read" ON public.client_groups
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR created_by = auth.uid()
  OR loan_officer_id = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);