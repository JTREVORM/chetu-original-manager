-- ===========================================================================
-- CHETU MICROFINANCE — backfill historical finance into the ledger
-- ===========================================================================
-- Reconstructs every financial event that can be PROVEN from existing rows,
-- and refuses to guess anything that cannot.
--
-- What is certain, and is carried across exactly:
--   loan amounts, principal, interest, fees, security, payment amounts,
--   dates, references, receipt numbers, users, branches, and the link back
--   to the source row.
--
-- What is NOT knowable, and is therefore not invented:
--   WHERE the cash physically was. Production has never recorded whether a
--   shilling sat in a till, a bank account or a wallet. `payment_method =
--   'Cash'` says the member handed over notes; it does not say where those
--   notes went. So every cash leg of every historical journal points at
--   LEGACY-UNCLASSIFIED, and that account will end up carrying the whole
--   historical funding gap.
--
-- That gap is the honest output of this migration, not a defect. It is
-- resolved once, at cut-over, by `post_opening_balance` against a physical
-- cash count and a bank statement, plus a signed
-- `post_reconciliation_adjustment`. No historical figure is ever rewritten to
-- make a report balance.
--
-- Idempotency: every journal carries (source_table, source_id), which has a
-- unique index. Each block skips rows already posted, so running this twice
-- posts nothing the second time.
-- ===========================================================================

DO $$
DECLARE
  v_legacy        TEXT;
  v_before        INTEGER;
  v_capital       INTEGER := 0;
  v_disbursement  INTEGER := 0;
  v_repayment     INTEGER := 0;
  v_fee           INTEGER := 0;
  v_expense       INTEGER := 0;
  v_row           RECORD;
