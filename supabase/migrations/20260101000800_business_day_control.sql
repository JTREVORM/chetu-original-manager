-- ===========================================================================
-- CHETU MICROFINANCE — business day control
-- ===========================================================================
-- A Loan Officer may only transact inside a business day that a Branch Manager
-- or Administrator has opened, and only while their own working day is still
-- running. Saturdays and Sundays are closed unless someone with authority
-- grants a time-boxed exception.
--
-- The lock lives here rather than in the UI on purpose. Hiding a button stops
-- nobody who can open developer tools, change a URL or POST to PostgREST
-- directly; a BEFORE trigger on every transactional table stops all of them,
-- because there is no path to the data that does not go through it.
--
-- Every decision uses NOW() — the database clock. Nothing reads the date from
-- the caller's device, so moving a laptop's clock to Friday does not reopen
-- the weekend.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per branch per calendar day.
CREATE TABLE IF NOT EXISTS public.business_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('NOT_OPENED', 'OPEN', 'CLOSED', 'APPROVED', 'LOCKED')),
    opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, business_date)
);

-- One row per officer per business day: their own working session.
CREATE TABLE IF NOT EXISTS public.officer_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_day_id TEXT NOT NULL REFERENCES public.business_days(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('LOCKED', 'ACTIVE', 'SUBMITTED', 'PENDING_APPROVAL',
                          'APPROVED', 'REJECTED', 'SPECIAL_ACCESS')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    -- The totals shown at submission, frozen as they were confirmed.
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_day_id, officer_id)
);

