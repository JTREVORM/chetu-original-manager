-- ===========================================================================
-- CHETU MICROFINANCE — ledger health and reconciliation
-- ===========================================================================
-- Two things live here.
--
-- 1. `v_ledger_health`: the standing check that the failure mode this
--    programme was built to end has not returned. Every row it reports is a
--    financial fact the ledger has lost track of — a disbursement with no
--    journal, a journal that does not balance, a receipt whose split does not
--    sum. It should always be empty.
--
-- 2. The reconciliation workflow: the controlled way to move an account from
--    what the ledger calculates to what was physically counted, recording who
--    counted it, when, and why the difference existed.
-- ===========================================================================

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
  -- The original failure: a loan disbursed with no financial entry behind it.
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
  SELECT 'allocation_mismatch', r.id, r.receipt_number,
         format('Allocation %s does not sum to amount paid %s',
                r.principal_portion + r.interest_portion + r.penalty_portion + r.fee_portion,
                r.amount_paid)
    FROM public.loan_repayments r
   WHERE round(r.principal_portion + r.interest_portion + r.penalty_portion + r.fee_portion, 2)
         <> round(r.amount_paid, 2)

  UNION ALL
  -- The loan book and the ledger are independent records of the same fact.
  -- If they disagree, one of them is wrong and someone needs to know.
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

-- ===========================================================================
-- Reconciliation
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.account_reconciliations (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  account_id         TEXT NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  reconciled_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  system_balance     NUMERIC(14,2) NOT NULL,
  actual_balance     NUMERIC(14,2) NOT NULL,
  difference         NUMERIC(14,2) NOT NULL,
  statement_reference TEXT,
  notes              TEXT,
  adjustment_reason  TEXT,
  adjustment_tx_id   TEXT REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'Unresolved',
  reconciled_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- clock_timestamp(), not now(): several counts recorded in one
  -- transaction must still order deterministically.
  reconciled_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  approved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT account_reconciliations_status_check CHECK (status IN ('Unresolved', 'Adjusted', 'Accepted')),
  CONSTRAINT account_reconciliations_difference_check CHECK (difference = actual_balance - system_balance)
);

COMMENT ON TABLE public.account_reconciliations IS
  'Each time an account is counted: what the ledger said, what was actually there, the difference, and how it was resolved.';

CREATE INDEX IF NOT EXISTS idx_reconciliations_account ON public.account_reconciliations(account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_date    ON public.account_reconciliations(reconciled_on);

ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliations read"  ON public.account_reconciliations;
DROP POLICY IF EXISTS "reconciliations write" ON public.account_reconciliations;

CREATE POLICY "reconciliations read" ON public.account_reconciliations
  FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor() OR private.can_see_account(account_id));

-- Written only by the function below, which runs as definer.
GRANT SELECT ON public.account_reconciliations TO authenticated;
GRANT ALL    ON public.account_reconciliations TO service_role;

