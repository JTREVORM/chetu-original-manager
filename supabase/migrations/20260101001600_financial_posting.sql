-- ===========================================================================
-- CHETU MICROFINANCE — posting functions
-- ===========================================================================
-- The audit found 15 loans disbursed with no ledger entry. The disbursement
-- code did write one; every write was rejected by row level security, because
-- `bank_transactions` was Administrator-only while disbursement was open to
-- Loan Officers, and the caller discarded the error:
--
--     if (!txError && btData) { ...update local state... }
--
-- The fix is not to widen the table's write policy — that would let any
-- officer hand-journal the institution's cash. It is to make posting happen
-- inside a function that (1) checks the caller may perform the business
-- action, (2) validates the account, (3) writes the balanced journal, and
-- (4) raises on any failure so the whole statement rolls back together.
--
-- Direct INSERT into the ledger is denied to `authenticated` in migration
-- 001800. These functions are the only way money moves, and none of them can
-- half-succeed: a journal that does not balance cannot commit, so a
-- disbursement can no longer exist without its financial entry.
--
-- Every function is SECURITY DEFINER with a pinned search_path and EXECUTE
-- revoked from `anon`, answering the advisor findings for this new surface.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Who may post financial entries at all. Loan Officers are deliberately absent:
-- they trigger postings through disbursement and collection, which carry their
-- own business-permission checks, but they may not open the ledger directly.
CREATE OR REPLACE FUNCTION private.can_post_financial()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator', 'Branch Manager') $$;

