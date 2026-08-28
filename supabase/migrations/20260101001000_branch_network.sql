-- ===========================================================================
-- CHETU MICROFINANCE — branch network
-- ===========================================================================
-- The branches table was built for a list screen: a name, a code, a town, a
-- phone number and a manager typed in as free text. The Branch Network module
-- treats a branch as an operating unit, so it needs the rest of the record —
-- what kind of office it is, where it actually sits, who runs it as a real
-- staff account, how it operates, and why it was closed if it ever is.
--
-- Everything here is additive. No column is dropped or renamed, so every
-- existing reader of public.branches keeps working unchanged.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.branches
    -- Identity
    ADD COLUMN IF NOT EXISTS branch_type TEXT NOT NULL DEFAULT 'Main Branch',
    -- Location
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS town TEXT,
    ADD COLUMN IF NOT EXISTS physical_address TEXT,
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6),
    -- Contact
    ADD COLUMN IF NOT EXISTS alt_phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    -- Management. manager_name is kept and mirrored from manager_id by trigger.
    ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assistant_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Operations
    ADD COLUMN IF NOT EXISTS opening_time TIME,
    ADD COLUMN IF NOT EXISTS closing_time TIME,
    ADD COLUMN IF NOT EXISTS working_days TEXT[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UGX',
    ADD COLUMN IF NOT EXISTS max_cash_holding NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS approval_level TEXT,
    -- Deactivation. A branch is never deleted once it carries financial
    -- history; it is closed to new operations and the reason is kept.
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_branch_type_check') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_branch_type_check
      CHECK (branch_type IN ('Head Office', 'Main Branch', 'Satellite Branch', 'Field Office'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_status_check') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_status_check
      CHECK (status IN ('Active', 'Inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_approval_level_check') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_approval_level_check
      CHECK (approval_level IS NULL OR approval_level IN ('Branch', 'Regional', 'Head Office'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_branches_manager ON public.branches(manager_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON public.branches(status);

-- ---------------------------------------------------------------------------
-- Backfill: adopt an existing free-text manager as a real staff account
-- ---------------------------------------------------------------------------
-- Only where the typed name resolves to exactly one active profile. An
-- ambiguous or unrecognised name is left alone rather than guessed at.
UPDATE public.branches b
   SET manager_id = p.id
  FROM public.profiles p
 WHERE b.manager_id IS NULL
   AND b.manager_name IS NOT NULL
   AND lower(btrim(b.manager_name)) = lower(btrim(p.full_name))
   AND p.status = 'Active'
   AND (SELECT count(*) FROM public.profiles q
         WHERE lower(btrim(q.full_name)) = lower(btrim(b.manager_name))
           AND q.status = 'Active') = 1;

-- ---------------------------------------------------------------------------
-- Trigger: keep the legacy manager_name column true
-- ---------------------------------------------------------------------------
-- Screens and reports written before manager_id existed still read
-- manager_name. Mirroring it here means there is one answer to "who runs this
-- branch", and it stays correct when the staff member is renamed.
CREATE OR REPLACE FUNCTION public.sync_branch_manager_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.manager_id IS NOT NULL THEN
    SELECT full_name INTO NEW.manager_name FROM public.profiles WHERE id = NEW.manager_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.manager_id IS NOT NULL AND NEW.manager_id IS NULL THEN
    NEW.manager_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_branch_manager_name ON public.branches;
CREATE TRIGGER trg_sync_branch_manager_name BEFORE INSERT OR UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.sync_branch_manager_name();

-- ---------------------------------------------------------------------------
-- Trigger: branch status transitions
-- ---------------------------------------------------------------------------
-- Closing a branch is an operational decision that has to be explainable
-- afterwards, so a reason is required and the actor is stamped. Reopening
-- clears the closure rather than leaving a stale one on the record.
CREATE OR REPLACE FUNCTION public.guard_branch_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Inactive' THEN
      IF NEW.deactivation_reason IS NULL OR btrim(NEW.deactivation_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required to deactivate a branch';
      END IF;
      NEW.deactivated_at := NOW();
      NEW.deactivated_by := auth.uid();
    ELSE
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
      NEW.deactivation_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_branch_status ON public.branches;
CREATE TRIGGER trg_guard_branch_status BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.guard_branch_status_transition();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Unchanged on purpose. "branch scoped branch reads" already limits a Branch
-- Manager to their own branches and "admins manage branches" already restricts
-- every write to Administrators; the new columns inherit both.