-- Time-boxed permission to work while the system is otherwise locked.
CREATE TABLE IF NOT EXISTS public.access_requests (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    business_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Expired')),
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_reason TEXT,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table privileges are not inherited by new tables: the core schema's blanket
-- GRANT ran before these existed, so without this `authenticated` is refused
-- before RLS is ever consulted.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_days   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officer_days    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;
GRANT ALL ON public.business_days   TO service_role;
GRANT ALL ON public.officer_days    TO service_role;
GRANT ALL ON public.access_requests TO service_role;

CREATE INDEX IF NOT EXISTS idx_business_days_branch_date ON public.business_days(branch_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_officer_days_officer ON public.officer_days(officer_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_officer_days_day ON public.officer_days(business_day_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests(status, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester ON public.access_requests(requester_id, business_date DESC);

-- ---------------------------------------------------------------------------
-- Server clock, exposed to the client
-- ---------------------------------------------------------------------------
-- The UI must never decide "is it the weekend?" from the device clock. This is
-- the one authoritative answer, and it is readable by any signed-in user.
CREATE OR REPLACE FUNCTION public.server_time()
RETURNS TABLE (server_now TIMESTAMPTZ, server_date DATE, is_weekend BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT NOW(), CURRENT_DATE, EXTRACT(ISODOW FROM CURRENT_DATE) IN (6, 7) $$;

GRANT EXECUTE ON FUNCTION public.server_time() TO authenticated;

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

-- Does this officer hold a live, approved exception right now?
CREATE OR REPLACE FUNCTION private.has_special_access(_officer UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests r
    WHERE r.requester_id = _officer
      AND r.status = 'Approved'
      AND COALESCE(r.starts_at, r.decided_at, r.created_at) <= NOW()
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
  )
$$;

/*
 * May the caller write business data at this instant?
 *
 *   Administrator   always — the override the role exists for
 *   Auditor         never — read only, enforced everywhere else too
 *   Branch Manager  always — they open the day and must be able to correct it
 *   Loan Officer    only inside an OPEN business day for one of their branches,
 *                   with their own working day still running
 *
 * A REJECTED working day still permits writes: the officer was sent back
 * precisely so they could fix something.
 */
CREATE OR REPLACE FUNCTION private.can_transact()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role TEXT;
  v_uid UUID := auth.uid();
BEGIN
  -- Unauthenticated calls are the service role (seeds, server functions).
  IF v_uid IS NULL THEN RETURN TRUE; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

  IF v_role IS NULL THEN RETURN TRUE; END IF;          -- not staff-managed
  IF v_role = 'Auditor' THEN RETURN FALSE; END IF;
  IF v_role IN ('Administrator', 'Branch Manager') THEN RETURN TRUE; END IF;

  -- Loan Officer from here down.
  IF private.has_special_access(v_uid) THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.officer_days od
    JOIN public.business_days bd ON bd.id = od.business_day_id
    WHERE od.officer_id = v_uid
      AND od.business_date = CURRENT_DATE
      AND bd.business_date = CURRENT_DATE
      AND bd.status = 'OPEN'
      AND od.status IN ('ACTIVE', 'SPECIAL_ACCESS', 'REJECTED')
  );
END;
$$;

-- Why the gate is shut, for the message the officer is shown.
CREATE OR REPLACE FUNCTION public.my_working_state()
RETURNS TABLE (
  can_transact BOOLEAN,
  reason TEXT,
  business_day_status TEXT,
  officer_day_status TEXT,
  is_weekend BOOLEAN,
  business_date DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_weekend BOOLEAN := EXTRACT(ISODOW FROM CURRENT_DATE) IN (6, 7);
  v_bd TEXT;
  v_od TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

  SELECT bd.status, od.status INTO v_bd, v_od
  FROM public.business_days bd
  LEFT JOIN public.officer_days od
    ON od.business_day_id = bd.id AND od.officer_id = v_uid
  WHERE bd.business_date = CURRENT_DATE
    AND bd.branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[bd.branch_id]))
  ORDER BY (od.id IS NOT NULL) DESC
  LIMIT 1;

  RETURN QUERY SELECT
    private.can_transact(),
    CASE
      WHEN v_role = 'Auditor' THEN 'Auditors have read-only access.'
      WHEN v_role IN ('Administrator', 'Branch Manager') THEN 'Management access.'
      WHEN private.has_special_access(v_uid) THEN 'Working under approved special access.'
      WHEN v_bd IS NULL AND v_weekend THEN 'It is currently a non-business day.'
      WHEN v_bd IS NULL THEN 'Business day has not been opened.'
      WHEN v_bd <> 'OPEN' THEN 'The business day is ' || v_bd || '.'
      WHEN v_od IN ('SUBMITTED', 'PENDING_APPROVAL') THEN 'Your working day is awaiting manager approval.'
      WHEN v_od = 'APPROVED' THEN 'Your working day has been approved.'
      WHEN v_od IS NULL THEN 'You have not been started on today''s business day.'
      ELSE 'Working day active.'
    END,
    COALESCE(v_bd, 'NOT_OPENED'),
    COALESCE(v_od, 'LOCKED'),
    v_weekend,
    CURRENT_DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_working_state() TO authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement: one trigger, every transactional table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_business_day_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT private.can_transact() THEN
    RAISE EXCEPTION
      'Locked: the business day is not open for you. Ask your Branch Manager to open the day, or request special access.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t TEXT;
  guarded TEXT[] := ARRAY[
    'clients', 'client_groups', 'loans', 'loan_applications', 'loan_repayments',
    'loan_repayment_schedule', 'savings_accounts', 'savings_transactions',
    'group_attendance', 'expenses', 'bank_transactions', 'transfers'
  ];
BEGIN
  FOREACH t IN ARRAY guarded LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_business_day ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_guard_business_day
           BEFORE INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.guard_business_day_write()', t);
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see the day they are working under.
DROP POLICY IF EXISTS business_days_read ON public.business_days;
CREATE POLICY business_days_read ON public.business_days FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
         OR branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[branch_id])));

-- Only management opens or changes a day, and never an Auditor.
DROP POLICY IF EXISTS business_days_write ON public.business_days;
CREATE POLICY business_days_write ON public.business_days FOR ALL TO authenticated
  USING (private.is_management() AND NOT private.is_auditor())
  WITH CHECK (private.is_management() AND NOT private.is_auditor());

DROP POLICY IF EXISTS officer_days_read ON public.officer_days;
CREATE POLICY officer_days_read ON public.officer_days FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
         OR officer_id = auth.uid()
         OR branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[branch_id])));

