-- ===========================================================================
-- CHETU MICROFINANCE — business rules
-- ===========================================================================
-- Reference-number generation, `updated_at` maintenance, and the transition
-- guards that enforce the approval chain at the database level.
--
-- The guards matter because row level security answers "may this person touch
-- this row?" but not "may this person make *this particular* change?".
-- Approving a group, writing a loan off and reversing a posted receipt are all
-- ordinary UPDATEs to RLS; only a trigger can tell them apart.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
-- ---------------------------------------------------------------------------
-- Supabase Auth owns `auth.users`; this mirrors each new account into
-- `public.profiles` so the rest of the schema has a staff record to key on.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'System User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'Loan Officer'),
    NEW.raw_user_meta_data->>'phone_number'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_groups_updated_at BEFORE UPDATE ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_member_fees_updated_at BEFORE UPDATE ON public.member_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loan_applications_updated_at BEFORE UPDATE ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_savings_accounts_updated_at BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lsr_updated_at BEFORE UPDATE ON public.loan_security_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reference numbers
-- ---------------------------------------------------------------------------
-- The client sends a best-effort number; these triggers replace it whenever it
-- is blank or already taken, so two officers registering at the same moment
-- cannot collide.
CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_code IS NULL OR NEW.group_code = ''
     OR EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code) THEN
    LOOP
      NEW.group_code := 'CM-GRP-' || to_char(now(), 'YYYY') || '-'
                        || lpad(nextval('public.client_group_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_number IS NULL OR NEW.client_number = ''
     OR EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number) THEN
    LOOP
      NEW.client_number := 'CM-CL-' || to_char(now(), 'YYYY') || '-'
                           || lpad(nextval('public.client_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_savings_account_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = ''
     OR EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number) THEN
    LOOP
      NEW.account_number := 'CM-SAV-' || to_char(now(), 'YYYY') || '-'
                            || lpad(nextval('public.savings_account_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_group_code BEFORE INSERT ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_group_code();
CREATE TRIGGER trg_set_client_number BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_client_number();
CREATE TRIGGER trg_set_savings_account_number BEFORE INSERT ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_savings_account_number();

-- ---------------------------------------------------------------------------
-- Approval chain: groups and members
-- ---------------------------------------------------------------------------
-- A Loan Officer submits; a Branch Manager or Administrator decides. The
-- officer may push their own rejected submission back to 'Pending' after
-- fixing it, but may never approve anything — including their own work.
CREATE OR REPLACE FUNCTION public.guard_group_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_management() OR OLD.created_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this group';
      END IF;
    ELSE
      IF NOT private.is_management() THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a group';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_client_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_management() OR OLD.registered_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this member';
      END IF;
    ELSE
      IF NOT private.is_management() THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a member';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_group_approval BEFORE UPDATE ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_approval_transition();
CREATE TRIGGER trg_guard_client_approval BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_approval_transition();

-- ---------------------------------------------------------------------------
-- Loan lifecycle
-- ---------------------------------------------------------------------------
-- Settlement is an ordinary collection action, so any non-auditor who can
-- reach the loan may record one. Destroying a receivable, reopening a closed
-- loan and rolling a disbursement back are all Administrator-only.
CREATE OR REPLACE FUNCTION public.guard_loan_lifecycle_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE TRIGGER trg_guard_loan_lifecycle BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.guard_loan_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- Trigger functions are invoked by the engine, never called directly.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_group_code()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_client_number()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_savings_account_number()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_group_approval_transition()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_client_approval_transition()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loan_lifecycle_transition()    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the notification bell listens on this table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime'
                   AND schemaname = 'public'
                   AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
