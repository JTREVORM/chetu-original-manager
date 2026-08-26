-- Loan lifecycle: settlement, write-off and reversal (undo) support.
--
-- A loan can now end in one of two ways beyond ordinary repayment:
--   * Settled     - the member clears the whole outstanding balance early.
--   * Written Off - management gives up on recovering a declared bad debt.
-- Both are terminal, so they live on `loans.status` alongside the existing
-- values rather than as separate flags. Reversals of a disbursement or a
-- repayment are recorded in `loan_reversals` so the rollback itself leaves a
-- trail; the underlying row is restored to its pre-transaction state.

-- ---------------------------------------------------------------------------
-- 1. Terminal statuses
-- ---------------------------------------------------------------------------
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE public.loans ADD CONSTRAINT loans_status_check
  CHECK (status IN ('Pending', 'Active', 'Partially Paid', 'Fully Paid', 'Overdue', 'Defaulted', 'Settled', 'Written Off'));

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS writeoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS writeoff_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS writeoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS writeoff_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_writeoff_status ON public.loans(writeoff_status);

-- ---------------------------------------------------------------------------
-- 2. Reversal ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_reversals (
  id TEXT PRIMARY KEY DEFAULT ('LRV-' || substr(md5(random()::text), 1, 10)),
  loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  reversal_type TEXT NOT NULL CHECK (reversal_type IN ('Disbursement', 'Repayment', 'Settlement', 'Write Off')),
  -- Receipt / voucher number of the transaction being undone. Kept as free
  -- text because the source row is deleted as part of the rollback.
  reference_number TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  reversed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_reversals_loan ON public.loan_reversals(loan_id);

GRANT SELECT, INSERT ON public.loan_reversals TO authenticated;
GRANT ALL ON public.loan_reversals TO service_role;
ALTER TABLE public.loan_reversals ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the loan can see what was rolled back on it, but only an
-- Administrator may perform the rollback.
DROP POLICY IF EXISTS "staff read loan reversals" ON public.loan_reversals;
CREATE POLICY "staff read loan reversals" ON public.loan_reversals
  FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));

DROP POLICY IF EXISTS "admins write loan reversals" ON public.loan_reversals;
CREATE POLICY "admins write loan reversals" ON public.loan_reversals
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Transition guard
-- ---------------------------------------------------------------------------
-- Settlement is an ordinary collection action, so a Loan Officer may record
-- one. Writing a loan off destroys a receivable and rolling a loan backwards
-- out of a terminal state are both Administrator-only.
CREATE OR REPLACE FUNCTION public.guard_loan_lifecycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Written Off' AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can write off a loan';
    END IF;

    IF OLD.status IN ('Settled', 'Written Off', 'Fully Paid')
       AND NEW.status NOT IN ('Settled', 'Written Off', 'Fully Paid')
       AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can reopen a closed loan';
    END IF;

    -- Undoing a disbursement pushes an Active loan back to Pending.
    IF OLD.status = 'Active' AND NEW.status = 'Pending' AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can undo a disbursement';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_loan_lifecycle_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_loan_lifecycle ON public.loans;
CREATE TRIGGER trg_guard_loan_lifecycle
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.guard_loan_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- 4. Branch Manager visibility
-- ---------------------------------------------------------------------------
-- The original helpers only matched the officer who registered the record, so
-- a Branch Manager could not read — let alone approve, settle or collect on —
-- loans belonging to their own branch. Widen them to cover the manager's
-- branches and the officer a member is assigned to. Administrators and
-- Auditors keep institution-wide sight; a Loan Officer's reach is unchanged.
CREATE OR REPLACE FUNCTION private.can_see_client(_client_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.clients c
                   WHERE c.id = _client_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_group(_group_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.client_groups g
                   WHERE g.id = _group_id
                     AND (g.created_by = auth.uid()
                          OR g.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND g.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_loan(_loan_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.loans l JOIN public.clients c ON c.id = l.client_id
                   WHERE l.id = _loan_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;