-- Which accounts a caller may see. Administrators and Auditors see everything;
-- a Branch Manager sees their own branches plus institution-wide accounts.
CREATE OR REPLACE FUNCTION private.can_see_account(_account_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN private.is_admin_or_auditor() THEN TRUE
    WHEN private.is_branch_manager() THEN EXISTS (
      SELECT 1 FROM public.financial_accounts a
       WHERE a.id = _account_id
         AND (a.branch_id IS NULL OR a.branch_id = ANY (private.caller_branch_ids()))
    )
    ELSE FALSE
  END
$$;

REVOKE ALL ON FUNCTION private.can_post_financial() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_see_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_post_financial() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_see_account(TEXT) TO authenticated, service_role;

-- Resolve a control account by code, failing loudly rather than posting to null.
CREATE OR REPLACE FUNCTION private.account_by_code(_code TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id TEXT;
BEGIN
  SELECT id INTO v_id FROM public.financial_accounts WHERE account_code = _code;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Financial account % is not configured', _code USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.account_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.account_by_code(TEXT) TO authenticated, service_role;

-- Validate an operator-selected money account: it must exist, be active, be a
-- real money location, and be one the caller is entitled to move money through.
CREATE OR REPLACE FUNCTION private.assert_postable_account(_account_id TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE a public.financial_accounts%ROWTYPE;
BEGIN
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'A financial account must be selected for this transaction'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO a FROM public.financial_accounts WHERE id = _account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial account % does not exist', _account_id USING ERRCODE = 'check_violation';
  END IF;
  IF a.status <> 'Active' THEN
    RAISE EXCEPTION 'Account % is %, so money cannot be posted through it', a.account_name, a.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT a.allow_manual_posting THEN
    RAISE EXCEPTION 'Account % is a control account and cannot be used as a source or destination', a.account_name
      USING ERRCODE = 'check_violation';
  END IF;
  IF a.account_class <> 'asset_liquid' THEN
    RAISE EXCEPTION 'Account % is not a cash, bank or wallet account', a.account_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- auth.uid() IS NULL is the service role (migrations, verification scripts).
  IF auth.uid() IS NOT NULL
     AND NOT private.is_admin()
     AND a.branch_id IS NOT NULL
     AND NOT (a.branch_id = ANY (private.caller_branch_ids())) THEN
    RAISE EXCEPTION 'Account % belongs to another branch', a.account_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_postable_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.assert_postable_account(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The one place a journal is written.
--
-- `_lines` is a JSONB array of {account_id | account_code, direction, amount, memo}.
-- The balance invariant is enforced by the deferred constraint trigger in
-- migration 001400, so this function does not need to re-check it — but it
-- does reject an empty or single-sided journal early, where the error message
-- can still name the caller's intent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.write_journal(
  _entry_type        TEXT,
  _description       TEXT,
  _lines             JSONB,
  _transaction_date  DATE    DEFAULT CURRENT_DATE,
  _branch_id         TEXT    DEFAULT NULL,
  _reference_number  TEXT    DEFAULT NULL,
  _loan_id           TEXT    DEFAULT NULL,
  _repayment_id      TEXT    DEFAULT NULL,
  _expense_id        TEXT    DEFAULT NULL,
  _member_fee_id     TEXT    DEFAULT NULL,
  _security_return_id TEXT   DEFAULT NULL,
  _client_id         TEXT    DEFAULT NULL,
  _source_table      TEXT    DEFAULT NULL,
  _source_id         TEXT    DEFAULT NULL,
  _reversal_of_id    TEXT    DEFAULT NULL,
  _reversal_reason   TEXT    DEFAULT NULL,
  _status            TEXT    DEFAULT 'posted',
  _is_legacy         BOOLEAN DEFAULT FALSE,
  _created_by        UUID    DEFAULT NULL,
  _created_at        TIMESTAMPTZ DEFAULT NULL,
  _business_day_id   TEXT    DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_tx_id   TEXT;
  v_line    JSONB;
  v_no      INTEGER := 0;
  v_account TEXT;
  v_debits  NUMERIC(14,2) := 0;
  v_credits NUMERIC(14,2) := 0;
BEGIN
  IF _lines IS NULL OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'A % journal needs at least two lines — where the money came from and where it went', _entry_type
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.financial_transactions (
    transaction_date, entry_type, status, branch_id, description, reference_number,
    business_day_id, loan_id, repayment_id, expense_id, member_fee_id,
    security_return_id, client_id, source_table, source_id,
    reversal_of_id, reversal_reason, is_legacy, created_by, created_at
  ) VALUES (
    _transaction_date, _entry_type, _status, _branch_id, _description, _reference_number,
    COALESCE(_business_day_id, private.current_business_day_id()),
    _loan_id, _repayment_id, _expense_id, _member_fee_id,
    _security_return_id, _client_id, _source_table, _source_id,
    _reversal_of_id, _reversal_reason, _is_legacy,
    COALESCE(_created_by, auth.uid()), COALESCE(_created_at, now())
  )
  RETURNING id INTO v_tx_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_no := v_no + 1;

    v_account := COALESCE(
      v_line ->> 'account_id',
      private.account_by_code(v_line ->> 'account_code')
    );

    -- A zero line carries no information and would make the journal harder to
    -- read; skip it rather than storing noise. (A loan with no CRB fee, say.)
    CONTINUE WHEN COALESCE((v_line ->> 'amount')::NUMERIC, 0) = 0;

    IF (v_line ->> 'direction') = 'debit' THEN
      v_debits := v_debits + (v_line ->> 'amount')::NUMERIC;
    ELSE
      v_credits := v_credits + (v_line ->> 'amount')::NUMERIC;
    END IF;

    INSERT INTO public.financial_transaction_lines
      (transaction_id, line_no, account_id, direction, amount, memo)
    VALUES
      (v_tx_id, v_no, v_account, v_line ->> 'direction',
       (v_line ->> 'amount')::NUMERIC, v_line ->> 'memo');
  END LOOP;

  IF round(v_debits, 2) <> round(v_credits, 2) THEN
    RAISE EXCEPTION '% journal does not balance: debits % vs credits %',
      _entry_type, v_debits, v_credits USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_journal(TEXT, TEXT, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.write_journal(TEXT, TEXT, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

-- ===========================================================================
-- Public posting functions
-- ===========================================================================

-- --- Capital injection -----------------------------------------------------
--   Dr  destination cash/bank        Cr  Capital Introduced
CREATE OR REPLACE FUNCTION public.post_capital_injection(
  _account_id TEXT, _amount NUMERIC, _transaction_date DATE DEFAULT CURRENT_DATE,
  _reference TEXT DEFAULT NULL, _note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE v_branch TEXT;
BEGIN
  IF NOT private.is_admin() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Only an Administrator may record capital' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Capital amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM private.assert_postable_account(_account_id);
  SELECT branch_id INTO v_branch FROM public.financial_accounts WHERE id = _account_id;

  RETURN private.write_journal(
    'capital_injection',
    COALESCE(_note, 'Capital injection'),
    jsonb_build_array(
      jsonb_build_object('account_id', _account_id, 'direction', 'debit',  'amount', _amount, 'memo', 'Funds received'),
      jsonb_build_object('account_code', 'CAPITAL-INTRODUCED', 'direction', 'credit', 'amount', _amount, 'memo', 'Capital introduced')
    ),
    _transaction_date, v_branch, _reference
  );
END;
$$;

-- --- Capital withdrawal / drawings -----------------------------------------
CREATE OR REPLACE FUNCTION public.post_capital_withdrawal(
  _account_id TEXT, _amount NUMERIC, _transaction_date DATE DEFAULT CURRENT_DATE,
  _reference TEXT DEFAULT NULL, _note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE v_branch TEXT;
BEGIN
  IF NOT private.is_admin() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Only an Administrator may withdraw capital' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM private.assert_postable_account(_account_id);
  SELECT branch_id INTO v_branch FROM public.financial_accounts WHERE id = _account_id;

  RETURN private.write_journal(
    'capital_withdrawal',
    COALESCE(_note, 'Capital withdrawal'),
    jsonb_build_array(
      jsonb_build_object('account_code', 'CAPITAL-INTRODUCED', 'direction', 'debit', 'amount', _amount, 'memo', 'Capital withdrawn'),
      jsonb_build_object('account_id', _account_id, 'direction', 'credit', 'amount', _amount, 'memo', 'Funds paid out')
    ),
    _transaction_date, v_branch, _reference
  );
END;
$$;

-- --- Loan disbursement -----------------------------------------------------
--   Dr  Loans Receivable          principal
--     Cr  funding cash/bank                 net cash actually handed over
--     Cr  Processing / CRB / Group fee income
--     Cr  Member Security Deposits          refundable 15%
--
-- The amount that leaves the branch is the NET, not the principal. Posting the
-- principal — which the old code did — would have understated liquidity by the
-- retained fees and security and lost both from the accounts entirely.
CREATE OR REPLACE FUNCTION public.post_disbursement(
  _loan_id TEXT, _funding_account_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  l        public.loans%ROWTYPE;
  v_branch TEXT;
  v_net    NUMERIC(12,2);
  v_name   TEXT;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;

  -- Whoever may disburse the loan may post its journal. The business
  -- permission is the loan's, not the ledger's — which is precisely the
  -- mismatch that lost 15 disbursements.
  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(l.client_id) THEN
    RAISE EXCEPTION 'You are not permitted to disburse this loan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot post financial transactions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM private.assert_postable_account(_funding_account_id);

  SELECT c.branch_id, c.full_name INTO v_branch, v_name
    FROM public.clients c WHERE c.id = l.client_id;

  v_net := COALESCE(l.net_disbursed_amount,
                    l.principal_amount - l.processing_fee_amount - l.crb_fee_amount
                      - l.group_maintenance_fee - l.security_amount);

  IF v_net <= 0 THEN
    RAISE EXCEPTION 'Loan % has no net disbursable amount', l.loan_number USING ERRCODE = 'check_violation';
  END IF;

  RETURN private.write_journal(
    'disbursement',
    format('Disbursement of loan %s to %s', l.loan_number, COALESCE(v_name, 'member')),
    jsonb_build_array(
      jsonb_build_object('account_code', 'LOANS-RECEIVABLE',    'direction', 'debit',  'amount', l.principal_amount,        'memo', 'Principal owed by member'),
      jsonb_build_object('account_id',   _funding_account_id,   'direction', 'credit', 'amount', v_net,                     'memo', 'Net cash to member'),
      jsonb_build_object('account_code', 'INC-FEE-PROCESSING',  'direction', 'credit', 'amount', l.processing_fee_amount,   'memo', 'Processing fee retained'),
      jsonb_build_object('account_code', 'INC-FEE-CRB',         'direction', 'credit', 'amount', l.crb_fee_amount,          'memo', 'CRB fee retained'),
      jsonb_build_object('account_code', 'INC-FEE-GROUP-MAINT', 'direction', 'credit', 'amount', l.group_maintenance_fee,   'memo', 'Group maintenance fee retained'),
      jsonb_build_object('account_code', 'SECURITY-HELD',       'direction', 'credit', 'amount', l.security_amount,         'memo', 'Refundable security withheld')
    ),
    COALESCE(l.disbursed_at::DATE, CURRENT_DATE), v_branch, l.loan_number,
    _loan_id, NULL, NULL, NULL, NULL, l.client_id,
    'loans', _loan_id
  );
END;
$$;

-- --- Loan repayment --------------------------------------------------------
--   Dr  receiving cash/bank    full amount received
--     Cr  Loans Receivable              principal portion
--     Cr  Interest Income               interest portion
--     Cr  Penalty Income                penalty portion (zero today)
CREATE OR REPLACE FUNCTION public.post_repayment(
  _repayment_id TEXT, _receiving_account_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  r        public.loan_repayments%ROWTYPE;
  v_branch TEXT;
  v_loan   TEXT;
BEGIN
  SELECT * INTO r FROM public.loan_repayments WHERE id = _repayment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repayment % not found', _repayment_id USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT private.can_see_client(r.client_id) THEN
    RAISE EXCEPTION 'You are not permitted to post against this member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot post financial transactions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM private.assert_postable_account(_receiving_account_id);

  SELECT c.branch_id INTO v_branch FROM public.clients c WHERE c.id = r.client_id;
  SELECT loan_number INTO v_loan FROM public.loans WHERE id = r.loan_id;

  RETURN private.write_journal(
    'repayment',
    format('Repayment on loan %s, receipt %s', COALESCE(v_loan, r.loan_id), r.receipt_number),
    jsonb_build_array(
      jsonb_build_object('account_id',   _receiving_account_id, 'direction', 'debit',  'amount', r.amount_paid,        'memo', 'Cash received'),
      jsonb_build_object('account_code', 'LOANS-RECEIVABLE',    'direction', 'credit', 'amount', r.principal_portion,  'memo', 'Principal repaid'),
      jsonb_build_object('account_code', 'INC-INTEREST',        'direction', 'credit', 'amount', r.interest_portion,   'memo', 'Interest earned'),
      jsonb_build_object('account_code', 'INC-PENALTY',         'direction', 'credit', 'amount', r.penalty_portion,    'memo', 'Penalty collected')
    ),
    r.payment_date, v_branch, r.receipt_number,
    r.loan_id, _repayment_id, NULL, NULL, NULL, r.client_id,
    'loan_repayments', _repayment_id
  );
END;
$$;

-- --- Member admission / passbook fee ---------------------------------------
CREATE OR REPLACE FUNCTION public.post_member_fee(
  _member_fee_id TEXT, _receiving_account_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE f public.member_fees%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.member_fees WHERE id = _member_fee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member fee % not found', _member_fee_id USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot post financial transactions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM private.assert_postable_account(_receiving_account_id);

  RETURN private.write_journal(
    'fee_collection',
    format('Member fees, receipt %s', COALESCE(f.receipt_number, f.id)),
    jsonb_build_array(
      jsonb_build_object('account_id',   _receiving_account_id, 'direction', 'debit',  'amount', f.total_amount,   'memo', 'Fees received'),
      jsonb_build_object('account_code', 'INC-FEE-ADMISSION',   'direction', 'credit', 'amount', f.admission_fee,  'memo', 'Admission fee'),
      jsonb_build_object('account_code', 'INC-FEE-PASSBOOK',    'direction', 'credit', 'amount', f.passbook_fee,   'memo', 'Passbook fee'),
      jsonb_build_object('account_code', 'INC-FEE-CRB',         'direction', 'credit', 'amount', f.crb_fee,        'memo', 'CRB fee')
    ),
    f.created_at::DATE, f.branch_id, f.receipt_number,
    NULL, NULL, NULL, _member_fee_id, NULL, f.client_id,
    'member_fees', _member_fee_id
  );
END;
$$;

-- --- Expense ---------------------------------------------------------------
--   Dr  Expense category        Cr  source cash/bank
-- Branch Managers may post for their own branch only; that is enforced here
-- and again by the RLS policy in migration 001800.
CREATE OR REPLACE FUNCTION public.post_expense(
  _expense_id TEXT, _source_account_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  e      public.expenses%ROWTYPE;
  v_code TEXT;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense % not found', _expense_id USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT private.can_post_financial() THEN
    RAISE EXCEPTION 'You are not permitted to post expenses' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.is_admin()
     AND (e.branch_id IS NULL OR NOT (e.branch_id = ANY (private.caller_branch_ids()))) THEN
    RAISE EXCEPTION 'You may only post expenses for your own branch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM private.assert_postable_account(_source_account_id);

  v_code := 'EXP-' || upper(regexp_replace(e.category, '[^a-zA-Z0-9]+', '-', 'g'));
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE account_code = v_code) THEN
    v_code := 'EXP-OTHER';
  END IF;

  RETURN private.write_journal(
    'expense',
    format('%s — %s', e.category, e.description),
    jsonb_build_array(
      jsonb_build_object('account_code', v_code,             'direction', 'debit',  'amount', e.amount, 'memo', e.description),
      jsonb_build_object('account_id',   _source_account_id, 'direction', 'credit', 'amount', e.amount, 'memo', 'Paid from account')
    ),
    e.expense_date, e.branch_id, e.expense_number,
    NULL, NULL, _expense_id, NULL, NULL, NULL,
    'expenses', _expense_id
  );
END;
$$;

-- --- Internal transfer -----------------------------------------------------
--   Dr  destination     Cr  source
-- Touches no income or expense account, so a transfer cannot inflate either.
CREATE OR REPLACE FUNCTION public.post_internal_transfer(
  _from_account_id TEXT, _to_account_id TEXT, _amount NUMERIC,
  _transaction_date DATE DEFAULT CURRENT_DATE,
  _reference TEXT DEFAULT NULL, _note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_from TEXT; v_to TEXT; v_branch TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.can_post_financial() THEN
    RAISE EXCEPTION 'You are not permitted to move money between accounts' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _from_account_id = _to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must differ' USING ERRCODE = 'check_violation';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_postable_account(_from_account_id);
  PERFORM private.assert_postable_account(_to_account_id);

  SELECT account_name, branch_id INTO v_from, v_branch FROM public.financial_accounts WHERE id = _from_account_id;
  SELECT account_name INTO v_to FROM public.financial_accounts WHERE id = _to_account_id;

  RETURN private.write_journal(
    'internal_transfer',
    COALESCE(_note, format('Transfer from %s to %s', v_from, v_to)),
    jsonb_build_array(
      jsonb_build_object('account_id', _to_account_id,   'direction', 'debit',  'amount', _amount, 'memo', 'Transfer in'),
      jsonb_build_object('account_id', _from_account_id, 'direction', 'credit', 'amount', _amount, 'memo', 'Transfer out')
    ),
    _transaction_date, v_branch, _reference
  );
END;
$$;

-- --- Security refund -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_security_refund(
  _security_return_id TEXT, _source_account_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE s public.loan_security_returns%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.loan_security_returns WHERE id = _security_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Security return % not found', _security_return_id USING ERRCODE = 'check_violation';
  END IF;
  IF private.is_auditor() THEN
    RAISE EXCEPTION 'Auditors cannot post financial transactions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM private.assert_postable_account(_source_account_id);

  RETURN private.write_journal(
    'security_refund',
    format('Security refund for loan %s', s.loan_id),
    jsonb_build_array(
      jsonb_build_object('account_code', 'SECURITY-HELD',    'direction', 'debit',  'amount', s.return_amount, 'memo', 'Security released'),
      jsonb_build_object('account_id',   _source_account_id, 'direction', 'credit', 'amount', s.return_amount, 'memo', 'Refunded to member')
    ),
    s.return_date, s.branch_id, s.id,
    s.loan_id, NULL, NULL, NULL, _security_return_id, s.client_id,
    'loan_security_returns', _security_return_id
  );
END;
$$;

-- --- Write-off -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_writeoff(_loan_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  l           public.loans%ROWTYPE;
  v_branch    TEXT;
  v_principal NUMERIC(14,2);
  v_interest  NUMERIC(14,2);
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', _loan_id USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may write off a loan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- What is actually still owed, taken from the schedule rather than from
  -- `outstanding_balance` — which write-off zeroes, so reading it afterwards
  -- would post nothing.
  SELECT COALESCE(sum(s.principal_portion - CASE WHEN s.installment_amount > 0
            THEN s.paid_amount * s.principal_portion / s.installment_amount ELSE 0 END), 0),
         COALESCE(sum(s.interest_portion  - CASE WHEN s.installment_amount > 0
            THEN s.paid_amount * s.interest_portion  / s.installment_amount ELSE 0 END), 0)
    INTO v_principal, v_interest
    FROM public.loan_repayment_schedule s WHERE s.loan_id = _loan_id;

  IF round(v_principal, 2) + round(v_interest, 2) <= 0 THEN
    RAISE EXCEPTION 'Loan % has nothing outstanding to write off', l.loan_number USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.branch_id INTO v_branch FROM public.clients c WHERE c.id = l.client_id;

  -- Only the principal was ever recognised as an asset; uncollected interest
  -- was never taken to income, so writing it off is not a further loss.
  RETURN private.write_journal(
    'writeoff',
    format('Write-off of loan %s: %s', l.loan_number, COALESCE(l.writeoff_reason, 'no reason recorded')),
    jsonb_build_array(
      jsonb_build_object('account_code', 'WRITEOFF-LOSS',    'direction', 'debit',  'amount', round(v_principal, 2), 'memo', 'Principal written off'),
      jsonb_build_object('account_code', 'LOANS-RECEIVABLE', 'direction', 'credit', 'amount', round(v_principal, 2), 'memo', 'Removed from loan book')
    ),
    COALESCE(l.writeoff_at::DATE, CURRENT_DATE), v_branch, l.loan_number,
    _loan_id, NULL, NULL, NULL, NULL, l.client_id,
    'loans_writeoff', _loan_id
  );
END;
$$;

-- --- Reversal --------------------------------------------------------------
-- A true reversal: every line of the original, mirrored, linked back to it.
-- Replaces `undoDisbursement`'s old behaviour of inventing an unrelated
-- deposit — which, because the original debit had been silently rejected,
-- would have credited the ledger with money that was never taken out.
CREATE OR REPLACE FUNCTION public.reverse_financial_transaction(
  _transaction_id TEXT, _reason TEXT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  t       public.financial_transactions%ROWTYPE;
  v_lines JSONB;
  v_new   TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may reverse a financial transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reversal reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO t FROM public.financial_transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', _transaction_id USING ERRCODE = 'check_violation';
  END IF;
  IF t.status = 'reversed' THEN
    RAISE EXCEPTION 'Transaction % has already been reversed', t.transaction_number USING ERRCODE = 'check_violation';
  END IF;
  IF t.status = 'reversal' THEN
    RAISE EXCEPTION 'Transaction % is itself a reversal', t.transaction_number USING ERRCODE = 'check_violation';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'account_id', account_id,
           'direction', CASE WHEN direction = 'debit' THEN 'credit' ELSE 'debit' END,
           'amount', amount,
           'memo', 'Reversal: ' || COALESCE(memo, '')
         ) ORDER BY line_no)
    INTO v_lines
    FROM public.financial_transaction_lines WHERE transaction_id = _transaction_id;

  v_new := private.write_journal(
    'reversal',
    format('Reversal of %s: %s', t.transaction_number, _reason),
    v_lines,
    CURRENT_DATE, t.branch_id, t.reference_number,
    t.loan_id, t.repayment_id, t.expense_id, t.member_fee_id,
    t.security_return_id, t.client_id,
    NULL, NULL,                       -- no source link: it would collide with the original
    _transaction_id, _reason, 'reversal'
  );

  UPDATE public.financial_transactions SET status = 'reversed' WHERE id = _transaction_id;
  RETURN v_new;
END;
$$;

-- --- Reconciliation adjustment ---------------------------------------------
-- The one controlled way to move an account to a counted reality. Always
-- against LEGACY-UNCLASSIFIED, always Administrator, always with a reason,
-- and permanently visible in the ledger and the reports.
CREATE OR REPLACE FUNCTION public.post_reconciliation_adjustment(
  _account_id TEXT, _amount NUMERIC, _reason TEXT,
  _transaction_date DATE DEFAULT CURRENT_DATE, _reference TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE v_branch TEXT; v_lines JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may post a reconciliation adjustment' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reconciliation adjustment must record why' USING ERRCODE = 'check_violation';
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'A reconciliation adjustment of zero has nothing to record' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM private.assert_postable_account(_account_id);
  SELECT branch_id INTO v_branch FROM public.financial_accounts WHERE id = _account_id;

  v_lines := CASE WHEN _amount > 0 THEN
    jsonb_build_array(
      jsonb_build_object('account_id',   _account_id,           'direction', 'debit',  'amount', _amount, 'memo', 'Counted higher than the ledger'),
      jsonb_build_object('account_code', 'LEGACY-UNCLASSIFIED', 'direction', 'credit', 'amount', _amount, 'memo', _reason))
  ELSE
    jsonb_build_array(
      jsonb_build_object('account_code', 'LEGACY-UNCLASSIFIED', 'direction', 'debit',  'amount', abs(_amount), 'memo', _reason),
      jsonb_build_object('account_id',   _account_id,           'direction', 'credit', 'amount', abs(_amount), 'memo', 'Counted lower than the ledger'))
  END;

  RETURN private.write_journal(
    'reconciliation_adjustment',
    format('Reconciliation adjustment: %s', _reason),
    v_lines, _transaction_date, v_branch, _reference
  );
END;
$$;

-- --- Opening balance -------------------------------------------------------
-- Sets a real account's cut-over balance from a physical count or a bank
-- statement, with the contra in LEGACY-UNCLASSIFIED so the historical funding
-- gap stays visible rather than being absorbed silently.
CREATE OR REPLACE FUNCTION public.post_opening_balance(
  _account_id TEXT, _amount NUMERIC, _as_at DATE, _note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE v_branch TEXT; v_name TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may set an opening balance' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'An opening balance must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM private.assert_postable_account(_account_id);

  IF EXISTS (SELECT 1 FROM public.financial_transactions t
              JOIN public.financial_transaction_lines l ON l.transaction_id = t.id
             WHERE t.entry_type = 'opening_balance' AND l.account_id = _account_id
               AND t.status <> 'reversed') THEN
    RAISE EXCEPTION 'This account already has an opening balance — correct it with a reconciliation adjustment'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT branch_id, account_name INTO v_branch, v_name FROM public.financial_accounts WHERE id = _account_id;

  UPDATE public.financial_accounts
     SET opening_balance_date = _as_at
   WHERE id = _account_id AND opening_balance_date IS NULL;

  RETURN private.write_journal(
    'opening_balance',
    COALESCE(_note, format('Cut-over opening balance for %s', v_name)),
    jsonb_build_array(
      jsonb_build_object('account_id',   _account_id,           'direction', 'debit',  'amount', _amount, 'memo', 'Counted balance at cut-over'),
      jsonb_build_object('account_code', 'LEGACY-UNCLASSIFIED', 'direction', 'credit', 'amount', _amount, 'memo', 'Released from unclassified legacy funds')
    ),
    _as_at, v_branch, 'CUTOVER'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants. `authenticated` may call these; each re-checks the caller's role.
-- `anon` may call none of them.
-- ---------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('post_capital_injection','post_capital_withdrawal','post_disbursement',
                         'post_repayment','post_member_fee','post_expense','post_internal_transfer',
                         'post_security_refund','post_writeoff','reverse_financial_transaction',
                         'post_reconciliation_adjustment','post_opening_balance')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
