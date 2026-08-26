-- ============================================================================
-- MEMBER (CLIENT) APPROVAL WORKFLOW
-- ============================================================================
-- public.clients already has an approval_status column (added in an earlier
-- migration, default 'Approved'), but nothing constrained its values, let a
-- Branch Manager update a member they didn't personally register, or guarded
-- who may flip Pending/Approved/Rejected. This mirrors the client_groups
-- approval workflow added alongside it.
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_approval_status_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_approval_status_check CHECK (approval_status IN ('Pending', 'Approved', 'Rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_approval_status ON public.clients(approval_status);

-- Branch Managers need to update members in their branch even when they
-- didn't register them, so they can approve/reject admissions.
DROP POLICY IF EXISTS "clients update" ON public.clients;
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
USING (
  NOT private.is_auditor() AND (
    private.is_admin()
    OR registered_by = auth.uid()
    OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))
  )
)
WITH CHECK (
  NOT private.is_auditor() AND (
    private.is_admin()
    OR registered_by = auth.uid()
    OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))
  )
);

-- Same transition guard as client_groups: a Loan Officer may resubmit their
-- own edited/rejected member (back to Pending), but only a Branch Manager or
-- Administrator may actually approve or reject an admission.
CREATE OR REPLACE FUNCTION public.guard_client_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_admin() OR private.is_branch_manager() OR OLD.registered_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this member';
      END IF;
    ELSE
      IF NOT (private.is_admin() OR private.is_branch_manager()) THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a member';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_approval_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_client_approval_transition ON public.clients;
CREATE TRIGGER trg_guard_client_approval_transition
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.guard_client_approval_transition();
