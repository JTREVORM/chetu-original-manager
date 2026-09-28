-- ===========================================================================
-- CHETU MICROFINANCE — financial hardening
-- ===========================================================================
-- Migration 002100 welded disbursement and collection to their journals, so
-- nothing the application does can half-happen. A pre-flight review found the
-- guarantee stops at the application: the tables underneath are still writable
-- through PostgREST, and a signed-in officer could mark a loan Active, or
-- write a receipt, with no journal behind it. That is the original failure
-- reachable by a second door.
--
-- Two other paths were worse than bypassable — they were never wired at all.
-- `post_member_fee` and `post_security_refund` have existed since 002100 and
-- nothing calls them: admission fees and security refunds were being recorded
-- with no journal at all. Both are closed here.
--
-- This migration states the rule the programme has been circling, and enforces
-- it in the database:
--
--   No financial business event may be committed unless its balanced journal
--   is committed in the same transaction.
--
-- ---------------------------------------------------------------------------
-- How the guard tells a posting function from a direct write
-- ---------------------------------------------------------------------------
-- PostgREST executes a request as the role in the caller's token — `anon` or
-- `authenticated`. Every posting function is SECURITY DEFINER owned by the
-- database owner, so inside one, `current_user` is the owner, not the caller.
-- That difference is the whole discriminator: it needs no flag, no session
-- variable the client could try to set, and no change to 001300–002100.
--
-- `service_role` is not blocked. It already bypasses row level security and
-- holds the keys to the database; the seed and repair scripts run under it.
-- The threat this closes is a signed-in user with the anon key, which is the
-- same boundary `private.is_admin()` and friends are drawn at.
--
-- Triggers, not REVOKE. `block_legacy_bank_write` set the pattern in 001900
-- and it is the right one here for two reasons: a REVOKE is silently undone by
-- any later `GRANT ... ON ALL TABLES IN SCHEMA public`, which this repository's
-- own migrations do, and a trigger can say which function to call instead.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The discriminator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_api_write()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT current_user IN ('authenticated', 'anon') $$;

COMMENT ON FUNCTION private.is_api_write() IS
  'True when the statement is running directly as a PostgREST caller rather than inside a SECURITY DEFINER posting function.';

REVOKE ALL ON FUNCTION private.is_api_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_api_write() TO authenticated, service_role;

