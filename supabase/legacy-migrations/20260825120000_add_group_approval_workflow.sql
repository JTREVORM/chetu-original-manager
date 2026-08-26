-- ============================================================================
-- GROUP APPROVAL WORKFLOW
-- ============================================================================
-- Loan Officers submit a new group for Branch Manager review instead of it
-- going live immediately. Adds an approval_status axis independent of the
-- existing operational status (Active/Inactive/Suspended).
-- ============================================================================

ALTER TABLE public.client_groups
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Groups that already existed before this migration were already operating
-- live under the old no-approval model — grandfather them in as Approved.
UPDATE public.client_groups SET approval_status = 'Approved' WHERE approval_status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_client_groups_approval_status ON public.client_groups(approval_status);

-- Branch Managers need to be able to update groups in their branch even when
-- they didn't create them, so they can approve/reject. The prior "groups
-- update" policy only allowed the creator or an Administrator.
DROP POLICY IF EXISTS "groups update" ON public.client_groups;
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
USING (
  NOT private.is_auditor() AND (
    private.is_admin()
    OR created_by = auth.uid()
    OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))
  )
)
WITH CHECK (
  NOT private.is_auditor() AND (
    private.is_admin()
    OR created_by = auth.uid()
    OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))
  )
);

-- A Loan Officer may resubmit their own rejected/edited group (moving it back
-- to Pending), but only a Branch Manager or Administrator may actually
-- approve or reject it.
CREATE OR REPLACE FUNCTION public.guard_group_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_admin() OR private.is_branch_manager() OR OLD.created_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this group';
      END IF;
    ELSE
      IF NOT (private.is_admin() OR private.is_branch_manager()) THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a group';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_group_approval_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_group_approval_transition ON public.client_groups;
CREATE TRIGGER trg_guard_group_approval_transition
BEFORE UPDATE ON public.client_groups
FOR EACH ROW EXECUTE FUNCTION public.guard_group_approval_transition();
