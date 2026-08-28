-- ===========================================================================
-- CHETU MICROFINANCE — business day traceability
-- ===========================================================================
-- Completes the daily control system:
--   §4   every transaction carries the business day it belongs to
--   §11  an append-only audit trail of every control action
--   §2   special access expires on its own rather than lingering
--
-- The stamping is done by the same trigger that already guards the write, so
-- no application code has to remember to set it — a row cannot be inserted
-- without passing through it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- §4  Which business day does a write belong to?
-- ---------------------------------------------------------------------------
-- The open day for the caller's branch. For an officer that is the day they
-- are working under; for management, the open day of the branch they are
-- acting in. NULL when nothing is open (management writing outside a day).
CREATE OR REPLACE FUNCTION private.current_business_day_id()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  -- An officer's own working day wins: it is the session they are inside.
  SELECT od.business_day_id INTO v_id
  FROM public.officer_days od
  WHERE od.officer_id = v_uid AND od.business_date = CURRENT_DATE
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Otherwise the open day for a branch this person is attached to.
  SELECT bd.id INTO v_id
  FROM public.business_days bd
  WHERE bd.business_date = CURRENT_DATE
    AND bd.status = 'OPEN'
    AND bd.branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[bd.branch_id]))
  ORDER BY bd.opened_at DESC
  LIMIT 1;

  RETURN v_id;
END;
$$;

-- Add the column to every table that records daily work.
DO $$
DECLARE
  t TEXT;
  stamped TEXT[] := ARRAY[
    'clients', 'client_groups', 'loans', 'loan_applications', 'loan_repayments',
    'savings_transactions', 'group_attendance', 'expenses', 'bank_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY stamped LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS business_day_id TEXT
           REFERENCES public.business_days(id) ON DELETE SET NULL', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_business_day ON public.%I(business_day_id)', t, t);
    END IF;
  END LOOP;
END;
$$;

-- The guard now also stamps. One pass, so a row can never be written without
-- both the permission check and the day it belongs to.
CREATE OR REPLACE FUNCTION public.guard_business_day_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_has_col BOOLEAN;
BEGIN
  IF NOT private.can_transact() THEN
    RAISE EXCEPTION
      'Locked: the business day is not open for you. Ask your Branch Manager to open the day, or request special access.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME
        AND column_name = 'business_day_id'
    ) INTO v_has_col;

    IF v_has_col THEN
      -- to_jsonb round-trip: the trigger is shared by tables with different
      -- shapes, so the column cannot be referenced statically.
      IF (to_jsonb(NEW) ->> 'business_day_id') IS NULL THEN
        NEW := jsonb_populate_record(NEW, to_jsonb(NEW) ||
          jsonb_build_object('business_day_id', private.current_business_day_id()));
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- §11  Append-only audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_day_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    business_date DATE,
    subject_id TEXT,
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    client_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bd_audit_date ON public.business_day_audit(business_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_audit_actor ON public.business_day_audit(actor_id, created_at DESC);

ALTER TABLE public.business_day_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bd_audit_read ON public.business_day_audit;
CREATE POLICY bd_audit_read ON public.business_day_audit FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
         OR actor_id = auth.uid()
         OR branch_id = ANY (COALESCE(private.caller_branch_ids(), ARRAY[branch_id])));

DROP POLICY IF EXISTS bd_audit_insert ON public.business_day_audit;
CREATE POLICY bd_audit_insert ON public.business_day_audit FOR INSERT TO authenticated
  WITH CHECK (true);

