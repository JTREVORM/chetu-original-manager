-- ===========================================================================
-- CHETU MICROFINANCE — atomic disbursement, collection and rollback
-- ===========================================================================
-- `post_disbursement` in migration 001600 writes the journal correctly, but a
-- caller could still mark the loan Active and then fail to call it. That is
-- the exact shape of the bug this programme exists to remove, so the two steps
-- are welded together here: one function, one transaction, all of it or none
-- of it.
--
-- The client still computes the repayment dates, because the meeting-day
-- arithmetic lives in `meetingDay.ts` and belongs there. It hands the result
-- in; the database decides whether the disbursement happens.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Disburse: mark the loan, close the application, post the journal. Together.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disburse_loan(
  _loan_id              TEXT,
  _funding_account_id   TEXT,
  _first_repayment_date DATE DEFAULT NULL,
  _final_due_date       DATE DEFAULT NULL
)
RETURNS TABLE (loan_id TEXT, transaction_id TEXT, transaction_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l      public.loans%ROWTYPE;
  v_tx   TEXT;
  v_now  TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF l.disbursed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Loan % has already been disbursed', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF l.status <> 'Pending' THEN
    RAISE EXCEPTION 'Loan % is %, so it cannot be disbursed', l.loan_number, l.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot disburse loans' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(l.client_id) THEN
    RAISE EXCEPTION 'You are not permitted to disburse this loan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Check the account before touching the loan, so the common mistake — a
  -- closed account, or another branch's till — fails before anything moves.
  PERFORM private.assert_postable_account(_funding_account_id);

  IF NOT EXISTS (SELECT 1 FROM public.loan_repayment_schedule WHERE loan_repayment_schedule.loan_id = _loan_id) THEN
    RAISE EXCEPTION 'Loan % has no repayment schedule and cannot be disbursed', l.loan_number
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.loans
     SET status               = 'Active',
         disbursed_at         = v_now,
         disbursed_by         = auth.uid(),
         first_repayment_date = COALESCE(_first_repayment_date, first_repayment_date),
         final_due_date       = COALESCE(_final_due_date, final_due_date),
         updated_at           = v_now
   WHERE id = _loan_id;

  IF l.application_id IS NOT NULL THEN
    UPDATE public.loan_applications
       SET status = 'Disbursed', updated_at = v_now
     WHERE id = l.application_id;
  END IF;

  -- If this raises, everything above rolls back with it. That is the point.
  v_tx := public.post_disbursement(_loan_id, _funding_account_id);

  RETURN QUERY
    SELECT _loan_id, v_tx, t.transaction_number
      FROM public.financial_transactions t WHERE t.id = v_tx;
END;
$$;

-- ---------------------------------------------------------------------------
-- Collect: write the receipt, apply it to the instalment, roll the loan
-- forward, post the journal. Together.
--
-- The allocation across instalments stays in the application
-- (`allocatePayment`, oldest due date first — the rule Chetu has always used).
-- It is passed in as `_allocations`, a JSONB array of
-- {schedule_id, paid_amount, remaining_balance, status}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_loan_repayment(
  _loan_id            TEXT,
  _amount             NUMERIC,
  _payment_method     TEXT,
  _receiving_account_id TEXT,
  _allocations        JSONB,
  _primary_schedule_id TEXT DEFAULT NULL,
  _collection_type    TEXT DEFAULT 'Regular',
  _notes              TEXT DEFAULT NULL,
  _payment_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (repayment_id TEXT, receipt_number TEXT, transaction_id TEXT,
               principal_portion NUMERIC, interest_portion NUMERIC,
               outstanding_balance NUMERIC, loan_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l          public.loans%ROWTYPE;
  v_rep      public.loan_repayments%ROWTYPE;
  v_tx       TEXT;
  v_alloc    JSONB;
  v_new_out  NUMERIC(12,2);
  v_pct      NUMERIC(5,2);
  v_status   TEXT;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF l.status IN ('Fully Paid', 'Settled', 'Written Off') THEN
    RAISE EXCEPTION 'Loan % is already closed', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF l.status = 'Pending' THEN
    RAISE EXCEPTION 'Loan % has not been disbursed yet', l.loan_number USING ERRCODE = 'check_violation';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Enter the amount collected' USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot record collections' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM private.assert_postable_account(_receiving_account_id);

  INSERT INTO public.loan_repayments
    (loan_id, schedule_id, client_id, amount_paid, payment_date, payment_method,
     collection_type, recorded_by, notes)
  VALUES
    (_loan_id, _primary_schedule_id, l.client_id, _amount, _payment_date, _payment_method,
     COALESCE(_collection_type, 'Regular'), auth.uid(), _notes)
  RETURNING * INTO v_rep;

  -- Apply the allocation the application worked out.
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(_allocations, '[]'::jsonb)) LOOP
    UPDATE public.loan_repayment_schedule
       SET paid_amount       = (v_alloc ->> 'paid_amount')::NUMERIC,
           remaining_balance = (v_alloc ->> 'remaining_balance')::NUMERIC,
           status            = v_alloc ->> 'status',
           paid_at           = _payment_date
     WHERE id = v_alloc ->> 'schedule_id';
  END LOOP;

  v_new_out := GREATEST(0, l.outstanding_balance - _amount);
  v_pct := LEAST(100, round((l.total_amount_payable - v_new_out) / NULLIF(l.total_amount_payable, 0) * 100));
  v_status := CASE WHEN v_new_out = 0 THEN 'Fully Paid' ELSE 'Partially Paid' END;

  UPDATE public.loans
     SET outstanding_balance   = v_new_out,
         completion_percentage = v_pct,
         status                = v_status,
         updated_at            = now()
   WHERE id = _loan_id;

  v_tx := public.post_repayment(v_rep.id, _receiving_account_id);

  RETURN QUERY SELECT v_rep.id, v_rep.receipt_number, v_tx,
                      v_rep.principal_portion, v_rep.interest_portion,
                      v_new_out, v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo a disbursement: reverse the journal that exists, and put the loan back.
--
-- The old rollback posted a fresh Deposit of the principal, unconnected to
-- anything. Since the original debit had been silently rejected by row level
-- security, that credited the ledger with money that never left the building.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_loan_disbursement(_loan_id TEXT, _reason TEXT)
RETURNS TABLE (reversal_id TEXT, reversal_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  l       public.loans%ROWTYPE;
  v_orig  TEXT;
  v_rev   TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator can undo a disbursement' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to undo a disbursement' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.loan_repayments WHERE loan_repayments.loan_id = _loan_id) THEN
    RAISE EXCEPTION 'Loan % has collections against it and cannot be un-disbursed', l.loan_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_orig FROM public.financial_transactions
   WHERE financial_transactions.loan_id = _loan_id
     AND entry_type = 'disbursement' AND status = 'posted'
   ORDER BY created_at DESC LIMIT 1;

  IF v_orig IS NULL THEN
    RAISE EXCEPTION
      'Loan % has no posted disbursement journal to reverse. Check v_ledger_health before continuing.',
      l.loan_number USING ERRCODE = 'check_violation';
  END IF;

  v_rev := public.reverse_financial_transaction(v_orig, _reason);

  UPDATE public.loans
     SET status = 'Pending', disbursed_at = NULL, disbursed_by = NULL, updated_at = now()
   WHERE id = _loan_id;

  IF l.application_id IS NOT NULL THEN
    UPDATE public.loan_applications
       SET status = 'Approved', updated_at = now()
     WHERE id = l.application_id;
  END IF;

  INSERT INTO public.loan_reversals (loan_id, reversal_type, reference_number, amount, reason, reversed_by)
  VALUES (_loan_id, 'Disbursement', l.loan_number, l.principal_amount, _reason, auth.uid());

  RETURN QUERY
    SELECT v_rev, t.transaction_number FROM public.financial_transactions t WHERE t.id = v_rev;
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo a receipt: reverse its journal, put the instalment and the loan back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_loan_repayment(_repayment_id TEXT, _reason TEXT)
RETURNS TABLE (reversal_id TEXT, reversal_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  r      public.loan_repayments%ROWTYPE;
  l      public.loans%ROWTYPE;
  v_orig TEXT;
  v_rev  TEXT;
  v_out  NUMERIC(12,2);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator can reverse a collection' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to reverse a collection' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM public.loan_repayments WHERE id = _repayment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found', _repayment_id USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO l FROM public.loans WHERE id = r.loan_id FOR UPDATE;

  SELECT id INTO v_orig FROM public.financial_transactions
   WHERE financial_transactions.repayment_id = _repayment_id
     AND entry_type = 'repayment' AND status = 'posted'
   ORDER BY created_at DESC LIMIT 1;
  IF v_orig IS NULL THEN
    RAISE EXCEPTION 'Receipt % has no posted journal to reverse', r.receipt_number
      USING ERRCODE = 'check_violation';
  END IF;

  v_rev := public.reverse_financial_transaction(v_orig, _reason);

  IF r.schedule_id IS NOT NULL THEN
    UPDATE public.loan_repayment_schedule
       SET paid_amount       = GREATEST(0, paid_amount - r.amount_paid),
           remaining_balance = LEAST(installment_amount, remaining_balance + r.amount_paid),
           status            = CASE WHEN GREATEST(0, paid_amount - r.amount_paid) = 0 THEN 'Pending'
                                    ELSE 'Partially Paid' END,
           paid_at           = CASE WHEN GREATEST(0, paid_amount - r.amount_paid) = 0 THEN NULL ELSE paid_at END
     WHERE id = r.schedule_id;
  END IF;

  v_out := LEAST(l.total_amount_payable, l.outstanding_balance + r.amount_paid);
  UPDATE public.loans
     SET outstanding_balance   = v_out,
         completion_percentage = LEAST(100, round((l.total_amount_payable - v_out)
                                   / NULLIF(l.total_amount_payable, 0) * 100)),
         status = CASE WHEN v_out >= l.total_amount_payable THEN 'Active' ELSE 'Partially Paid' END,
         updated_at = now()
   WHERE id = l.id;

  INSERT INTO public.loan_reversals (loan_id, reversal_type, reference_number, amount, reason, reversed_by)
  VALUES (l.id, 'Repayment', r.receipt_number, r.amount_paid, _reason, auth.uid());

  DELETE FROM public.loan_repayments WHERE id = _repayment_id;

  RETURN QUERY
    SELECT v_rev, t.transaction_number FROM public.financial_transactions t WHERE t.id = v_rev;
END;
$$;

-- ---------------------------------------------------------------------------
-- Record an expense and post it in one step, so an expense can never exist
-- without the account that paid for it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense(
  _category TEXT, _description TEXT, _amount NUMERIC, _expense_date DATE,
  _payment_method TEXT, _source_account_id TEXT, _branch_id TEXT DEFAULT NULL,
  _receipt_url TEXT DEFAULT NULL
)
RETURNS TABLE (expense_id TEXT, expense_number TEXT, transaction_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE e public.expenses%ROWTYPE; v_tx TEXT; v_branch TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.can_post_financial() THEN
    RAISE EXCEPTION 'You are not permitted to record expenses' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'An expense must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  -- A Branch Manager's expense belongs to their branch whether they said so or
  -- not; an Administrator must be explicit about which branch is spending.
  v_branch := _branch_id;
  IF v_branch IS NULL AND auth.uid() IS NOT NULL AND private.is_branch_manager() THEN
    v_branch := (private.caller_branch_ids())[1];
  END IF;

  PERFORM private.assert_postable_account(_source_account_id);

  INSERT INTO public.expenses
    (category, description, amount, expense_date, payment_method, branch_id, receipt_url, recorded_by)
  VALUES
    (_category, _description, _amount, _expense_date, _payment_method, v_branch, _receipt_url, auth.uid())
  RETURNING * INTO e;

  v_tx := public.post_expense(e.id, _source_account_id);

  RETURN QUERY SELECT e.id, e.expense_number, v_tx;
END;
$$;

-- ---------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('disburse_loan', 'record_loan_repayment', 'undo_loan_disbursement',
                         'undo_loan_repayment', 'record_expense')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