BEGIN
  SELECT count(*) INTO v_before FROM public.financial_transactions WHERE is_legacy;
  IF v_before > 0 THEN
    RAISE NOTICE 'Legacy backfill: % journal(s) already present — skipping rows already posted', v_before;
  END IF;

  v_legacy := private.account_by_code('LEGACY-UNCLASSIFIED');

  -- -------------------------------------------------------------------------
  -- 1. Capital and any other historical bank_transactions.
  --    Deposits are capital in; withdrawals (none exist today) are capital out.
  -- -------------------------------------------------------------------------
  FOR v_row IN
    SELECT bt.* FROM public.bank_transactions bt
     WHERE NOT EXISTS (
       SELECT 1 FROM public.financial_transactions t
        WHERE t.source_table = 'bank_transactions' AND t.source_id = bt.id)
     ORDER BY bt.created_at
  LOOP
    PERFORM private.write_journal(
      CASE WHEN v_row.transaction_type = 'Deposit' THEN 'capital_injection' ELSE 'capital_withdrawal' END,
      format('[Legacy] %s — %s', v_row.category, v_row.description),
      CASE WHEN v_row.transaction_type = 'Deposit' THEN
        jsonb_build_array(
          jsonb_build_object('account_id', v_legacy, 'direction', 'debit', 'amount', v_row.amount,
                             'memo', 'Funds received (physical location not recorded)'),
          jsonb_build_object('account_code', 'CAPITAL-INTRODUCED', 'direction', 'credit', 'amount', v_row.amount,
                             'memo', v_row.category))
      ELSE
        jsonb_build_array(
          jsonb_build_object('account_code', 'CAPITAL-INTRODUCED', 'direction', 'debit', 'amount', v_row.amount,
                             'memo', v_row.category),
          jsonb_build_object('account_id', v_legacy, 'direction', 'credit', 'amount', v_row.amount,
                             'memo', 'Funds paid out (physical location not recorded)'))
      END,
      v_row.transaction_date, v_row.branch_id, v_row.transaction_number,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'bank_transactions', v_row.id,
      NULL, NULL, 'posted', TRUE, v_row.recorded_by, v_row.created_at, v_row.business_day_id
    );
    v_capital := v_capital + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 2. Loan disbursements.
  --    Dr Loans Receivable (principal); Cr legacy cash (NET actually paid out),
  --    fee income (three accounts) and the refundable security liability.
  --    Every one of those figures is already frozen on the loan row.
  -- -------------------------------------------------------------------------
  FOR v_row IN
    SELECT l.*, c.branch_id AS client_branch, c.full_name,
           COALESCE(l.net_disbursed_amount,
                    l.principal_amount - l.processing_fee_amount - l.crb_fee_amount
                      - l.group_maintenance_fee - l.security_amount) AS net_amount
      FROM public.loans l
      LEFT JOIN public.clients c ON c.id = l.client_id
     WHERE l.disbursed_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_transactions t
          WHERE t.source_table = 'loans' AND t.source_id = l.id)
     ORDER BY l.disbursed_at
  LOOP
    PERFORM private.write_journal(
      'disbursement',
      format('[Legacy] Disbursement of loan %s to %s', v_row.loan_number, COALESCE(v_row.full_name, 'member')),
      jsonb_build_array(
        jsonb_build_object('account_code', 'LOANS-RECEIVABLE',    'direction', 'debit',  'amount', v_row.principal_amount,      'memo', 'Principal owed by member'),
        jsonb_build_object('account_id',   v_legacy,              'direction', 'credit', 'amount', v_row.net_amount,            'memo', 'Net cash to member (source account not recorded)'),
        jsonb_build_object('account_code', 'INC-FEE-PROCESSING',  'direction', 'credit', 'amount', v_row.processing_fee_amount, 'memo', 'Processing fee retained'),
        jsonb_build_object('account_code', 'INC-FEE-CRB',         'direction', 'credit', 'amount', v_row.crb_fee_amount,        'memo', 'CRB fee retained'),
        jsonb_build_object('account_code', 'INC-FEE-GROUP-MAINT', 'direction', 'credit', 'amount', v_row.group_maintenance_fee, 'memo', 'Group maintenance fee retained'),
        jsonb_build_object('account_code', 'SECURITY-HELD',       'direction', 'credit', 'amount', v_row.security_amount,       'memo', 'Refundable security withheld')
      ),
      v_row.disbursed_at::DATE, v_row.client_branch, v_row.loan_number,
      v_row.id, NULL, NULL, NULL, NULL, v_row.client_id,
      'loans', v_row.id,
      NULL, NULL, 'posted', TRUE, v_row.disbursed_by, v_row.disbursed_at, v_row.business_day_id
    );
    v_disbursement := v_disbursement + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 3. Repayments, using the principal/interest split that migration 001500
  --    reconstructed from the instalment schedule and asserted to reconcile.
  -- -------------------------------------------------------------------------
  FOR v_row IN
    SELECT r.*, c.branch_id AS client_branch, l.loan_number
      FROM public.loan_repayments r
      LEFT JOIN public.clients c ON c.id = r.client_id
      LEFT JOIN public.loans l   ON l.id = r.loan_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.financial_transactions t
        WHERE t.source_table = 'loan_repayments' AND t.source_id = r.id)
     ORDER BY r.created_at
  LOOP
    PERFORM private.write_journal(
      'repayment',
      format('[Legacy] Repayment on loan %s, receipt %s',
             COALESCE(v_row.loan_number, v_row.loan_id), v_row.receipt_number),
      jsonb_build_array(
        jsonb_build_object('account_id',   v_legacy,           'direction', 'debit',  'amount', v_row.amount_paid,       'memo', 'Cash received (destination account not recorded)'),
        jsonb_build_object('account_code', 'LOANS-RECEIVABLE', 'direction', 'credit', 'amount', v_row.principal_portion, 'memo', 'Principal repaid'),
        jsonb_build_object('account_code', 'INC-INTEREST',     'direction', 'credit', 'amount', v_row.interest_portion,  'memo', 'Interest earned'),
        jsonb_build_object('account_code', 'INC-PENALTY',      'direction', 'credit', 'amount', v_row.penalty_portion,   'memo', 'Penalty collected')
      ),
      v_row.payment_date, v_row.client_branch, v_row.receipt_number,
      v_row.loan_id, v_row.id, NULL, NULL, NULL, v_row.client_id,
      'loan_repayments', v_row.id,
      NULL, NULL, 'posted', TRUE, v_row.recorded_by, v_row.created_at, v_row.business_day_id
    );
    v_repayment := v_repayment + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 4. Member admission and passbook fees.
  -- -------------------------------------------------------------------------
  FOR v_row IN
    SELECT f.* FROM public.member_fees f
     WHERE NOT EXISTS (
       SELECT 1 FROM public.financial_transactions t
        WHERE t.source_table = 'member_fees' AND t.source_id = f.id)
     ORDER BY f.created_at
  LOOP
    PERFORM private.write_journal(
      'fee_collection',
      format('[Legacy] Member fees, receipt %s', COALESCE(v_row.receipt_number, v_row.id)),
      jsonb_build_array(
        jsonb_build_object('account_id',   v_legacy,            'direction', 'debit',  'amount', v_row.total_amount,  'memo', 'Fees received (destination account not recorded)'),
        jsonb_build_object('account_code', 'INC-FEE-ADMISSION', 'direction', 'credit', 'amount', v_row.admission_fee, 'memo', 'Admission fee'),
        jsonb_build_object('account_code', 'INC-FEE-PASSBOOK',  'direction', 'credit', 'amount', v_row.passbook_fee,  'memo', 'Passbook fee'),
        jsonb_build_object('account_code', 'INC-FEE-CRB',       'direction', 'credit', 'amount', v_row.crb_fee,       'memo', 'CRB fee')
      ),
      v_row.created_at::DATE, v_row.branch_id, v_row.receipt_number,
      NULL, NULL, NULL, v_row.id, NULL, v_row.client_id,
      'member_fees', v_row.id,
      NULL, NULL, 'posted', TRUE, v_row.collected_by, v_row.created_at, NULL
    );
    v_fee := v_fee + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 5. Expenses. None exist in production today; the block is here so that any
  --    recorded between writing this and applying it is not left behind.
  -- -------------------------------------------------------------------------
  FOR v_row IN
    SELECT e.* FROM public.expenses e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.financial_transactions t
        WHERE t.source_table = 'expenses' AND t.source_id = e.id)
     ORDER BY e.created_at
  LOOP
    PERFORM private.write_journal(
      'expense',
      format('[Legacy] %s — %s', v_row.category, v_row.description),
      jsonb_build_array(
        jsonb_build_object(
          'account_code',
          CASE WHEN EXISTS (
            SELECT 1 FROM public.financial_accounts
             WHERE account_code = 'EXP-' || upper(regexp_replace(v_row.category, '[^a-zA-Z0-9]+', '-', 'g')))
          THEN 'EXP-' || upper(regexp_replace(v_row.category, '[^a-zA-Z0-9]+', '-', 'g'))
          ELSE 'EXP-OTHER' END,
          'direction', 'debit', 'amount', v_row.amount, 'memo', v_row.description),
        jsonb_build_object('account_id', v_legacy, 'direction', 'credit', 'amount', v_row.amount,
                           'memo', format('Paid by %s (source account not recorded)', v_row.payment_method))
      ),
      v_row.expense_date, v_row.branch_id, v_row.expense_number,
      NULL, NULL, v_row.id, NULL, NULL, NULL,
      'expenses', v_row.id,
      NULL, NULL, 'posted', TRUE, v_row.recorded_by, v_row.created_at, v_row.business_day_id
    );
    v_expense := v_expense + 1;
  END LOOP;

  RAISE NOTICE 'Legacy backfill posted: % capital, % disbursements, % repayments, % member fees, % expenses',
    v_capital, v_disbursement, v_repayment, v_fee, v_expense;