-- A single refusal, worded the same way everywhere, naming the way in.
CREATE OR REPLACE FUNCTION private.refuse_unjournalled(_what TEXT, _use TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    '% cannot be written directly: it is a financial event and must carry its journal. Use %.',
    _what, _use
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Money moves only through the posting functions, which write the record and its balanced journal in one transaction.';
END;
$$;

-- Reached from inside the guards, which now run as the caller, so the caller
-- needs EXECUTE. The function does nothing but raise.
REVOKE ALL ON FUNCTION private.refuse_unjournalled(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.refuse_unjournalled(TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Loans — guard the money transitions, leave the rest alone
-- ---------------------------------------------------------------------------
-- A loan row carries far more than money. Approval creates it, the bad-debt
-- flag and its comment are set from the screen, a Branch Manager edits terms
-- while it is still Pending. None of that moves a shilling and none of it is
-- blocked. What is blocked is the handful of column changes that ARE the
-- financial event: disbursement, closure, and the balances themselves.
CREATE OR REPLACE FUNCTION public.guard_loan_financial_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER, deliberately. A SECURITY DEFINER trigger would see the
-- owner as `current_user` whoever called it, which is precisely the fact this
-- guard reads. Running as the invoker is what makes the check possible.
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NOT private.is_api_write() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Approval creates a loan, and a loan created Pending has moved no money.
    -- One that arrives already disbursed or already closed is a financial event
    -- smuggled in through the front door, which the UPDATE guard would never
    -- see because there is no prior row to compare against.
    IF NEW.disbursed_at IS NOT NULL
       OR NEW.status <> 'Pending'
       OR COALESCE(NEW.settled_at, NEW.writeoff_at) IS NOT NULL THEN
      PERFORM private.refuse_unjournalled(
        format('A loan created as %s', NEW.status),
        'a Pending loan followed by disburse_loan');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A Pending loan may be deleted: that is the compensation the approval
    -- path runs when its schedule insert fails, and no money has moved.
    -- A disbursed loan is a financial record and is never deleted.
    IF OLD.disbursed_at IS NOT NULL OR OLD.status <> 'Pending' THEN
      PERFORM private.refuse_unjournalled(
        format('Loan %s', OLD.loan_number),
        'undo_loan_disbursement, which reverses the journal too');
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.disbursed_at IS DISTINCT FROM NEW.disbursed_at THEN
    PERFORM private.refuse_unjournalled(
      format('The disbursement of loan %s', NEW.loan_number),
      'disburse_loan or undo_loan_disbursement');
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND (OLD.status = 'Active' OR NEW.status IN ('Active', 'Partially Paid', 'Fully Paid', 'Settled', 'Written Off')) THEN
    PERFORM private.refuse_unjournalled(
      format('Moving loan %s from %s to %s', NEW.loan_number, OLD.status, NEW.status),
      'disburse_loan, record_loan_repayment, settle_loan or write_off_loan');
  END IF;

  IF OLD.settled_at IS DISTINCT FROM NEW.settled_at
     OR OLD.settlement_amount IS DISTINCT FROM NEW.settlement_amount THEN
    PERFORM private.refuse_unjournalled(
      format('Settling loan %s', NEW.loan_number), 'settle_loan');
  END IF;

  IF OLD.writeoff_at IS DISTINCT FROM NEW.writeoff_at
     OR OLD.writeoff_amount IS DISTINCT FROM NEW.writeoff_amount
     OR OLD.writeoff_status IS DISTINCT FROM NEW.writeoff_status THEN
    PERFORM private.refuse_unjournalled(
      format('Writing off loan %s', NEW.loan_number), 'write_off_loan');
  END IF;

  IF OLD.outstanding_balance IS DISTINCT FROM NEW.outstanding_balance THEN
    PERFORM private.refuse_unjournalled(
      format('The outstanding balance of loan %s', NEW.loan_number),
      'record_loan_repayment, settle_loan or write_off_loan');
  END IF;

  IF OLD.security_balance IS DISTINCT FROM NEW.security_balance THEN
    PERFORM private.refuse_unjournalled(
      format('The security held against loan %s', NEW.loan_number),
      'return_loan_security or settle_loan');
  END IF;

  IF OLD.principal_amount IS DISTINCT FROM NEW.principal_amount
     AND OLD.disbursed_at IS NOT NULL THEN
    PERFORM private.refuse_unjournalled(
      format('The principal of disbursed loan %s', NEW.loan_number),
      'a reversal and a fresh disbursement');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_loan_financial_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_loan_financial_transition ON public.loans;
CREATE TRIGGER trg_guard_loan_financial_transition
  BEFORE INSERT OR UPDATE OR DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.guard_loan_financial_transition();

-- ---------------------------------------------------------------------------
-- 3. The wholly financial tables
-- ---------------------------------------------------------------------------
-- Unlike `loans`, none of these rows has a non-financial life. A repayment
-- receipt, an expense, a member's admission fee and a security refund are each
-- a movement of money and nothing else, so every write goes through a posting
-- function or it does not happen.
CREATE OR REPLACE FUNCTION public.guard_financial_record()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER, deliberately. A SECURITY DEFINER trigger would see the
-- owner as `current_user` whoever called it, which is precisely the fact this
-- guard reads. Running as the invoker is what makes the check possible.
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF private.is_api_write() THEN
    PERFORM private.refuse_unjournalled(TG_ARGV[0], TG_ARGV[1]);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_financial_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_loan_repayment_write ON public.loan_repayments;
CREATE TRIGGER trg_guard_loan_repayment_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_record(
    'A repayment receipt',
    'record_loan_repayment, settle_loan or undo_loan_repayment');

DROP TRIGGER IF EXISTS trg_guard_expense_write ON public.expenses;
CREATE TRIGGER trg_guard_expense_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_record(
    'An expense', 'record_expense');

DROP TRIGGER IF EXISTS trg_guard_member_fee_write ON public.member_fees;
CREATE TRIGGER trg_guard_member_fee_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.member_fees
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_record(
    'A member fee', 'record_member_fee');

DROP TRIGGER IF EXISTS trg_guard_security_return_write ON public.loan_security_returns;
CREATE TRIGGER trg_guard_security_return_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.loan_security_returns
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_record(
    'A security refund', 'return_loan_security');

DROP TRIGGER IF EXISTS trg_guard_loan_reversal_write ON public.loan_reversals;
CREATE TRIGGER trg_guard_loan_reversal_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.loan_reversals
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_record(
    'A reversal record',
    'undo_loan_disbursement or undo_loan_repayment');

-- The instalment schedule is not money, but its paid columns are the loan
-- book's own record of collection, so they follow the receipt that moved them.
CREATE OR REPLACE FUNCTION public.guard_schedule_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER, deliberately. A SECURITY DEFINER trigger would see the
-- owner as `current_user` whoever called it, which is precisely the fact this
-- guard reads. Running as the invoker is what makes the check possible.
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF private.is_api_write()
     AND (OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
          OR OLD.remaining_balance IS DISTINCT FROM NEW.remaining_balance) THEN
    PERFORM private.refuse_unjournalled(
      'An instalment''s paid amount',
      'record_loan_repayment, settle_loan or undo_loan_repayment');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_schedule_payment_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_schedule_payment_columns ON public.loan_repayment_schedule;
CREATE TRIGGER trg_guard_schedule_payment_columns
  BEFORE UPDATE ON public.loan_repayment_schedule
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_payment_columns();

-- ---------------------------------------------------------------------------
-- 4. Settle a loan, atomically
-- ---------------------------------------------------------------------------
-- The member clears what is left in one payment. Every unpaid instalment
-- closes, any security still held is released, the loan reaches `Settled`, and
-- the receipt posts its journal — in one transaction or none of it.
--
-- The split follows the same rule the rest of the ledger uses: principal is
-- recognised first, up to what the loan book still says is owed, and the
-- remainder is interest. A settlement discounted below the outstanding
-- principal leaves that shortfall on Loans Receivable, exactly as the loan
-- book leaves it, so `v_ledger_health` stays quiet and the loss stays visible
-- until someone writes it off on purpose.
CREATE OR REPLACE FUNCTION public.settle_loan(
  _loan_id              TEXT,
  _amount               NUMERIC,
  _payment_method       TEXT,
  _receiving_account_id TEXT,
  _notes                TEXT DEFAULT NULL,
  _payment_date         DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (repayment_id TEXT, receipt_number TEXT, transaction_id TEXT,
               principal_portion NUMERIC, interest_portion NUMERIC,
               security_released NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l            public.loans%ROWTYPE;
  v_rep        public.loan_repayments%ROWTYPE;
  v_tx         TEXT;
  v_collected  NUMERIC(14,2);
  v_owed       NUMERIC(14,2);
  v_principal  NUMERIC(14,2);
  v_security   NUMERIC(14,2);
  v_now        TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF l.status IN ('Fully Paid', 'Settled', 'Written Off') THEN
    RAISE EXCEPTION 'Loan % is already closed', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF l.status = 'Pending' OR l.disbursed_at IS NULL THEN
    RAISE EXCEPTION 'Loan % has not been disbursed yet', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Enter the settlement amount' USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot settle loans' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(l.client_id) THEN
    RAISE EXCEPTION 'You are not permitted to settle this loan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM private.assert_postable_account(_receiving_account_id);

  -- Alias the table: `principal_portion` is also this function's OUT parameter.
  SELECT COALESCE(sum(r.principal_portion), 0) INTO v_collected
    FROM public.loan_repayments r WHERE r.loan_id = _loan_id;
  v_owed      := GREATEST(0, l.principal_amount - v_collected);
  v_principal := LEAST(v_owed, _amount);
  v_security  := COALESCE(l.security_balance, 0);

  INSERT INTO public.loan_repayments
    (loan_id, schedule_id, client_id, amount_paid, payment_date, payment_method,
     collection_type, security_amount, recorded_by, notes,
     principal_portion, interest_portion, allocation_source)
  VALUES
    (_loan_id, NULL, l.client_id, _amount, _payment_date, _payment_method,
     'Settlement', v_security, auth.uid(), COALESCE(_notes, 'Early loan settlement'),
     v_principal, _amount - v_principal, 'settlement')
  RETURNING * INTO v_rep;

  UPDATE public.loan_repayment_schedule
     SET paid_amount       = installment_amount,
         remaining_balance = 0,
         status            = 'Paid',
         paid_at           = _payment_date
   WHERE loan_repayment_schedule.loan_id = _loan_id
     AND status <> 'Paid';

  UPDATE public.loans
     SET outstanding_balance   = 0,
         completion_percentage = 100,
         status                = 'Settled',
         security_balance      = 0,
         settled_at            = v_now,
         settlement_amount     = _amount,
         settled_by            = auth.uid(),
         updated_at            = v_now
   WHERE id = _loan_id;

  -- If this raises, the receipt, the instalments and the loan all go back.
  v_tx := public.post_repayment(v_rep.id, _receiving_account_id);

  RETURN QUERY SELECT v_rep.id, v_rep.receipt_number, v_tx,
                      v_rep.principal_portion, v_rep.interest_portion, v_security;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Write a loan off, atomically
-- ---------------------------------------------------------------------------
-- Only the principal leaves the book. Uncollected interest was never taken to
-- income, so writing it off is not a further loss — booking it as one would
-- overstate the hit. `post_writeoff` already draws the journal that way; this
-- function makes the loan row and that journal inseparable.
CREATE OR REPLACE FUNCTION public.write_off_loan(_loan_id TEXT, _reason TEXT)
RETURNS TABLE (loan_id TEXT, transaction_id TEXT, transaction_number TEXT,
               amount_written_off NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l       public.loans%ROWTYPE;
  v_tx    TEXT;
  v_amt   NUMERIC(14,2);
  v_now   TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator can write off a loan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A write-off reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF l.status = 'Written Off' THEN
    RAISE EXCEPTION 'Loan % is already written off', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF l.disbursed_at IS NULL THEN
    RAISE EXCEPTION 'Loan % has not been disbursed, so there is nothing to write off', l.loan_number
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT COALESCE(l.is_bad_debt, FALSE) THEN
    RAISE EXCEPTION 'Declare loan % a bad debt before writing it off', l.loan_number
      USING ERRCODE = 'check_violation';
  END IF;

  v_amt := COALESCE(l.outstanding_balance, 0);

  UPDATE public.loans
     SET status              = 'Written Off',
         writeoff_status     = 'Written Off',
         writeoff_at         = v_now,
         writeoff_amount     = v_amt,
         writeoff_reason     = _reason,
         writeoff_by         = auth.uid(),
         outstanding_balance = 0,
         updated_at          = v_now
   WHERE id = _loan_id;

  INSERT INTO public.bad_loan_comments (loan_id, comment, created_by)
  VALUES (_loan_id, format('Written off: %s', _reason), auth.uid());

  v_tx := public.post_writeoff(_loan_id);

  RETURN QUERY
    SELECT _loan_id, v_tx, t.transaction_number, v_amt
      FROM public.financial_transactions t WHERE t.id = v_tx;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Member admission and passbook fees, atomically
-- ---------------------------------------------------------------------------
-- These were being written straight from the admission screen with no journal
-- at all, so every fee taken since the ledger landed would have been invisible
-- to it. Charged once per member, so a retry returns the existing row and
-- posts nothing: the fee income must not double-count.
CREATE OR REPLACE FUNCTION public.record_member_fee(
  _client_id            TEXT,
  _receiving_account_id TEXT,
  _admission_fee        NUMERIC,
  _passbook_fee         NUMERIC,
  _crb_fee              NUMERIC DEFAULT 0,
  _payment_method       TEXT DEFAULT 'Cash',
  _receipt_number       TEXT DEFAULT NULL
)
RETURNS TABLE (member_fee_id TEXT, receipt_number TEXT, transaction_id TEXT,
               total_amount NUMERIC, already_recorded BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  c       public.clients%ROWTYPE;
  f       public.member_fees%ROWTYPE;
  v_tx    TEXT;
  v_total NUMERIC(12,2);
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member % not found', _client_id USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot collect fees' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(_client_id) THEN
    RAISE EXCEPTION 'You are not permitted to collect fees from this member' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Already charged. Hand back what exists rather than charging twice.
  SELECT * INTO f FROM public.member_fees WHERE client_id = _client_id;
  IF FOUND THEN
    SELECT t.id INTO v_tx FROM public.financial_transactions t
     WHERE t.member_fee_id = f.id AND t.status <> 'reversed' LIMIT 1;
    RETURN QUERY SELECT f.id, f.receipt_number, v_tx, f.total_amount, TRUE;
    RETURN;
  END IF;

  PERFORM private.assert_postable_account(_receiving_account_id);

  v_total := COALESCE(_admission_fee, 0) + COALESCE(_passbook_fee, 0) + COALESCE(_crb_fee, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'A fee of zero has nothing to collect' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.member_fees
    (client_id, admission_fee, passbook_fee, crb_fee, total_amount,
     payment_method, receipt_number, branch_id, collected_by)
  VALUES
    (_client_id, COALESCE(_admission_fee, 0), COALESCE(_passbook_fee, 0), COALESCE(_crb_fee, 0),
     v_total, COALESCE(_payment_method, 'Cash'),
     COALESCE(_receipt_number, format('CM-ADM-%s', c.client_number)),
     c.branch_id, auth.uid())
  RETURNING * INTO f;

  v_tx := public.post_member_fee(f.id, _receiving_account_id);

  RETURN QUERY SELECT f.id, f.receipt_number, v_tx, f.total_amount, FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Return a member's security, atomically
-- ---------------------------------------------------------------------------
-- The other path that was never wired. Returning security is cash leaving the
-- building against a liability the ledger already carries, so it needs both
-- sides: the refund record and the loan's remaining balance move together with
-- the journal that pays it.
CREATE OR REPLACE FUNCTION public.return_loan_security(
  _loan_id           TEXT,
  _amount            NUMERIC,
  _source_account_id TEXT,
  _return_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (security_return_id TEXT, transaction_id TEXT,
               remaining_security NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l          public.loans%ROWTYPE;
  s          public.loan_security_returns%ROWTYPE;
  v_tx       TEXT;
  v_previous NUMERIC(12,2);
  v_present  NUMERIC(12,2);
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot return security' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(l.client_id) THEN
    RAISE EXCEPTION 'You are not permitted to act on this loan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_previous := COALESCE(l.security_balance, 0);
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Enter the amount being returned' USING ERRCODE = 'check_violation';
  END IF;
  IF _amount > v_previous THEN
    RAISE EXCEPTION 'Loan % holds only % in security', l.loan_number, v_previous
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_postable_account(_source_account_id);

  v_present := v_previous - _amount;

  INSERT INTO public.loan_security_returns
    (loan_id, client_id, branch_id, return_date, return_amount, previous_amount,
     present_amount, duration_weeks, principal, interest, status, processed_by)
  SELECT _loan_id, l.client_id, c.branch_id, _return_date, _amount, v_previous,
         v_present, COALESCE(l.loan_period_weeks, 0), l.principal_amount,
         l.total_interest_amount, 'Returned', auth.uid()
    FROM public.clients c WHERE c.id = l.client_id
  RETURNING * INTO s;

  UPDATE public.loans SET security_balance = v_present, updated_at = now()
   WHERE id = _loan_id;

  v_tx := public.post_security_refund(s.id, _source_account_id);

  RETURN QUERY SELECT s.id, v_tx, v_present;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. Each function re-checks the caller's role; `anon` may call none.
-- ---------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('settle_loan', 'write_off_loan', 'record_member_fee',
                         'return_loan_security')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- The guards are triggers, never RPCs.
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('guard_loan_financial_transition', 'guard_financial_record',
                         'guard_schedule_payment_columns')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Ledger health learns about the two paths that were never wired
-- ---------------------------------------------------------------------------
-- The view could not report a member fee or a security refund without a
-- journal, because until now neither was ever expected to have one.
CREATE OR REPLACE VIEW public.v_ledger_health
WITH (security_invoker = on) AS
  SELECT 'unbalanced_journal' AS check_name, t.id AS subject_id,
         t.transaction_number AS subject_ref,
         format('Journal does not balance by %s', sum(l.signed_amount)) AS detail
    FROM public.financial_transactions t
    JOIN public.financial_transaction_lines l ON l.transaction_id = t.id
   GROUP BY t.id, t.transaction_number
  HAVING sum(l.signed_amount) <> 0

  UNION ALL
  SELECT 'journal_without_lines', t.id, t.transaction_number, 'Journal has no lines'
    FROM public.financial_transactions t
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transaction_lines l WHERE l.transaction_id = t.id)

  UNION ALL
  SELECT 'disbursement_without_journal', l.id, l.loan_number,
         format('Loan disbursed %s for UGX %s has no ledger entry',
                l.disbursed_at::DATE, l.principal_amount)
    FROM public.loans l
   WHERE l.disbursed_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.loan_id = l.id AND t.entry_type = 'disbursement' AND t.status <> 'reversed')

  UNION ALL
  SELECT 'repayment_without_journal', r.id, r.receipt_number,
         format('Receipt for UGX %s has no ledger entry', r.amount_paid)
    FROM public.loan_repayments r
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.repayment_id = r.id AND t.status <> 'reversed')

  UNION ALL
  SELECT 'expense_without_journal', e.id, e.expense_number,
         format('Expense for UGX %s has no ledger entry', e.amount)
    FROM public.expenses e
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.expense_id = e.id AND t.status <> 'reversed')

  UNION ALL
  SELECT 'member_fee_without_journal', f.id, f.receipt_number,
         format('Member fees of UGX %s have no ledger entry', f.total_amount)
    FROM public.member_fees f
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.member_fee_id = f.id AND t.status <> 'reversed')

  UNION ALL
  SELECT 'security_refund_without_journal', s.id, s.id,
         format('Security refund of UGX %s has no ledger entry', s.return_amount)
    FROM public.loan_security_returns s
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.security_return_id = s.id AND t.status <> 'reversed')

  UNION ALL
  SELECT 'writeoff_without_journal', l.id, l.loan_number,
         format('Loan written off for UGX %s has no ledger entry', l.writeoff_amount)
    FROM public.loans l
   WHERE l.status = 'Written Off'
     AND NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.loan_id = l.id AND t.entry_type = 'writeoff' AND t.status <> 'reversed')

  UNION ALL
  SELECT 'allocation_mismatch', r.id, r.receipt_number,
         format('Allocation %s does not sum to amount paid %s',
                r.principal_portion + r.interest_portion + r.penalty_portion + r.fee_portion,
                r.amount_paid)
    FROM public.loan_repayments r
   WHERE round(r.principal_portion + r.interest_portion + r.penalty_portion + r.fee_portion, 2)
         <> round(r.amount_paid, 2)

  UNION ALL
  SELECT 'receivable_vs_loan_book', NULL, 'LOANS-RECEIVABLE',
         format('Ledger says %s, the loan book says %s', v.current_balance, b.expected)
    FROM public.v_account_balances v
   CROSS JOIN LATERAL (
     SELECT COALESCE((SELECT sum(principal_amount) FROM public.loans WHERE disbursed_at IS NOT NULL), 0)
          - COALESCE((SELECT sum(principal_portion) FROM public.loan_repayments), 0)
          - COALESCE((SELECT sum(amount) FROM public.financial_transaction_lines fl
                        JOIN public.financial_transactions ft ON ft.id = fl.transaction_id
                       WHERE ft.entry_type = 'writeoff' AND fl.direction = 'credit'), 0) AS expected
   ) b
   WHERE v.account_code = 'LOANS-RECEIVABLE'
     AND round(v.current_balance, 2) <> round(b.expected, 2)

  UNION ALL
  SELECT 'duplicate_source_posting', t.source_id, t.source_table,
         format('%s live journals reference the same source record', count(*))
    FROM public.financial_transactions t
   WHERE t.source_table IS NOT NULL AND t.source_id IS NOT NULL
     AND t.status <> 'reversed'
   GROUP BY t.source_id, t.source_table
  HAVING count(*) > 1;

COMMENT ON VIEW public.v_ledger_health IS
  'Standing integrity check. Any row is a financial fact the ledger has lost track of. Should always be empty.';

GRANT SELECT ON public.v_ledger_health TO authenticated, service_role;

COMMENT ON FUNCTION public.settle_loan(TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE) IS
  'Early settlement: receipt, instalments, loan closure, security release and journal in one transaction.';
COMMENT ON FUNCTION public.write_off_loan(TEXT, TEXT) IS
  'Write-off: loan closure, audit comment and the loss journal in one transaction. Administrator only.';
COMMENT ON FUNCTION public.record_member_fee(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) IS
  'Admission and passbook fees with their journal. Charged once per member; a retry posts nothing.';
COMMENT ON FUNCTION public.return_loan_security(TEXT, NUMERIC, TEXT, DATE) IS
  'Security refund: the refund record, the loan balance and the journal in one transaction.';

-- ---------------------------------------------------------------------------
-- 10. The legacy register uses the same discriminator as everything else
-- ---------------------------------------------------------------------------
-- `block_legacy_bank_write` let anything through when `auth.uid()` was NULL,
-- which was meant to say "service role". It also said "signed out", and it said
-- "a definer function acting for a signed-in user" the wrong way round: the
-- controlled reset below could not clear the register it is supposed to clear.
-- Same rule as the rest of this migration now.
CREATE OR REPLACE FUNCTION public.block_legacy_bank_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NOT private.is_api_write() THEN
    RETURN COALESCE(NEW, OLD);   -- service role, migrations, definer functions
  END IF;
  RAISE EXCEPTION
    'bank_transactions is a closed legacy register. Use post_capital_injection, post_internal_transfer or the relevant posting function.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.block_legacy_bank_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_legacy_bank_write() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. The system reset, made safe
-- ---------------------------------------------------------------------------
-- Settings carries a "System reset" that wiped the operational tables from the
-- browser, fifteen `delete()` calls with no error checked. It predates the
-- ledger, so it left every journal standing while deleting the loans they
-- described, and its `bank_transactions` delete now fails silently against the
-- legacy-register guard.
--
-- It exists to reset a demonstration or a training database. So:
--
--   * it is one transaction in the database, not fifteen calls from a browser;
--   * it deletes in foreign-key order, ledger first, and includes every table
--     the financial schema added;
--   * it refuses once the cut-over is complete. After a real opening balance
--     has been posted, these rows are Chetu's financial history and there is
--     no button that erases them.
--
-- The chart of accounts survives: it is configuration, not data. Its cut-over
-- stamps are cleared so a fresh opening balance can be posted.
CREATE OR REPLACE FUNCTION public.reset_operational_data(_confirm TEXT)
RETURNS TABLE (table_name TEXT, rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  t         TEXT;
  v_count   BIGINT;
  v_live    BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may reset the system' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _confirm IS DISTINCT FROM 'RESET ALL DATA' THEN
    RAISE EXCEPTION 'Confirm the reset by passing the exact phrase' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(financial_cutover_completed, FALSE) INTO v_live FROM public.settings WHERE id = 1;
  IF v_live THEN
    RAISE EXCEPTION
      'The financial cut-over is complete, so this database holds real money. The reset is permanently disabled.'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Restore a snapshot if a genuine rollback is needed.';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'financial_transaction_lines', 'account_reconciliations', 'financial_transactions',
    'loan_reversals', 'loan_security_returns', 'bad_loan_comments',
    'loan_repayments', 'loan_repayment_schedule', 'member_fees', 'expenses',
    'bank_transactions', 'savings_transactions', 'savings_accounts',
    'group_attendance', 'transfers', 'guarantors', 'client_documents',
    'loans', 'loan_applications', 'group_members', 'clients', 'client_groups',
    'loan_products', 'notifications', 'business_day_audit', 'access_requests',
    'officer_days', 'business_days', 'audit_logs'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I', t);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := t; rows_deleted := v_count;
    RETURN NEXT;
  END LOOP;

  -- The accounts stay; their cut-over stamps do not.
  UPDATE public.financial_accounts SET opening_balance_date = NULL
   WHERE opening_balance_date IS NOT NULL;

  UPDATE public.settings
     SET financial_cutover_date = NULL, financial_cutover_completed = FALSE
   WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_operational_data(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_operational_data(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_operational_data(TEXT) IS
  'Clears a demonstration or training database in one transaction, ledger included. Administrator only, and permanently refused once the financial cut-over is complete.';

-- ---------------------------------------------------------------------------
-- 12. The building blocks stop being doors
-- ---------------------------------------------------------------------------
-- With settlement, write-off, member fees and security refunds now atomic,
-- every one of these is called by an atomic function and by nothing else. Left
-- granted to `authenticated` they are the mirror of the hole this migration
-- closes: a journal posted with no business event behind it, rather than a
-- business event with no journal.
--
-- Revoking `authenticated` does not touch the atomic functions. They are
-- SECURITY DEFINER owned by the database owner, so they call these as the
-- owner, which still holds EXECUTE.
--
-- The postings NOT listed here stay open on purpose: capital, transfers,
-- reconciliation adjustments, opening balances and reversals are financial
-- events in their own right, driven from the Financial Ledger screen, with no
-- business row to be atomic with.
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('post_disbursement', 'post_repayment', 'post_expense',
                         'post_member_fee', 'post_security_refund', 'post_writeoff')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
