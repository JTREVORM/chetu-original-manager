-- ===========================================================================
-- CHETU MICROFINANCE — transfers
-- ===========================================================================
-- Three movements, all recorded in one register so there is a single place to
-- audit who moved what and when:
--
--   Member Branch     a member (and their loans) move to another branch.
--                     Two-step: the origin branch sends, the destination
--                     branch receives or rejects.
--   Group Interchange a member moves to another group inside the same branch.
--                     Immediate — one manager owns both sides.
--   Group Officer     a group and its members are reassigned to another loan
--                     officer. Immediate, same reason.
--
-- The branch transfer is the awkward one. Until the destination receives the
-- member, that member still belongs to the origin branch, so
-- `private.can_see_client` denies the destination manager any sight of them —
-- they cannot see what they are being asked to accept, and cannot write the
-- row that would make it theirs. Policies alone cannot break that circle
-- without handing the destination broad rights over the origin's members, so
-- the receive and reject steps run through SECURITY DEFINER functions that
-- check the caller is management in the destination branch and nothing more.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.transfers (
    id TEXT PRIMARY KEY DEFAULT ('TRF-' || substr(md5(random()::text), 1, 10)),
    transfer_type TEXT NOT NULL
        CHECK (transfer_type IN ('Member Branch', 'Group Interchange', 'Group Officer')),

    -- Exactly one of these is set, depending on the type.
    client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES public.client_groups(id) ON DELETE CASCADE,

    from_branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    to_branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    from_group_id TEXT REFERENCES public.client_groups(id) ON DELETE SET NULL,
    to_group_id TEXT REFERENCES public.client_groups(id) ON DELETE SET NULL,
    from_officer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    to_officer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- 'Pending' only ever applies to a branch transfer awaiting receipt.
    -- The immediate types are written straight in as 'Completed'.
    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Completed', 'Rejected')),
    reason TEXT,
    rejection_reason TEXT,

    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actioned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actioned_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT transfers_subject_present CHECK (client_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_transfers_client ON public.transfers(client_id);
CREATE INDEX IF NOT EXISTS idx_transfers_group ON public.transfers(group_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_to_branch ON public.transfers(to_branch_id);

GRANT SELECT, INSERT, UPDATE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_transfers_updated_at BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- The destination branch clause is what makes an incoming transfer visible
-- before it has been accepted.
DROP POLICY IF EXISTS "transfers read" ON public.transfers;
CREATE POLICY "transfers read" ON public.transfers FOR SELECT TO authenticated
USING (
  private.is_admin_or_auditor()
  OR requested_by = auth.uid()
  OR (client_id IS NOT NULL AND private.can_see_client(client_id))
  OR (group_id IS NOT NULL AND private.can_see_group(group_id))
  OR (to_branch_id IS NOT NULL AND to_branch_id = ANY (private.caller_branch_ids()))
);

-- Raising a transfer requires reach over the record being moved, so an officer
-- can only send their own members and groups.
DROP POLICY IF EXISTS "transfers insert" ON public.transfers;
CREATE POLICY "transfers insert" ON public.transfers FOR INSERT TO authenticated
WITH CHECK (
  NOT private.is_auditor()
  AND requested_by = auth.uid()
  AND (
    (client_id IS NOT NULL AND private.can_see_client(client_id))
    OR (group_id IS NOT NULL AND private.can_see_group(group_id))
  )
);

-- Direct updates are for the origin side withdrawing or correcting a request.
-- Receiving is done through the function below, never by a raw update.
DROP POLICY IF EXISTS "transfers update" ON public.transfers;
CREATE POLICY "transfers update" ON public.transfers FOR UPDATE TO authenticated
USING (NOT private.is_auditor() AND (private.is_admin() OR requested_by = auth.uid()))
WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR requested_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- Receiving a member
-- ---------------------------------------------------------------------------
-- Moves the member into the destination branch, group and officer, and closes
-- the transfer. The member's loans reference `client_id`, so they follow
-- automatically and no loan row is touched.
CREATE OR REPLACE FUNCTION public.receive_member_transfer(
  _transfer_id TEXT,
  _to_group_id TEXT DEFAULT NULL,
  _to_officer_id UUID DEFAULT NULL
)
RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.transfers;
  target_group public.client_groups;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF t.transfer_type <> 'Member Branch' THEN
    RAISE EXCEPTION 'Only a branch transfer is received';
  END IF;
  IF t.status <> 'Pending' THEN
    RAISE EXCEPTION 'This transfer has already been %', lower(t.status);
  END IF;

  -- Only management in the destination branch may accept.
  IF NOT (private.is_admin()
          OR (private.is_branch_manager()
              AND t.to_branch_id = ANY (private.caller_branch_ids()))) THEN
    RAISE EXCEPTION 'Only a Branch Manager of the receiving branch can accept this transfer';
  END IF;

  -- A group may be chosen at receipt; if given it must sit in the destination
  -- branch and be approved, or the member lands somewhere invalid.
  IF _to_group_id IS NOT NULL THEN
    SELECT * INTO target_group FROM public.client_groups WHERE id = _to_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Destination group not found';
    END IF;
    IF target_group.branch_id IS DISTINCT FROM t.to_branch_id THEN
      RAISE EXCEPTION 'The chosen group does not belong to the receiving branch';
    END IF;
    IF target_group.approval_status <> 'Approved' THEN
      RAISE EXCEPTION 'The chosen group has not been approved yet';
    END IF;
  END IF;

  UPDATE public.clients
     SET branch_id = t.to_branch_id,
         group_id = COALESCE(_to_group_id, t.to_group_id),
         loan_officer_id = COALESCE(_to_officer_id, t.to_officer_id, loan_officer_id)
   WHERE id = t.client_id;

  UPDATE public.transfers
     SET status = 'Completed',
         to_group_id = COALESCE(_to_group_id, to_group_id),
         to_officer_id = COALESCE(_to_officer_id, to_officer_id),
         actioned_by = auth.uid(),
         actioned_at = NOW()
   WHERE id = _transfer_id
   RETURNING * INTO t;

  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_member_transfer(_transfer_id TEXT, _reason TEXT)
RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.transfers;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF t.status <> 'Pending' THEN
    RAISE EXCEPTION 'This transfer has already been %', lower(t.status);
  END IF;
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject a transfer';
  END IF;
  IF NOT (private.is_admin()
          OR (private.is_branch_manager()
              AND t.to_branch_id = ANY (private.caller_branch_ids()))) THEN
    RAISE EXCEPTION 'Only a Branch Manager of the receiving branch can reject this transfer';
  END IF;

  -- The member stays exactly where they are; only the request closes.
  UPDATE public.transfers
     SET status = 'Rejected',
         rejection_reason = _reason,
         actioned_by = auth.uid(),
         actioned_at = NOW()
   WHERE id = _transfer_id
   RETURNING * INTO t;

  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_member_transfer(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_member_transfer(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_member_transfer(TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_member_transfer(TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reassigning a whole group to another officer
-- ---------------------------------------------------------------------------
-- Moves the group and every member in it in one statement, so the group and
-- its members can never disagree about who their officer is.
CREATE OR REPLACE FUNCTION public.transfer_group_officer(
  _group_id TEXT,
  _to_officer_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.client_groups;
  officer public.profiles;
  t public.transfers;
BEGIN
  SELECT * INTO g FROM public.client_groups WHERE id = _group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF NOT (private.is_admin()
          OR (private.is_branch_manager()
              AND g.branch_id = ANY (private.caller_branch_ids()))) THEN
    RAISE EXCEPTION 'Only a Branch Manager of this branch or an Administrator can reassign a group';
  END IF;

  SELECT * INTO officer FROM public.profiles WHERE id = _to_officer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan officer not found';
  END IF;
  IF officer.role <> 'Loan Officer' THEN
    RAISE EXCEPTION 'A group can only be assigned to a Loan Officer';
  END IF;
  IF officer.status <> 'Active' THEN
    RAISE EXCEPTION 'That loan officer account is not active';
  END IF;
  IF g.branch_id IS NOT NULL AND NOT (g.branch_id = ANY (officer.branch_ids)) THEN
    RAISE EXCEPTION 'That loan officer is not attached to this branch';
  END IF;
  IF g.loan_officer_id IS NOT DISTINCT FROM _to_officer_id THEN
    RAISE EXCEPTION 'The group is already assigned to that officer';
  END IF;

  INSERT INTO public.transfers (
    transfer_type, group_id, from_branch_id, to_branch_id,
    from_officer_id, to_officer_id, status, reason, requested_by, actioned_by, actioned_at
  ) VALUES (
    'Group Officer', _group_id, g.branch_id, g.branch_id,
    g.loan_officer_id, _to_officer_id, 'Completed', _reason, auth.uid(), auth.uid(), NOW()
  ) RETURNING * INTO t;

  UPDATE public.client_groups
     SET loan_officer_id = _to_officer_id,
         loan_officer_name = officer.full_name
   WHERE id = _group_id;

  UPDATE public.clients
     SET loan_officer_id = _to_officer_id
   WHERE group_id = _group_id;

  RETURN t;
END;
$$;

-- ---------------------------------------------------------------------------
-- Moving a member between groups in the same branch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_member_group(
  _client_id TEXT,
  _to_group_id TEXT,
  _reason TEXT DEFAULT NULL
)
RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.clients;
  target_group public.client_groups;
  t public.transfers;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF NOT private.can_see_client(_client_id) THEN
    RAISE EXCEPTION 'You are not allowed to move this member';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot move members';
  END IF;

  SELECT * INTO target_group FROM public.client_groups WHERE id = _to_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination group not found';
  END IF;
  IF target_group.approval_status <> 'Approved' THEN
    RAISE EXCEPTION 'The destination group has not been approved yet';
  END IF;
  -- Crossing a branch boundary is a branch transfer, which needs the receiving
  -- branch to agree; it must not happen silently through this route.
  IF target_group.branch_id IS DISTINCT FROM c.branch_id THEN
    RAISE EXCEPTION 'That group is in another branch — use Member Branch Transfer instead';
  END IF;
  IF c.group_id IS NOT DISTINCT FROM _to_group_id THEN
    RAISE EXCEPTION 'The member is already in that group';
  END IF;

  INSERT INTO public.transfers (
    transfer_type, client_id, from_branch_id, to_branch_id,
    from_group_id, to_group_id, from_officer_id, to_officer_id,
    status, reason, requested_by, actioned_by, actioned_at
  ) VALUES (
    'Group Interchange', _client_id, c.branch_id, c.branch_id,
    c.group_id, _to_group_id, c.loan_officer_id, target_group.loan_officer_id,
    'Completed', _reason, auth.uid(), auth.uid(), NOW()
  ) RETURNING * INTO t;

  UPDATE public.clients
     SET group_id = _to_group_id,
         loan_officer_id = COALESCE(target_group.loan_officer_id, loan_officer_id)
   WHERE id = _client_id;

  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_group_officer(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_member_group(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_group_officer(TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_member_group(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Member counts stay correct as members move in and out of groups.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_group_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.group_id IS NOT NULL THEN
    UPDATE public.client_groups
       SET member_count = (SELECT count(*) FROM public.clients WHERE group_id = OLD.group_id)
     WHERE id = OLD.group_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.group_id IS NOT NULL THEN
    UPDATE public.client_groups
       SET member_count = (SELECT count(*) FROM public.clients WHERE group_id = NEW.group_id)
     WHERE id = NEW.group_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_group_member_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_group_member_count ON public.clients;
CREATE TRIGGER trg_sync_group_member_count
  AFTER INSERT OR UPDATE OF group_id OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_member_count();