END $$;

-- ===========================================================================
-- Validation. The migration fails rather than leaving a wrong ledger behind.
-- ===========================================================================
DO $$
DECLARE
  v_unbalanced   INTEGER;
  v_missing_disb INTEGER;
  v_missing_rep  INTEGER;
  v_missing_fee  INTEGER;
  v_recv         NUMERIC(14,2);
  v_expected     NUMERIC(14,2);
  v_legacy_bal   NUMERIC(14,2);
  v_cap          NUMERIC(14,2);
  v_coll         NUMERIC(14,2);
  v_fees         NUMERIC(14,2);
  v_net          NUMERIC(14,2);
BEGIN
  -- 1. Every journal balances.
  SELECT count(*) INTO v_unbalanced FROM (
    SELECT transaction_id FROM public.financial_transaction_lines
     GROUP BY transaction_id HAVING sum(signed_amount) <> 0) x;
  IF v_unbalanced > 0 THEN
    RAISE EXCEPTION 'Backfill validation: % unbalanced journal(s)', v_unbalanced;
  END IF;

  -- 2. Nothing left behind.
  SELECT count(*) INTO v_missing_disb FROM public.loans l
   WHERE l.disbursed_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.source_table = 'loans' AND t.source_id = l.id);
  SELECT count(*) INTO v_missing_rep FROM public.loan_repayments r
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.source_table = 'loan_repayments' AND t.source_id = r.id);
  SELECT count(*) INTO v_missing_fee FROM public.member_fees f
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.source_table = 'member_fees' AND t.source_id = f.id);
  IF v_missing_disb + v_missing_rep + v_missing_fee > 0 THEN
    RAISE EXCEPTION 'Backfill validation: % disbursement(s), % repayment(s), % fee record(s) were not posted',
      v_missing_disb, v_missing_rep, v_missing_fee;
  END IF;

  -- 3. Loans Receivable equals principal disbursed minus principal collected.
  SELECT current_balance INTO v_recv FROM public.v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT COALESCE(sum(principal_amount), 0) INTO v_expected FROM public.loans WHERE disbursed_at IS NOT NULL;
  v_expected := v_expected - COALESCE((SELECT sum(principal_portion) FROM public.loan_repayments), 0);
  IF round(COALESCE(v_recv, 0), 2) <> round(v_expected, 2) THEN
    RAISE EXCEPTION 'Backfill validation: Loans Receivable is % but principal disbursed less collected is %',
      v_recv, v_expected;
  END IF;

  -- 4. The legacy account carries exactly the historical funding gap:
  --    capital in + collections in + fees in - net cash out.
  SELECT current_balance INTO v_legacy_bal FROM public.v_account_balances WHERE account_code = 'LEGACY-UNCLASSIFIED';
  SELECT COALESCE(sum(CASE WHEN transaction_type = 'Deposit' THEN amount ELSE -amount END), 0)
    INTO v_cap FROM public.bank_transactions;
  SELECT COALESCE(sum(amount_paid), 0)   INTO v_coll FROM public.loan_repayments;
  SELECT COALESCE(sum(total_amount), 0)  INTO v_fees FROM public.member_fees;
  SELECT COALESCE(sum(COALESCE(net_disbursed_amount,
                       principal_amount - processing_fee_amount - crb_fee_amount
                         - group_maintenance_fee - security_amount)), 0)
    INTO v_net FROM public.loans WHERE disbursed_at IS NOT NULL;

  IF round(COALESCE(v_legacy_bal, 0), 2)
     <> round(v_cap + v_coll + v_fees - v_net - COALESCE((SELECT sum(amount) FROM public.expenses), 0), 2) THEN
    RAISE EXCEPTION 'Backfill validation: legacy account is % but the reconstructed gap is %',
      v_legacy_bal, v_cap + v_coll + v_fees - v_net - COALESCE((SELECT sum(amount) FROM public.expenses), 0);
  END IF;

  RAISE NOTICE 'Backfill validated. Loans Receivable %, Legacy / Unclassified % (this is the historical funding gap, to be resolved at cut-over).',
    v_recv, v_legacy_bal;
END $$;