-- ---------------------------------------------------------------------------
-- Record a count. Optionally post the adjustment that closes the difference.
--
-- This is the controlled workflow for cut-over: management counts the till and
-- reads the bank statement, and the residual against the legacy account is
-- posted once, with a reason and a name against it, permanently visible.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_account_reconciliation(
  _account_id      TEXT,
  _actual_balance  NUMERIC,
  _reconciled_on   DATE    DEFAULT CURRENT_DATE,
  _statement_ref   TEXT    DEFAULT NULL,
  _notes           TEXT    DEFAULT NULL,
  _post_adjustment BOOLEAN DEFAULT FALSE,
  _adjustment_reason TEXT  DEFAULT NULL
)
RETURNS public.account_reconciliations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_system NUMERIC(14,2);
  v_diff   NUMERIC(14,2);
  v_tx     TEXT;
  v_row    public.account_reconciliations%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.can_post_financial() THEN
    RAISE EXCEPTION 'You are not permitted to reconcile accounts' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT private.can_see_account(_account_id) THEN
    RAISE EXCEPTION 'That account is not in your branch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _actual_balance IS NULL OR _actual_balance < 0 THEN
    RAISE EXCEPTION 'A counted balance is required and cannot be negative' USING ERRCODE = 'check_violation';
  END IF;

  SELECT current_balance INTO v_system FROM public.v_account_balances WHERE account_id = _account_id;
  IF v_system IS NULL THEN
    RAISE EXCEPTION 'Financial account % does not exist', _account_id USING ERRCODE = 'check_violation';
  END IF;

  v_diff := _actual_balance - v_system;

  -- Posting the adjustment is the Administrator's call, and it needs a reason.
  IF _post_adjustment AND v_diff <> 0 THEN
    IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator may post a reconciliation adjustment'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _adjustment_reason IS NULL OR btrim(_adjustment_reason) = '' THEN
      RAISE EXCEPTION 'Explain the difference before adjusting for it' USING ERRCODE = 'check_violation';
    END IF;
    v_tx := public.post_reconciliation_adjustment(
      _account_id, v_diff, _adjustment_reason, _reconciled_on, _statement_ref);
  END IF;

  INSERT INTO public.account_reconciliations (
    account_id, reconciled_on, system_balance, actual_balance, difference,
    statement_reference, notes, adjustment_reason, adjustment_tx_id, status,
    reconciled_by, approved_by, approved_at
  ) VALUES (
    _account_id, _reconciled_on, v_system, _actual_balance, v_diff,
    _statement_ref, _notes, _adjustment_reason, v_tx,
    CASE WHEN v_diff = 0 THEN 'Accepted' WHEN v_tx IS NOT NULL THEN 'Adjusted' ELSE 'Unresolved' END,
    auth.uid(),
    CASE WHEN v_tx IS NOT NULL THEN auth.uid() END,
    CASE WHEN v_tx IS NOT NULL THEN now() END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_reconciliation(TEXT, NUMERIC, DATE, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_account_reconciliation(TEXT, NUMERIC, DATE, TEXT, TEXT, BOOLEAN, TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation report: latest count per account beside the live balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_account_reconciliation
WITH (security_invoker = on) AS
SELECT
  a.account_id, a.account_code, a.account_name, a.account_type,
  a.branch_id, a.branch_name, a.current_balance AS system_balance,
  r.actual_balance, r.difference, r.reconciled_on, r.reconciled_at,
  r.statement_reference, r.notes, r.adjustment_reason, r.adjustment_tx_id,
  r.status AS reconciliation_status,
  p.full_name AS reconciled_by_name,
  CASE
    WHEN r.id IS NULL THEN 'Never reconciled'
    WHEN r.status = 'Unresolved' AND r.difference <> 0 THEN 'Unresolved difference'
    ELSE r.status
  END AS state
FROM public.v_account_balances a
LEFT JOIN LATERAL (
  SELECT * FROM public.account_reconciliations ar
   WHERE ar.account_id = a.account_id
   ORDER BY ar.reconciled_on DESC, ar.reconciled_at DESC, ar.created_at DESC LIMIT 1
) r ON TRUE
LEFT JOIN public.profiles p ON p.id = r.reconciled_by
WHERE a.account_class = 'asset_liquid';

GRANT SELECT ON public.v_account_reconciliation TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The cut-over date. Recorded when these migrations are applied to production,
-- so reports can say which figures pre-date the ledger rather than hard-coding
-- a date into a migration that may be applied on a different day.
-- ---------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS financial_cutover_date DATE,
  ADD COLUMN IF NOT EXISTS financial_cutover_completed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.settings.financial_cutover_date IS
  'The date the balanced ledger went live. Journals before it are legacy, with an unclassified cash leg.';
COMMENT ON COLUMN public.settings.financial_cutover_completed IS
  'TRUE once real opening balances have been counted in and the legacy difference reconciled.';

UPDATE public.settings
   SET financial_cutover_date = CURRENT_DATE
 WHERE id = 1 AND financial_cutover_date IS NULL;