-- An officer may start and submit their own day; management may do anything.
DROP POLICY IF EXISTS officer_days_insert ON public.officer_days;
CREATE POLICY officer_days_insert ON public.officer_days FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor()
              AND (private.is_management() OR officer_id = auth.uid()));

DROP POLICY IF EXISTS officer_days_update ON public.officer_days;
CREATE POLICY officer_days_update ON public.officer_days FOR UPDATE TO authenticated
  USING (NOT private.is_auditor()
         AND (private.is_management() OR officer_id = auth.uid()))
  WITH CHECK (NOT private.is_auditor()
              AND (private.is_management() OR officer_id = auth.uid()));

DROP POLICY IF EXISTS access_requests_read ON public.access_requests;
CREATE POLICY access_requests_read ON public.access_requests FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
         OR requester_id = auth.uid()
         OR branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[branch_id])));

DROP POLICY IF EXISTS access_requests_insert ON public.access_requests;
CREATE POLICY access_requests_insert ON public.access_requests FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND requester_id = auth.uid());

DROP POLICY IF EXISTS access_requests_update ON public.access_requests;
CREATE POLICY access_requests_update ON public.access_requests FOR UPDATE TO authenticated
  USING (private.is_management() AND NOT private.is_auditor())
  WITH CHECK (private.is_management() AND NOT private.is_auditor());

-- ---------------------------------------------------------------------------
-- Guards on the control tables themselves
-- ---------------------------------------------------------------------------
-- An officer must not be able to hand themselves an approval, and a submitted
-- day must not quietly reopen.
CREATE OR REPLACE FUNCTION public.guard_officer_day_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('APPROVED', 'REJECTED') AND NOT private.is_management() THEN
      RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a working day';
    END IF;

    IF OLD.status IN ('SUBMITTED', 'PENDING_APPROVAL', 'APPROVED')
       AND NEW.status = 'ACTIVE'
       AND NOT private.is_management() THEN
      RAISE EXCEPTION 'A submitted working day can only be reopened by a Branch Manager or Administrator';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_officer_day ON public.officer_days;
CREATE TRIGGER trg_guard_officer_day BEFORE UPDATE ON public.officer_days
  FOR EACH ROW EXECUTE FUNCTION public.guard_officer_day_transition();

-- Decisions are management's, and are stamped by the database, not the client.
CREATE OR REPLACE FUNCTION public.guard_access_request_decision()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Approved', 'Rejected') THEN
    IF NOT private.is_management() THEN
      RAISE EXCEPTION 'Only a Branch Manager or Administrator can decide an access request';
    END IF;
    NEW.decided_by := COALESCE(NEW.decided_by, auth.uid());
    NEW.decided_at := NOW();
    IF NEW.status = 'Approved' THEN
      NEW.starts_at := COALESCE(NEW.starts_at, NOW());
      -- Exceptions expire on their own; an approval is never open-ended.
      NEW.expires_at := COALESCE(NEW.expires_at, NOW() + INTERVAL '12 hours');
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_access_request ON public.access_requests;
CREATE TRIGGER trg_guard_access_request BEFORE UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_access_request_decision();

-- Opening a day is stamped server-side too.
CREATE OR REPLACE FUNCTION public.stamp_business_day()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.opened_by := COALESCE(NEW.opened_by, auth.uid());
    NEW.opened_at := COALESCE(NEW.opened_at, NOW());
    -- A day can only ever be opened for today or the past, never booked ahead.
    IF NEW.business_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'A business day cannot be opened for a future date';
    END IF;
  ELSE
    NEW.updated_at := NOW();
    IF NEW.status = 'CLOSED' AND OLD.status <> 'CLOSED' THEN
      NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
      NEW.closed_at := COALESCE(NEW.closed_at, NOW());
    END IF;
    IF NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED' THEN
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
      NEW.approved_at := COALESCE(NEW.approved_at, NOW());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_business_day ON public.business_days;
CREATE TRIGGER trg_stamp_business_day BEFORE INSERT OR UPDATE ON public.business_days
  FOR EACH ROW EXECUTE FUNCTION public.stamp_business_day();

-- Realtime feeds the dashboards.
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.officer_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.access_requests;