-- Immutable: the point of an audit trail is that it cannot be tidied up after
-- the fact, so nobody — including an Administrator — may edit or delete a row.
GRANT SELECT, INSERT ON public.business_day_audit TO authenticated;
REVOKE UPDATE, DELETE ON public.business_day_audit FROM authenticated;
GRANT SELECT, INSERT ON public.business_day_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.business_day_audit_id_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The business day audit trail is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_bd_audit_immutable ON public.business_day_audit;
CREATE TRIGGER trg_bd_audit_immutable BEFORE UPDATE OR DELETE ON public.business_day_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- Writing an entry: the actor, role and timestamp come from the database, not
-- from whatever the caller claims.
CREATE OR REPLACE FUNCTION public.log_business_day_audit(
  _action TEXT,
  _branch_id TEXT DEFAULT NULL,
  _business_date DATE DEFAULT NULL,
  _subject_id TEXT DEFAULT NULL,
  _previous_status TEXT DEFAULT NULL,
  _new_status TEXT DEFAULT NULL,
  _reason TEXT DEFAULT NULL,
  _client_info TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name TEXT; v_role TEXT;
BEGIN
  SELECT full_name, role INTO v_name, v_role FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.business_day_audit(
    actor_id, actor_name, actor_role, action, branch_id, business_date,
    subject_id, previous_status, new_status, reason, client_info)
  VALUES (auth.uid(), v_name, v_role, _action, _branch_id,
          COALESCE(_business_date, CURRENT_DATE), _subject_id,
          _previous_status, _new_status, _reason, _client_info);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_business_day_audit(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Status changes on the control tables audit themselves, so an entry cannot be
-- forgotten by a screen that did not call the logger.
CREATE OR REPLACE FUNCTION public.audit_officer_day_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_business_day_audit(
      'Officer day started', NEW.branch_id, NEW.business_date, NEW.officer_id::text,
      NULL, NEW.status, NULL, NULL);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_business_day_audit(
      'Officer day ' || lower(NEW.status), NEW.branch_id, NEW.business_date,
      NEW.officer_id::text, OLD.status, NEW.status, NEW.rejection_reason, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_officer_day ON public.officer_days;
CREATE TRIGGER trg_audit_officer_day AFTER INSERT OR UPDATE ON public.officer_days
  FOR EACH ROW EXECUTE FUNCTION public.audit_officer_day_change();

CREATE OR REPLACE FUNCTION public.audit_business_day_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_business_day_audit(
      'Business day opened', NEW.branch_id, NEW.business_date, NEW.id, NULL, NEW.status, NEW.notes, NULL);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_business_day_audit(
      'Business day ' || lower(NEW.status), NEW.branch_id, NEW.business_date,
      NEW.id, OLD.status, NEW.status, NEW.notes, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_business_day ON public.business_days;
CREATE TRIGGER trg_audit_business_day AFTER INSERT OR UPDATE ON public.business_days
  FOR EACH ROW EXECUTE FUNCTION public.audit_business_day_change();

CREATE OR REPLACE FUNCTION public.audit_access_request_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_business_day_audit(
      'Special access requested', NEW.branch_id, NEW.business_date,
      NEW.requester_id::text, NULL, NEW.status, NEW.reason, NULL);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_business_day_audit(
      'Special access ' || lower(NEW.status), NEW.branch_id, NEW.business_date,
      NEW.requester_id::text, OLD.status, NEW.status,
      COALESCE(NEW.decision_reason, NEW.reason), NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_access_request ON public.access_requests;
CREATE TRIGGER trg_audit_access_request AFTER INSERT OR UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_access_request_change();

-- ---------------------------------------------------------------------------
-- Special access expires on its own
-- ---------------------------------------------------------------------------
-- There is no scheduler on this project, so the sweep runs lazily whenever the
-- working state is read. `has_special_access` already compares the window, so
-- this is bookkeeping — it makes the status column agree with reality.
CREATE OR REPLACE FUNCTION public.expire_access_requests()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.access_requests
     SET status = 'Expired', updated_at = NOW()
   WHERE status = 'Approved'
     AND expires_at IS NOT NULL
     AND expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_access_requests() TO authenticated;

-- The decision guard must not block the sweep flipping Approved -> Expired.
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
      NEW.expires_at := COALESCE(NEW.expires_at, NOW() + INTERVAL '12 hours');
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_day_audit;
