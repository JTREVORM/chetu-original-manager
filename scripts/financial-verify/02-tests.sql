-- ===========================================================================
-- Chetu financial ledger — verification suite
-- ===========================================================================
-- Runs against a scratch database seeded to production's shape and migrated.
-- Every check records PASS or FAIL in `_verify_results`; the runner exits
-- non-zero if anything failed.
--
-- The workflows exercised are the ones that move money, plus the failure modes
-- the audit found: a posting that silently does nothing, a disbursement
-- without a journal, a reversal that invents a deposit, and a permission model
-- that disagrees with itself.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS _verify_results (
  seq SERIAL PRIMARY KEY, area TEXT, name TEXT, passed BOOLEAN, detail TEXT
);
TRUNCATE _verify_results;

CREATE OR REPLACE FUNCTION _check(_area TEXT, _name TEXT, _passed BOOLEAN, _detail TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO _verify_results(area, name, passed, detail) VALUES (_area, _name, _passed, _detail);
$$;

-- Seed the claim at session level before anything reads it. A custom GUC that
-- has only ever been SET LOCAL reverts to '' — not NULL — once the transaction
-- ends, and `auth.uid()` then tries to parse '' as JSON. PostgREST always
-- sends well-formed claims, so this is a harness artifact, not a product bug.
SELECT set_config('request.jwt.claims', '{}', FALSE);

-- Impersonate a signed-in user, the way PostgREST does.
CREATE OR REPLACE FUNCTION _as(_uid TEXT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
           CASE WHEN _uid IS NULL THEN '{}'
                ELSE json_build_object('sub', _uid, 'role', 'authenticated')::text END, TRUE);
$$;

-- Asserts that `_sql` fails, and that the message mentions `_expect`.
CREATE OR REPLACE FUNCTION _check_raises(_area TEXT, _name TEXT, _sql TEXT, _expect TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_msg TEXT;
BEGIN
  BEGIN
    EXECUTE _sql;
    PERFORM _check(_area, _name, FALSE, 'expected an error, none raised');
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF _expect IS NULL OR position(lower(_expect) in lower(v_msg)) > 0 THEN
      PERFORM _check(_area, _name, TRUE, left(v_msg, 90));
    ELSE
      PERFORM _check(_area, _name, FALSE, format('wrong error: %s', left(v_msg, 90)));
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Journal balance
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_bad INT; v_cash TEXT;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    SELECT transaction_id FROM financial_transaction_lines
     GROUP BY transaction_id HAVING sum(signed_amount) <> 0) x;
  PERFORM _check('journal balance', 'every backfilled journal balances', v_bad = 0,
                 format('%s unbalanced', v_bad));

  SELECT count(*) INTO v_bad FROM financial_transactions t
   WHERE NOT EXISTS (SELECT 1 FROM financial_transaction_lines WHERE transaction_id = t.id);
  PERFORM _check('journal balance', 'no journal without lines', v_bad = 0, format('%s empty', v_bad));

  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  PERFORM _check('journal balance', 'ledger health view is empty',
                 NOT EXISTS (SELECT 1 FROM v_ledger_health),
                 (SELECT string_agg(DISTINCT check_name, ', ') FROM v_ledger_health));
END $$;

-- An unbalanced journal must be impossible to commit.
DO $$
DECLARE v_tx TEXT; v_cash TEXT;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  BEGIN
    INSERT INTO financial_transactions (entry_type, description, transaction_date)
    VALUES ('other_income', 'deliberately unbalanced', CURRENT_DATE) RETURNING id INTO v_tx;
    INSERT INTO financial_transaction_lines (transaction_id, line_no, account_id, direction, amount)
    VALUES (v_tx, 1, v_cash, 'debit', 5000),
           (v_tx, 2, (SELECT id FROM financial_accounts WHERE account_code = 'INC-OTHER'), 'credit', 4000);
    SET CONSTRAINTS ALL IMMEDIATE;   -- fire the deferred check here, not at commit
    PERFORM _check('journal balance', 'unbalanced journal is rejected', FALSE, 'it committed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('journal balance', 'unbalanced journal is rejected', TRUE, left(SQLERRM, 80));
  END;
END $$;

DO $$
DECLARE v_tx TEXT; v_cash TEXT;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  BEGIN
    INSERT INTO financial_transactions (entry_type, description, transaction_date)
    VALUES ('other_income', 'single-sided', CURRENT_DATE) RETURNING id INTO v_tx;
    INSERT INTO financial_transaction_lines (transaction_id, line_no, account_id, direction, amount)
    VALUES (v_tx, 1, v_cash, 'debit', 5000);
    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM _check('journal balance', 'single-sided journal is rejected', FALSE, 'it committed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('journal balance', 'single-sided journal is rejected', TRUE, left(SQLERRM, 80));
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Capital injection  (workflows 1 and 2)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bank TEXT; v_cash TEXT; v_tx TEXT;
  v_before NUMERIC; v_after NUMERIC; v_cap_before NUMERIC; v_cap_after NUMERIC;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_bank;
  SELECT natural_balance INTO v_cap_before FROM v_account_balances WHERE account_code = 'CAPITAL-INTRODUCED';
  v_tx := post_capital_injection(v_bank, 10000000, CURRENT_DATE, 'CAP-001', 'Owner funding into bank');
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_bank;
  SELECT natural_balance INTO v_cap_after FROM v_account_balances WHERE account_code = 'CAPITAL-INTRODUCED';

  PERFORM _check('capital', '1. capital into bank raises bank balance', v_after - v_before = 10000000,
                 format('%s -> %s', v_before, v_after));
  PERFORM _check('capital', '1. capital into bank credits equity', v_cap_after - v_cap_before = 10000000, NULL);

  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_cash;
  PERFORM post_capital_injection(v_cash, 500000, CURRENT_DATE, 'CAP-002', 'Owner funding into cash');
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_cash;
  PERFORM _check('capital', '2. capital into cash raises cash balance', v_after - v_before = 500000, NULL);

  PERFORM _check('capital', 'capital is not counted as income',
    (SELECT COALESCE(sum(income_amount), 0) FROM v_income_statement
      WHERE account_code = 'CAPITAL-INTRODUCED') = 0, NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Internal transfers  (workflows 3, 4, 5)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bank TEXT; v_cash TEXT; v_wallet TEXT;
  v_liq_before NUMERIC; v_liq_after NUMERIC;
  v_inc_before NUMERIC; v_inc_after NUMERIC;
  v_b NUMERIC; v_c NUMERIC;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  -- A mobile-money account is created on demand, the way Chetu would when it
  -- actually starts using one. Nothing is seeded for a provider it may not use.
  INSERT INTO financial_accounts (account_code, account_name, account_type, account_class, branch_id)
  VALUES ('MM-TEST', 'Mobile Money Float', 'mobile_money', 'asset_liquid', 'BR-TEST-001')
  ON CONFLICT (account_code) DO NOTHING;
  SELECT id INTO v_wallet FROM financial_accounts WHERE account_code = 'MM-TEST';

  SELECT total_available_liquidity INTO v_liq_before FROM v_money_position;
  SELECT total_income INTO v_inc_before FROM v_money_position;

  SELECT current_balance INTO v_b FROM v_account_balances WHERE account_id = v_bank;
  PERFORM post_internal_transfer(v_bank, v_cash, 1000000, CURRENT_DATE, 'TRF-001', 'Bank to cash withdrawal');
  SELECT current_balance INTO v_c FROM v_account_balances WHERE account_id = v_bank;
  PERFORM _check('transfers', '3. bank to cash reduces bank', v_b - v_c = 1000000, NULL);

  PERFORM post_internal_transfer(v_cash, v_bank, 250000, CURRENT_DATE, 'TRF-002', 'Cash to bank deposit');
  PERFORM post_internal_transfer(v_bank, v_wallet, 300000, CURRENT_DATE, 'TRF-003', 'Bank to mobile money');

  SELECT total_available_liquidity INTO v_liq_after FROM v_money_position;
  SELECT total_income INTO v_inc_after FROM v_money_position;

  PERFORM _check('transfers', '4/5. transfers leave total liquidity unchanged',
                 v_liq_after = v_liq_before, format('%s -> %s', v_liq_before, v_liq_after));
  PERFORM _check('transfers', 'transfers create no income', v_inc_after = v_inc_before,
                 format('%s -> %s', v_inc_before, v_inc_after));
  PERFORM _check('transfers', 'transfers create no expense',
    (SELECT COALESCE(sum(expense_amount), 0) FROM v_income_statement s
      JOIN financial_transactions t ON t.transaction_date = s.transaction_date
     WHERE t.entry_type = 'internal_transfer') = 0, NULL);
  PERFORM _check('transfers', 'cash flow flags transfers separately',
    (SELECT count(*) FROM v_cash_flow WHERE is_internal_transfer) = 6, NULL);
  PERFORM _check('transfers', 'transfers net to nil across accounts',
    (SELECT COALESCE(sum(cash_movement), 0) FROM v_cash_flow WHERE is_internal_transfer) = 0, NULL);
END $$;


-- ---------------------------------------------------------------------------
-- 4. Disbursement  (workflows 6 and 7)
--
-- The original failure: a loan disbursed with the ledger entry silently lost.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bank TEXT; v_cash TEXT; v_loan TEXT; v_tx TEXT;
  v_bank_before NUMERIC; v_bank_after NUMERIC;
  v_recv_before NUMERIC; v_recv_after NUMERIC;
  v_sec_before NUMERIC; v_sec_after NUMERIC;
  v_fee NUMERIC;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  -- CM-LN-2026-0016 is the approved-but-undisbursed loan, exactly as in production.
  v_loan := 'LN-TEST-016';
  UPDATE loans SET status = 'Active', disbursed_at = now(),
                   disbursed_by = '33333333-3333-3333-3333-333333333333'
   WHERE id = v_loan;

  SELECT current_balance INTO v_bank_before FROM v_account_balances WHERE account_id = v_bank;
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_sec_before  FROM v_account_balances WHERE account_code = 'SECURITY-HELD';

  v_tx := post_disbursement(v_loan, v_bank);

  SELECT current_balance INTO v_bank_after FROM v_account_balances WHERE account_id = v_bank;
  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_sec_after  FROM v_account_balances WHERE account_code = 'SECURITY-HELD';

  -- 500,000 principal: 20,000 processing + 5,000 CRB + 2,000 group + 75,000
  -- security retained, so 398,000 actually leaves the bank.
  PERFORM _check('disbursement', '6. bank falls by NET disbursed, not principal',
                 v_bank_before - v_bank_after = 398000,
                 format('fell by %s, expected 398000', v_bank_before - v_bank_after));
  PERFORM _check('disbursement', '6. loans receivable rises by full principal',
                 v_recv_after - v_recv_before = 500000, NULL);
  PERFORM _check('disbursement', '6. security liability rises by 15%',
                 v_sec_after - v_sec_before = 75000, NULL);

  SELECT COALESCE(sum(l.amount), 0) INTO v_fee FROM financial_transaction_lines l
    JOIN financial_accounts a ON a.id = l.account_id
   WHERE l.transaction_id = v_tx AND a.account_class = 'income';
  PERFORM _check('disbursement', '6. fee income recognised at disbursement', v_fee = 27000,
                 format('%s, expected 27000', v_fee));

  PERFORM _check('disbursement', '6. journal balances', 
    (SELECT sum(signed_amount) FROM financial_transaction_lines WHERE transaction_id = v_tx) = 0, NULL);
  PERFORM _check('disbursement', '6. journal is linked to the loan',
    (SELECT loan_id FROM financial_transactions WHERE id = v_tx) = v_loan, NULL);
  PERFORM _check('disbursement', 'the loan no longer appears as unposted',
    NOT EXISTS (SELECT 1 FROM v_ledger_health
                 WHERE check_name = 'disbursement_without_journal' AND subject_id = v_loan), NULL);
END $$;

-- Disbursement funded from cash (workflow 7).
DO $$
DECLARE v_cash TEXT; v_loan TEXT; v_before NUMERIC; v_after NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
    interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
    weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
    security_amount, security_balance, net_disbursed_amount, first_repayment_date,
    final_due_date, outstanding_balance, status, disbursed_at, disbursed_by)
  VALUES ('LN-TEST-CASH', 'CM-LN-2026-9001', 'CLI-TEST-020', 'PRD-TEST-001', 200000, 20.00,
    'Flat Rate', 16, 40000, 240000, 15000, 8000, 2000, 2000, 30000, 30000, 158000,
    CURRENT_DATE + 7, CURRENT_DATE + 112, 240000, 'Active', now(),
    '33333333-3333-3333-3333-333333333333')
  ON CONFLICT (id) DO NOTHING;
  v_loan := 'LN-TEST-CASH';

  INSERT INTO loan_repayment_schedule (id, loan_id, week_number, due_date, installment_amount,
    principal_portion, interest_portion, paid_amount, remaining_balance, status)
  SELECT format('SCH-CASH-%s', lpad(w::text, 2, '0')), 'LN-TEST-CASH', w,
         CURRENT_DATE + w * 7, 15000, 12500, 2500, 0, 15000, 'Pending'
    FROM generate_series(1, 16) w
  ON CONFLICT (id) DO NOTHING;

  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_cash;
  PERFORM post_disbursement(v_loan, v_cash);
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_cash;

  PERFORM _check('disbursement', '7. disbursement funded from cash reduces cash by net',
                 v_before - v_after = 158000, format('fell by %s', v_before - v_after));
END $$;

-- Duplicate posting prevention.
DO $$
BEGIN
  PERFORM _check_raises('duplicate posting', 'a loan cannot be disbursed to the ledger twice',
    $q$ SELECT post_disbursement('LN-TEST-016',
          (SELECT id FROM financial_accounts WHERE account_code = 'BANK-MAIN')) $q$,
    'duplicate key');
END $$;

-- A control account can never be a funding source.
DO $$
BEGIN
  PERFORM _check_raises('disbursement', 'a control account cannot fund a disbursement',
    $q$ SELECT post_disbursement('LN-TEST-014',
          (SELECT id FROM financial_accounts WHERE account_code = 'LOANS-RECEIVABLE')) $q$,
    'control account');
  PERFORM _check_raises('disbursement', 'a missing funding account is refused',
    $q$ SELECT post_disbursement('LN-TEST-014', NULL) $q$,
    'must be selected');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Repayments and allocation  (workflows 8, 9, 11, 12)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cash TEXT; v_rep TEXT; v_tx TEXT; v_sched TEXT;
  v_cash_before NUMERIC; v_cash_after NUMERIC;
  v_recv_before NUMERIC; v_recv_after NUMERIC;
  v_int_before NUMERIC; v_int_after NUMERIC;
  v_prin NUMERIC; v_intr NUMERIC;
  v_inst NUMERIC; v_sched_prin NUMERIC; v_sched_intr NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  -- A full instalment on loan 14. The expected split is read off the
  -- instalment rather than written in, because production rounds to whole
  -- hundreds: week 1 of a 37,500 instalment is 31,200 + 6,300, not an even
  -- 31,250 + 6,250. Asserting the rule keeps this test honest whatever the
  -- rounding does.
  SELECT id INTO v_sched FROM loan_repayment_schedule
   WHERE loan_id = 'LN-TEST-014' ORDER BY week_number LIMIT 1;
  SELECT installment_amount, principal_portion, interest_portion
    INTO v_inst, v_sched_prin, v_sched_intr
    FROM loan_repayment_schedule WHERE id = v_sched;

  INSERT INTO loan_repayments (id, loan_id, schedule_id, client_id, amount_paid,
    payment_date, payment_method, collection_type, recorded_by, repayment_number, receipt_number)
  VALUES ('RP-TEST-FULL', 'LN-TEST-014', v_sched, 'CLI-TEST-014', 37500, CURRENT_DATE,
          'Cash', 'Regular', '33333333-3333-3333-3333-333333333333', 'CM-RP-9001', 'CM-REC-9001');

  SELECT principal_portion, interest_portion INTO v_prin, v_intr
    FROM loan_repayments WHERE id = 'RP-TEST-FULL';
  PERFORM _check('allocation', '11. principal/interest split on a full instalment',
                 v_prin = v_sched_prin AND v_intr = v_sched_intr,
                 format('%s / %s (instalment holds %s / %s)',
                        v_prin, v_intr, v_sched_prin, v_sched_intr));
  PERFORM _check('allocation', '11. the split sums back to the amount paid',
                 v_prin + v_intr = 37500, NULL);

  SELECT current_balance INTO v_cash_before FROM v_account_balances WHERE account_id = v_cash;
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_int_before  FROM v_account_balances WHERE account_code = 'INC-INTEREST';

  v_tx := post_repayment('RP-TEST-FULL', v_cash);

  SELECT current_balance INTO v_cash_after FROM v_account_balances WHERE account_id = v_cash;
  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_int_after  FROM v_account_balances WHERE account_code = 'INC-INTEREST';

  PERFORM _check('repayment', '8. cash rises by the full amount received',
                 v_cash_after - v_cash_before = 37500, NULL);
  PERFORM _check('repayment', '8. loans receivable falls by the principal portion only',
                 v_recv_before - v_recv_after = v_sched_prin,
                 format('fell by %s, principal portion is %s', v_recv_before - v_recv_after, v_sched_prin));
  PERFORM _check('repayment', '8. interest income rises by the interest portion',
                 v_int_after - v_int_before = v_sched_intr,
                 format('rose by %s, interest portion is %s', v_int_after - v_int_before, v_sched_intr));
  PERFORM _check('repayment', '8. returned principal is not income',
                 v_int_after - v_int_before <> 37500, NULL);
END $$;

-- Partial payment (workflow 9).
DO $$
DECLARE v_cash TEXT; v_sched TEXT; v_prin NUMERIC; v_intr NUMERIC; v_tx TEXT;
        v_inst NUMERIC; v_sched_prin NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT id INTO v_sched FROM loan_repayment_schedule
   WHERE loan_id = 'LN-TEST-015' ORDER BY week_number LIMIT 1;
  SELECT installment_amount, principal_portion INTO v_inst, v_sched_prin
    FROM loan_repayment_schedule WHERE id = v_sched;

  INSERT INTO loan_repayments (id, loan_id, schedule_id, client_id, amount_paid,
    payment_date, payment_method, collection_type, recorded_by, repayment_number, receipt_number)
  VALUES ('RP-TEST-PART', 'LN-TEST-015', v_sched, 'CLI-TEST-015', 20000, CURRENT_DATE,
          'Cash', 'Regular', '33333333-3333-3333-3333-333333333333', 'CM-RP-9002', 'CM-REC-9002');

  SELECT principal_portion, interest_portion INTO v_prin, v_intr
    FROM loan_repayments WHERE id = 'RP-TEST-PART';
  -- A part payment splits in the instalment's own ratio, whatever it is.
  PERFORM _check('allocation', '9. a partial payment splits pro rata',
                 v_prin = round(20000 * v_sched_prin / v_inst, 2) AND v_prin + v_intr = 20000,
                 format('%s / %s (instalment %s holds %s principal)',
                        v_prin, v_intr, v_inst, v_sched_prin));

  v_tx := post_repayment('RP-TEST-PART', v_cash);
  PERFORM _check('repayment', '9. partial repayment journal balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines WHERE transaction_id = v_tx) = 0, NULL);
END $$;

-- Overdue collection (workflow 10) and a payment carrying a penalty (12).
DO $$
DECLARE
  v_cash TEXT; v_sched TEXT; v_tx TEXT; v_dpd INT; v_bucket TEXT;
  v_pen_before NUMERIC; v_pen_after NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  -- Age loan 17 so it has a genuinely overdue instalment.
  UPDATE loan_repayment_schedule SET due_date = CURRENT_DATE - 45
   WHERE loan_id = 'LN-TEST-017' AND week_number = 1;
  UPDATE loan_repayment_schedule SET due_date = CURRENT_DATE - 38
   WHERE loan_id = 'LN-TEST-017' AND week_number = 2;

  SELECT days_past_due, par_bucket INTO v_dpd, v_bucket
    FROM v_loan_portfolio WHERE loan_id = 'LN-TEST-017';
  PERFORM _check('overdue', '10. an unpaid instalment ages into a PAR bucket',
                 v_dpd >= 45 AND v_bucket = '31-60', format('dpd %s, bucket %s', v_dpd, v_bucket));
  PERFORM _check('overdue', '10. overdue principal and interest are separated',
    (SELECT overdue_principal > 0 AND overdue_interest > 0 FROM v_loan_portfolio
      WHERE loan_id = 'LN-TEST-017'), NULL);

  SELECT id INTO v_sched FROM loan_repayment_schedule
   WHERE loan_id = 'LN-TEST-017' AND week_number = 1;

  -- A collection that clears the arrear and carries a penalty. Penalties are
  -- zero throughout production; this proves the architecture supports one when
  -- the business rules enable it, without fabricating any history.
  INSERT INTO loan_repayments (id, loan_id, schedule_id, client_id, amount_paid,
    principal_portion, interest_portion, penalty_portion,
    payment_date, payment_method, collection_type, recorded_by, repayment_number, receipt_number)
  VALUES ('RP-TEST-OD', 'LN-TEST-017', v_sched, 'CLI-TEST-017', 27500,
          18750, 3750, 5000, CURRENT_DATE, 'Cash', 'Overdue',
          '33333333-3333-3333-3333-333333333333', 'CM-RP-9003', 'CM-REC-9003');

  SELECT natural_balance INTO v_pen_before FROM v_account_balances WHERE account_code = 'INC-PENALTY';
  v_tx := post_repayment('RP-TEST-OD', v_cash);
  SELECT natural_balance INTO v_pen_after FROM v_account_balances WHERE account_code = 'INC-PENALTY';

  PERFORM _check('overdue', '10. an overdue collection posts like any other', v_tx IS NOT NULL, NULL);
  PERFORM _check('penalty', '12. a penalty posts to penalty income',
                 v_pen_after - v_pen_before = 5000, format('%s -> %s', v_pen_before, v_pen_after));
  PERFORM _check('penalty', '12. penalty income is separate from interest income',
    (SELECT natural_balance FROM v_account_balances WHERE account_code = 'INC-PENALTY') = 5000, NULL);
  PERFORM _check('penalty', 'production carried no fabricated penalty history',
    (SELECT COALESCE(sum(penalty_portion), 0) FROM loan_repayments
      WHERE allocation_source = 'schedule_backfill') = 0, NULL);
  PERFORM _check('repayment', '12. a three-way split still balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines WHERE transaction_id = v_tx) = 0, NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Expenses  (workflows 13 and 14)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cash TEXT; v_bank TEXT; v_tx TEXT;
  v_before NUMERIC; v_after NUMERIC; v_exp NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';

  INSERT INTO expenses (id, expense_number, category, description, amount, expense_date,
                        payment_method, branch_id, recorded_by)
  VALUES ('EXP-TEST-FUEL', 'CM-EX-9001', 'Fuel', 'Field visit fuel', 60000, CURRENT_DATE,
          'Cash', 'BR-TEST-001', '11111111-1111-1111-1111-111111111111');

  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_cash;
  v_tx := post_expense('EXP-TEST-FUEL', v_cash);
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_cash;

  PERFORM _check('expenses', '13. an expense paid from cash reduces cash',
                 v_before - v_after = 60000, format('fell by %s', v_before - v_after));
  PERFORM _check('expenses', '13. the expense debits its own category account',
    (SELECT a.account_code FROM financial_transaction_lines l
       JOIN financial_accounts a ON a.id = l.account_id
      WHERE l.transaction_id = v_tx AND l.direction = 'debit') = 'EXP-FUEL', NULL);

  INSERT INTO expenses (id, expense_number, category, description, amount, expense_date,
                        payment_method, branch_id, recorded_by)
  VALUES ('EXP-TEST-RENT', 'CM-EX-9002', 'Rent', 'Branch rent', 400000, CURRENT_DATE,
          'Bank Transfer', 'BR-TEST-001', '11111111-1111-1111-1111-111111111111');

  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_bank;
  PERFORM post_expense('EXP-TEST-RENT', v_bank);
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_bank;
  PERFORM _check('expenses', '14. an expense paid from bank reduces bank',
                 v_before - v_after = 400000, NULL);

  SELECT total_expenses INTO v_exp FROM v_money_position;
  PERFORM _check('expenses', 'expenses reach the P&L', v_exp = 460000, format('%s', v_exp));
  PERFORM _check('expenses', 'loan disbursement is not an expense',
    (SELECT COALESCE(sum(expense_amount), 0) FROM v_income_statement
      WHERE account_code LIKE 'EXP-%') = 460000, NULL);

  PERFORM _check_raises('expenses', 'an expense cannot be posted to the ledger twice',
    format($q$ SELECT post_expense('EXP-TEST-FUEL', %L) $q$, v_cash), 'duplicate key');
END $$;

-- ---------------------------------------------------------------------------
-- 7. Reversal  (workflow 15)
--
-- The audit found `undoDisbursement` posting an unrelated deposit rather than
-- reversing anything. A reversal must mirror the original, line for line.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tx TEXT; v_rev TEXT; v_bank TEXT;
  v_bank_before NUMERIC; v_bank_mid NUMERIC; v_bank_after NUMERIC;
  v_recv_before NUMERIC; v_recv_after NUMERIC;
  v_lines_orig INT; v_lines_rev INT;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  SELECT current_balance INTO v_bank_before FROM v_account_balances WHERE account_id = v_bank;
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';

  SELECT id INTO v_tx FROM financial_transactions
   WHERE loan_id = 'LN-TEST-016' AND entry_type = 'disbursement';
  SELECT current_balance INTO v_bank_mid FROM v_account_balances WHERE account_id = v_bank;

  v_rev := reverse_financial_transaction(v_tx, 'Disbursed to the wrong member');

  SELECT current_balance INTO v_bank_after FROM v_account_balances WHERE account_id = v_bank;
  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';

  PERFORM _check('reversal', '15. reversing returns the cash to the funding account',
                 v_bank_after - v_bank_mid = 398000, format('rose by %s', v_bank_after - v_bank_mid));
  PERFORM _check('reversal', '15. reversing removes the loan from receivables',
                 v_recv_before - v_recv_after = 500000, format('%s', v_recv_before - v_recv_after));

  SELECT count(*) INTO v_lines_orig FROM financial_transaction_lines WHERE transaction_id = v_tx;
  SELECT count(*) INTO v_lines_rev  FROM financial_transaction_lines WHERE transaction_id = v_rev;
  PERFORM _check('reversal', '15. the reversal mirrors every line of the original',
                 v_lines_orig = v_lines_rev, format('%s vs %s', v_lines_orig, v_lines_rev));
  PERFORM _check('reversal', '15. the reversal references the original',
    (SELECT reversal_of_id FROM financial_transactions WHERE id = v_rev) = v_tx, NULL);
  PERFORM _check('reversal', '15. the original is marked reversed, not deleted',
    (SELECT status FROM financial_transactions WHERE id = v_tx) = 'reversed', NULL);
  PERFORM _check('reversal', '15. the original and its reversal net to zero',
    (SELECT sum(signed_amount) FROM financial_transaction_lines
      WHERE transaction_id IN (v_tx, v_rev)) = 0, NULL);

  -- The application resets the loan when it undoes a disbursement; mirror it,
  -- otherwise the loan book still shows a loan the ledger no longer carries —
  -- which `v_ledger_health` rightly reports as a discrepancy.
  UPDATE loans SET status = 'Pending', disbursed_at = NULL, disbursed_by = NULL
   WHERE id = 'LN-TEST-016';

  PERFORM _check_raises('reversal', 'a transaction cannot be reversed twice',
    format($q$ SELECT reverse_financial_transaction(%L, 'again') $q$, v_tx), 'already been reversed');
  PERFORM _check_raises('reversal', 'a reversal needs a reason',
    format($q$ SELECT reverse_financial_transaction(
      (SELECT id FROM financial_transactions WHERE entry_type='capital_injection' AND status='posted' LIMIT 1), '') $q$),
    'reason is required');
END $$;

-- Posted history is immutable.
DO $$
DECLARE v_tx TEXT;
BEGIN
  SELECT id INTO v_tx FROM financial_transactions WHERE entry_type = 'repayment' LIMIT 1;
  PERFORM _check_raises('immutability', 'a posted journal cannot be edited',
    format($q$ UPDATE financial_transactions SET description = 'tampered' WHERE id = %L $q$, v_tx),
    'immutable');
  PERFORM _check_raises('immutability', 'a posted journal cannot be deleted',
    format($q$ DELETE FROM financial_transactions WHERE id = %L $q$, v_tx), 'cannot be deleted');
  PERFORM _check_raises('immutability', 'a journal line cannot be altered',
    format($q$ UPDATE financial_transaction_lines SET amount = 1 WHERE transaction_id = %L $q$, v_tx),
    'cannot be altered');
  -- The legacy register is closed to PostgREST callers and open to migrations
  -- and definer functions, so the question can only be asked as a real signed-in
  -- caller. Section 13 does that; see 'the legacy bank register is closed'.
  PERFORM _check('immutability', 'the legacy bank register still exists to be read',
    EXISTS (SELECT 1 FROM bank_transactions), NULL);
  PERFORM _as(NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 8. Reconciliation  (workflow 17) and the cut-over
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cash TEXT; v_rec account_reconciliations%ROWTYPE;
  v_system NUMERIC; v_after NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT current_balance INTO v_system FROM v_account_balances WHERE account_id = v_cash;

  -- A count that agrees with the ledger.
  v_rec := record_account_reconciliation(v_cash, v_system, CURRENT_DATE, 'COUNT-1', 'Till counted');
  PERFORM _check('reconciliation', '17. a matching count is accepted',
                 v_rec.difference = 0 AND v_rec.status = 'Accepted', v_rec.status);

  -- A count that does not, left unresolved.
  v_rec := record_account_reconciliation(v_cash, v_system - 15000, CURRENT_DATE, 'COUNT-2', 'Shortfall found');
  PERFORM _check('reconciliation', '17. a difference is recorded, not hidden',
                 v_rec.difference = -15000 AND v_rec.status = 'Unresolved', v_rec.status);
  PERFORM _check('reconciliation', '17. an unresolved difference does not move the balance',
    (SELECT current_balance FROM v_account_balances WHERE account_id = v_cash) = v_system, NULL);

  -- Now resolved, with a reason.
  v_rec := record_account_reconciliation(v_cash, v_system - 15000, CURRENT_DATE, 'COUNT-3',
             'Shortfall confirmed', TRUE, 'Cash shortfall confirmed by second count');
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_cash;
  PERFORM _check('reconciliation', '17. an approved adjustment moves the balance to the count',
                 v_after = v_system - 15000, format('%s vs %s', v_after, v_system - 15000));
  PERFORM _check('reconciliation', '17. the adjustment is a posted, visible journal',
    (SELECT status FROM financial_transactions WHERE id = v_rec.adjustment_tx_id) = 'posted', NULL);
  PERFORM _check('reconciliation', '17. the adjustment records who and why',
                 v_rec.adjustment_reason IS NOT NULL AND v_rec.status = 'Adjusted', NULL);
  PERFORM _check('reconciliation', '17. it appears in the reconciliation report',
    (SELECT reconciliation_status FROM v_account_reconciliation WHERE account_id = v_cash) = 'Adjusted', NULL);
  PERFORM _check_raises('reconciliation', 'an adjustment without a reason is refused',
    format($q$ SELECT record_account_reconciliation(%L, 1, CURRENT_DATE, NULL, NULL, TRUE, '') $q$, v_cash),
    'Explain the difference');
END $$;

-- The legacy gap is exposed, never silently absorbed.
DO $$
DECLARE v_legacy NUMERIC;
BEGIN
  SELECT current_balance INTO v_legacy FROM v_account_balances WHERE account_code = 'LEGACY-UNCLASSIFIED';
  PERFORM _check('cut-over', 'the historical funding gap is visible on its own account',
                 v_legacy <> 0, format('legacy balance %s', v_legacy));
  PERFORM _check('cut-over', 'the legacy account is closed to manual posting',
    (SELECT NOT allow_manual_posting FROM financial_accounts WHERE account_code = 'LEGACY-UNCLASSIFIED'), NULL);
  PERFORM _check('cut-over', 'a cut-over date was recorded',
    (SELECT financial_cutover_date IS NOT NULL FROM settings WHERE id = 1), NULL);
  PERFORM _check('cut-over', 'cut-over is not marked complete until balances are counted in',
    (SELECT NOT financial_cutover_completed FROM settings WHERE id = 1), NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 9. Loan closure  (workflow 18)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cash TEXT; v_sched RECORD; v_n INT := 0; v_recv_before NUMERIC; v_recv_after NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';

  -- Settle LN-TEST-CASH in full, instalment by instalment.
  FOR v_sched IN
    SELECT * FROM loan_repayment_schedule WHERE loan_id = 'LN-TEST-CASH' ORDER BY week_number
  LOOP
    v_n := v_n + 1;
    INSERT INTO loan_repayments (id, loan_id, schedule_id, client_id, amount_paid,
      payment_date, payment_method, collection_type, recorded_by, repayment_number, receipt_number)
    VALUES (format('RP-CLOSE-%s', v_n), 'LN-TEST-CASH', v_sched.id, 'CLI-TEST-020',
            v_sched.installment_amount, CURRENT_DATE, 'Cash', 'Regular',
            '33333333-3333-3333-3333-333333333333',
            format('CM-RP-95%s', lpad(v_n::text, 2, '0')),
            format('CM-REC-95%s', lpad(v_n::text, 2, '0')));
    PERFORM post_repayment(format('RP-CLOSE-%s', v_n), v_cash);
    UPDATE loan_repayment_schedule SET paid_amount = installment_amount, status = 'Paid' WHERE id = v_sched.id;
  END LOOP;

  UPDATE loans SET outstanding_balance = 0, status = 'Fully Paid', completion_percentage = 100
   WHERE id = 'LN-TEST-CASH';

  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT total_outstanding INTO v_outstanding FROM v_loan_portfolio WHERE loan_id = 'LN-TEST-CASH';

  PERFORM _check('closure', '18. a fully repaid loan clears its receivable',
                 v_recv_before - v_recv_after = 200000, format('%s', v_recv_before - v_recv_after));
  PERFORM _check('closure', '18. nothing remains outstanding', v_outstanding = 0, format('%s', v_outstanding));
  PERFORM _check('closure', '18. a closed loan leaves the active portfolio',
    NOT EXISTS (SELECT 1 FROM v_loan_portfolio
                 WHERE loan_id = 'LN-TEST-CASH' AND status IN ('Active','Partially Paid','Overdue')), NULL);
END $$;

-- Write-off.
DO $$
DECLARE v_recv_before NUMERIC; v_recv_after NUMERIC; v_loss NUMERIC; v_tx TEXT;
BEGIN
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  UPDATE loans SET is_bad_debt = TRUE, writeoff_reason = 'Member deceased, no guarantor recovery',
                   writeoff_at = now(), writeoff_status = 'Written Off'
   WHERE id = 'LN-TEST-012';
  v_tx := post_writeoff('LN-TEST-012');
  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance INTO v_loss FROM v_account_balances WHERE account_code = 'WRITEOFF-LOSS';

  PERFORM _check('writeoff', 'a write-off removes the principal from receivables',
                 v_recv_before > v_recv_after, format('%s -> %s', v_recv_before, v_recv_after));
  PERFORM _check('writeoff', 'the loss is recognised, and only on principal',
                 v_loss = v_recv_before - v_recv_after, format('loss %s', v_loss));
  PERFORM _check('writeoff', 'the write-off journal balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines WHERE transaction_id = v_tx) = 0, NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 10. Branch financial transaction  (workflow 16)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_branch_cash TEXT; v_bank TEXT; v_fin RECORD;
BEGIN
  INSERT INTO branches (id, branch_name, branch_code, status)
  VALUES ('BR-TEST-002', 'Kamuli', 'BR-002', 'Active') ON CONFLICT DO NOTHING;

  INSERT INTO financial_accounts (account_code, account_name, account_type, account_class, branch_id)
  VALUES ('CASH-KAMULI', 'Kamuli Branch Cash', 'branch_cash', 'asset_liquid', 'BR-TEST-002')
  ON CONFLICT (account_code) DO NOTHING;
  SELECT id INTO v_branch_cash FROM financial_accounts WHERE account_code = 'CASH-KAMULI';
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';

  PERFORM post_internal_transfer(v_bank, v_branch_cash, 750000, CURRENT_DATE, 'TRF-BR',
                                 'Head office bank to Kamuli branch cash');

  PERFORM _check('branch', '16. a branch account carries its own balance',
    (SELECT current_balance FROM v_account_balances WHERE account_id = v_branch_cash) = 750000, NULL);

  SELECT * INTO v_fin FROM v_branch_financials WHERE branch_id = 'BR-TEST-002';
  PERFORM _check('branch', '16. branch liquidity reports separately', v_fin.liquidity = 750000,
                 format('%s', v_fin.liquidity));
  PERFORM _check('branch', '16. a branch transfer creates no income anywhere',
    (SELECT total_income FROM v_money_position) =
    (SELECT COALESCE(sum(natural_balance), 0) FROM v_account_balances WHERE account_class = 'income'), NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 11. Permissions — enforced by the database, not the interface
--
-- The audit's core finding was that disbursement was open to Loan Officers
-- while the ledger it wrote to was Administrator-only, and the rejection was
-- swallowed. These checks prove both halves of the fix: the officer CAN post a
-- disbursement journal through the function, and CANNOT touch the ledger any
-- other way.
-- ---------------------------------------------------------------------------
-- Loan Officer: may disburse (business permission), may not open the ledger.
DO $$
DECLARE v_bank TEXT; v_tx TEXT;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';

  -- Give the officer an open business day, as production requires.
  INSERT INTO business_days (id, branch_id, business_date, status, opened_by)
  VALUES ('BD-TEST-1', 'BR-TEST-001', CURRENT_DATE, 'OPEN', '22222222-2222-2222-2222-222222222222')
  ON CONFLICT DO NOTHING;
  INSERT INTO officer_days (id, business_day_id, officer_id, branch_id, business_date, status)
  VALUES ('OD-TEST-1', 'BD-TEST-1', '33333333-3333-3333-3333-333333333333', 'BR-TEST-001',
          CURRENT_DATE, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  -- A loan the backfill has not already posted, so this tests the permission
  -- rather than the duplicate guard.
  INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
    interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
    weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
    security_amount, security_balance, net_disbursed_amount, first_repayment_date,
    final_due_date, outstanding_balance, status, disbursed_at, disbursed_by)
  VALUES ('LN-TEST-LO', 'CM-LN-2026-9002', 'CLI-TEST-021', 'PRD-TEST-001', 300000, 20.00,
    'Flat Rate', 16, 60000, 360000, 22500, 12000, 3000, 2000, 45000, 45000, 238000,
    CURRENT_DATE + 7, CURRENT_DATE + 112, 360000, 'Active', now(),
    '33333333-3333-3333-3333-333333333333')
  ON CONFLICT (id) DO NOTHING;

  PERFORM _as('33333333-3333-3333-3333-333333333333');

  BEGIN
    v_tx := post_disbursement('LN-TEST-LO', v_bank);
    PERFORM _check('permissions', 'a Loan Officer CAN post a disbursement journal', v_tx IS NOT NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('permissions', 'a Loan Officer CAN post a disbursement journal', FALSE, left(SQLERRM, 90));
  END;

  PERFORM _check_raises('permissions', 'a Loan Officer cannot record capital',
    format($q$ SELECT post_capital_injection(%L, 100, CURRENT_DATE) $q$, v_bank), 'Administrator');
  PERFORM _check_raises('permissions', 'a Loan Officer cannot move money between accounts',
    format($q$ SELECT post_internal_transfer(%L, (SELECT id FROM financial_accounts WHERE account_code='CASH-HO'),
             100, CURRENT_DATE) $q$, v_bank), 'not permitted');
  PERFORM _check_raises('permissions', 'a Loan Officer cannot post an expense',
    $q$ SELECT post_expense('EXP-TEST-RENT', (SELECT id FROM financial_accounts WHERE account_code='CASH-HO')) $q$,
    'not permitted');
  PERFORM _check_raises('permissions', 'a Loan Officer cannot reverse a transaction',
    $q$ SELECT reverse_financial_transaction(
          (SELECT id FROM financial_transactions WHERE status='posted' LIMIT 1), 'nope') $q$, 'Administrator');
  PERFORM _as(NULL);
END $$;

-- Branch Manager: own branch yes, other branch no.
DO $$
DECLARE v_kamuli TEXT; v_ho TEXT;
BEGIN
  SELECT id INTO v_kamuli FROM financial_accounts WHERE account_code = 'CASH-KAMULI';
  SELECT id INTO v_ho FROM financial_accounts WHERE account_code = 'CASH-HO';

  INSERT INTO expenses (id, expense_number, category, description, amount, expense_date,
                        payment_method, branch_id, recorded_by)
  VALUES ('EXP-TEST-BM', 'CM-EX-9003', 'Transport', 'Branch manager transport', 25000,
          CURRENT_DATE, 'Cash', 'BR-TEST-001', '22222222-2222-2222-2222-222222222222'),
         ('EXP-TEST-OTHER', 'CM-EX-9004', 'Transport', 'Other branch transport', 25000,
          CURRENT_DATE, 'Cash', 'BR-TEST-002', '22222222-2222-2222-2222-222222222222')
  ON CONFLICT DO NOTHING;

  PERFORM _as('22222222-2222-2222-2222-222222222222');

  BEGIN
    PERFORM post_expense('EXP-TEST-BM', v_ho);
    PERFORM _check('permissions', 'a Branch Manager CAN post an expense for their own branch', TRUE, NULL);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('permissions', 'a Branch Manager CAN post an expense for their own branch',
                   FALSE, left(SQLERRM, 90));
  END;

  PERFORM _check_raises('permissions', 'a Branch Manager cannot post another branch''s expense',
    format($q$ SELECT post_expense('EXP-TEST-OTHER', %L) $q$, v_ho), 'own branch');
  PERFORM _check_raises('permissions', 'a Branch Manager cannot post through another branch''s account',
    format($q$ SELECT post_internal_transfer(%L, %L, 1000, CURRENT_DATE) $q$, v_kamuli, v_ho),
    'another branch');
  PERFORM _check_raises('permissions', 'a Branch Manager cannot record capital',
    format($q$ SELECT post_capital_injection(%L, 1000, CURRENT_DATE) $q$, v_ho), 'Administrator');
  PERFORM _as(NULL);
END $$;

-- Auditor: reads everything, writes nothing.
DO $$
DECLARE v_ho TEXT;
BEGIN
  SELECT id INTO v_ho FROM financial_accounts WHERE account_code = 'CASH-HO';
  PERFORM _as('44444444-4444-4444-4444-444444444444');
  PERFORM _check_raises('permissions', 'an Auditor cannot post an expense',
    format($q$ SELECT post_expense('EXP-TEST-OTHER', %L) $q$, v_ho), 'not permitted');
  PERFORM _check_raises('permissions', 'an Auditor cannot record capital',
    format($q$ SELECT post_capital_injection(%L, 1000, CURRENT_DATE) $q$, v_ho), 'Administrator');
  PERFORM _check_raises('permissions', 'an Auditor cannot post a repayment',
    format($q$ SELECT post_repayment('RP-TEST-FULL', %L) $q$, v_ho), 'Auditors cannot');
  PERFORM _as(NULL);
END $$;

-- Administrator: may post across branches. This also clears EXP-TEST-OTHER,
-- which the Branch Manager and Auditor checks above deliberately failed to
-- post — leaving it unposted would (correctly) keep `v_ledger_health`
-- reporting an expense with no journal.
DO $$
DECLARE v_ho TEXT;
BEGIN
  SELECT id INTO v_ho FROM financial_accounts WHERE account_code = 'CASH-HO';
  PERFORM _as('11111111-1111-1111-1111-111111111111');
  BEGIN
    PERFORM post_expense('EXP-TEST-OTHER', v_ho);
    PERFORM _check('permissions', 'an Administrator CAN post any branch''s expense', TRUE, NULL);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('permissions', 'an Administrator CAN post any branch''s expense', FALSE, left(SQLERRM, 90));
  END;
  PERFORM _as(NULL);
END $$;

-- Nobody signed in may write the ledger directly — the whole point of routing
-- money through the posting functions.
DO $$
DECLARE v_denied INT := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM _as('11111111-1111-1111-1111-111111111111');
  BEGIN
    INSERT INTO financial_transactions (entry_type, description) VALUES ('other_income', 'direct');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN v_denied := v_denied + 1;
  END;
  BEGIN
    INSERT INTO financial_transaction_lines (transaction_id, line_no, account_id, direction, amount)
    VALUES ('x', 1, 'y', 'debit', 1);
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN v_denied := v_denied + 1;
  END;
  BEGIN
    UPDATE financial_transaction_lines SET amount = 0;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN v_denied := v_denied + 1;
  END;
  RESET ROLE;
  PERFORM _as(NULL);
  PERFORM _check('permissions', 'even an Administrator cannot write the ledger directly',
                 v_denied = 3, format('%s of 3 denied', v_denied));
END $$;

-- ---------------------------------------------------------------------------
-- 11b. Atomicity — the failure this whole programme exists to prevent
--
-- A loan must never end up disbursed with no journal behind it. The old code
-- marked the loan Active, tried to write the ledger, had the write rejected by
-- row level security, and carried on. `disburse_loan` welds the two together.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_bank TEXT; v_closed TEXT; v_row RECORD; v_status TEXT; v_disb TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';

  INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
    interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
    weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
    security_amount, security_balance, net_disbursed_amount, first_repayment_date,
    final_due_date, outstanding_balance, status)
  VALUES ('LN-TEST-ATOMIC', 'CM-LN-2026-9003', 'CLI-TEST-022', 'PRD-TEST-001', 400000, 20.00,
    'Flat Rate', 16, 80000, 480000, 30000, 16000, 4000, 2000, 60000, 60000, 318000,
    CURRENT_DATE + 7, CURRENT_DATE + 112, 480000, 'Pending')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO loan_repayment_schedule (id, loan_id, week_number, due_date, installment_amount,
    principal_portion, interest_portion, paid_amount, remaining_balance, status)
  SELECT format('SCH-ATOMIC-%s', lpad(w::text, 2, '0')), 'LN-TEST-ATOMIC', w,
         CURRENT_DATE + w * 7, 30000, 25000, 5000, 0, 30000, 'Pending'
    FROM generate_series(1, 16) w
  ON CONFLICT (id) DO NOTHING;

  -- A funding account that cannot be posted to. The disbursement must fail
  -- WHOLE: the loan stays Pending, and no journal is left behind.
  INSERT INTO financial_accounts (account_code, account_name, account_type, account_class, status)
  VALUES ('BANK-CLOSED', 'Closed Account', 'bank', 'asset_liquid', 'Closed')
  ON CONFLICT (account_code) DO NOTHING;
  SELECT id INTO v_closed FROM financial_accounts WHERE account_code = 'BANK-CLOSED';

  BEGIN
    PERFORM disburse_loan('LN-TEST-ATOMIC', v_closed);
    PERFORM _check('atomicity', 'a bad funding account fails the disbursement', FALSE, 'it succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('atomicity', 'a bad funding account fails the disbursement', TRUE, left(SQLERRM, 70));
  END;

  SELECT status, disbursed_at INTO v_status, v_disb FROM loans WHERE id = 'LN-TEST-ATOMIC';
  PERFORM _check('atomicity', 'a failed disbursement leaves the loan Pending',
                 v_status = 'Pending' AND v_disb IS NULL, format('%s / %s', v_status, v_disb));
  PERFORM _check('atomicity', 'a failed disbursement leaves no journal',
    NOT EXISTS (SELECT 1 FROM financial_transactions WHERE loan_id = 'LN-TEST-ATOMIC'), NULL);
  PERFORM _check('atomicity', 'a failed disbursement leaves no partial financial state',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE subject_id = 'LN-TEST-ATOMIC'), NULL);

  -- Now with a good account: loan, application and journal all move together.
  SELECT * INTO v_row FROM disburse_loan('LN-TEST-ATOMIC', v_bank);
  PERFORM _check('atomicity', 'a good disbursement returns its journal number',
                 v_row.transaction_number IS NOT NULL, v_row.transaction_number);
  SELECT status, disbursed_at INTO v_status, v_disb FROM loans WHERE id = 'LN-TEST-ATOMIC';
  PERFORM _check('atomicity', 'the loan is Active and stamped', v_status = 'Active' AND v_disb IS NOT NULL, NULL);
  PERFORM _check('atomicity', 'the journal exists and balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines
      WHERE transaction_id = v_row.transaction_id) = 0, NULL);

  PERFORM _check_raises('atomicity', 'the same loan cannot be disbursed twice',
    format($q$ SELECT disburse_loan('LN-TEST-ATOMIC', %L) $q$, v_bank), 'already been disbursed');
  -- A loan with no instalments at all: disbursing it would leave the member
  -- owing money with nothing to collect against.
  INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
    interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
    weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
    security_amount, security_balance, net_disbursed_amount, first_repayment_date,
    final_due_date, outstanding_balance, status)
  VALUES ('LN-TEST-NOSCHED', 'CM-LN-2026-9004', 'CLI-TEST-023', 'PRD-TEST-001', 100000, 20.00,
    'Flat Rate', 16, 20000, 120000, 7500, 4000, 1000, 2000, 15000, 15000, 78000,
    CURRENT_DATE + 7, CURRENT_DATE + 112, 120000, 'Pending')
  ON CONFLICT (id) DO NOTHING;
  PERFORM _check_raises('atomicity', 'a loan with no schedule cannot be disbursed',
    format($q$ SELECT disburse_loan('LN-TEST-NOSCHED', %L) $q$, v_bank), 'no repayment schedule');
END $$;

-- Collection through the atomic path, then reversed through it.
DO $$
DECLARE
  v_cash TEXT; v_sched TEXT; v_row RECORD; v_rev RECORD;
  v_out_before NUMERIC; v_out_after NUMERIC; v_cash_before NUMERIC; v_cash_after NUMERIC;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT id INTO v_sched FROM loan_repayment_schedule
   WHERE loan_id = 'LN-TEST-ATOMIC' ORDER BY week_number LIMIT 1;

  SELECT outstanding_balance INTO v_out_before FROM loans WHERE id = 'LN-TEST-ATOMIC';
  SELECT current_balance INTO v_cash_before FROM v_account_balances WHERE account_id = v_cash;

  SELECT * INTO v_row FROM record_loan_repayment(
    'LN-TEST-ATOMIC', 30000, 'Cash', v_cash,
    jsonb_build_array(jsonb_build_object('schedule_id', v_sched, 'paid_amount', 30000,
                                         'remaining_balance', 0, 'status', 'Paid')),
    v_sched, 'Regular', 'Atomic collection test');

  SELECT outstanding_balance INTO v_out_after FROM loans WHERE id = 'LN-TEST-ATOMIC';
  SELECT current_balance INTO v_cash_after FROM v_account_balances WHERE account_id = v_cash;

  PERFORM _check('atomicity', 'a collection writes receipt, schedule, loan and journal together',
                 v_row.receipt_number IS NOT NULL AND v_row.transaction_id IS NOT NULL, v_row.receipt_number);
  PERFORM _check('atomicity', 'the collection splits principal and interest',
                 v_row.principal_portion = 25000 AND v_row.interest_portion = 5000,
                 format('%s / %s', v_row.principal_portion, v_row.interest_portion));
  PERFORM _check('atomicity', 'the loan balance falls by the amount collected',
                 v_out_before - v_out_after = 30000, NULL);
  PERFORM _check('atomicity', 'the receiving account rises by the amount collected',
                 v_cash_after - v_cash_before = 30000, NULL);
  PERFORM _check('atomicity', 'the instalment is marked paid',
    (SELECT status FROM loan_repayment_schedule WHERE id = v_sched) = 'Paid', NULL);

  -- Reversing it must put all four back.
  SELECT * INTO v_rev FROM undo_loan_repayment(v_row.repayment_id, 'Collected against the wrong member');
  PERFORM _check('atomicity', 'reversing a collection returns the loan balance',
    (SELECT outstanding_balance FROM loans WHERE id = 'LN-TEST-ATOMIC') = v_out_before, NULL);
  PERFORM _check('atomicity', 'reversing a collection returns the cash',
    (SELECT current_balance FROM v_account_balances WHERE account_id = v_cash) = v_cash_before, NULL);
  PERFORM _check('atomicity', 'reversing a collection re-opens the instalment',
    (SELECT status FROM loan_repayment_schedule WHERE id = v_sched) = 'Pending', NULL);
  PERFORM _check('atomicity', 'the reversal is recorded in the reversal register',
    EXISTS (SELECT 1 FROM loan_reversals WHERE loan_id = 'LN-TEST-ATOMIC' AND reversal_type = 'Repayment'), NULL);
END $$;

-- Undoing a disbursement reverses the real journal, rather than inventing a
-- deposit as the old rollback did.
DO $$
DECLARE v_bank TEXT; v_before NUMERIC; v_after NUMERIC; v_rev RECORD; v_recv_before NUMERIC;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_bank;
  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';

  SELECT * INTO v_rev FROM undo_loan_disbursement('LN-TEST-ATOMIC', 'Disbursed in error');
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_bank;

  PERFORM _check('atomicity', 'undoing a disbursement returns exactly the net that left',
                 v_after - v_before = 318000, format('rose by %s', v_after - v_before));
  PERFORM _check('atomicity', 'undoing a disbursement clears the receivable',
    v_recv_before - (SELECT current_balance FROM v_account_balances WHERE account_code='LOANS-RECEIVABLE')
      = 400000, NULL);
  PERFORM _check('atomicity', 'the loan returns to Pending',
    (SELECT status FROM loans WHERE id = 'LN-TEST-ATOMIC') = 'Pending', NULL);
  PERFORM _check('atomicity', 'the reversal references the original journal, not a new deposit',
    (SELECT reversal_of_id IS NOT NULL FROM financial_transactions WHERE id = v_rev.reversal_id), NULL);
  PERFORM _check('atomicity', 'no unlinked deposit was created',
    NOT EXISTS (SELECT 1 FROM financial_transactions
                 WHERE loan_id = 'LN-TEST-ATOMIC' AND entry_type = 'capital_injection'), NULL);
END $$;

-- A loan reversed in error must be disbursable again. The idempotency index
-- would otherwise hold the source slot forever and strand the member.
DO $$
DECLARE v_bank TEXT; v_row RECORD;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  BEGIN
    SELECT * INTO v_row FROM disburse_loan('LN-TEST-ATOMIC', v_bank);
    PERFORM _check('atomicity', 'a reversed loan can be disbursed again',
                   v_row.transaction_id IS NOT NULL, v_row.transaction_number);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('atomicity', 'a reversed loan can be disbursed again', FALSE, left(SQLERRM, 90));
  END;
  PERFORM _check('atomicity', 're-disbursing leaves exactly one live journal',
    (SELECT count(*) FROM financial_transactions
      WHERE loan_id = 'LN-TEST-ATOMIC' AND entry_type = 'disbursement' AND status = 'posted') = 1, NULL);
END $$;

-- An expense cannot exist without the account that paid it.
DO $$
DECLARE v_cash TEXT; v_row RECORD; v_before NUMERIC; v_after NUMERIC; v_count INT;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT count(*) INTO v_count FROM expenses;
  SELECT current_balance INTO v_before FROM v_account_balances WHERE account_id = v_cash;

  SELECT * INTO v_row FROM record_expense('Internet', 'Branch internet', 80000, CURRENT_DATE,
                                          'Cash', v_cash, 'BR-TEST-001');
  SELECT current_balance INTO v_after FROM v_account_balances WHERE account_id = v_cash;

  PERFORM _check('atomicity', 'an expense and its journal are written together',
                 v_row.expense_id IS NOT NULL AND v_row.transaction_id IS NOT NULL, v_row.expense_number);
  PERFORM _check('atomicity', 'the source account falls by the expense', v_before - v_after = 80000, NULL);
  PERFORM _check('atomicity', 'Internet posts to its own account, not Other',
    (SELECT a.account_code FROM financial_transaction_lines l JOIN financial_accounts a ON a.id = l.account_id
      WHERE l.transaction_id = v_row.transaction_id AND l.direction = 'debit') = 'EXP-INTERNET', NULL);

  BEGIN
    PERFORM record_expense('Fuel', 'no account', 1000, CURRENT_DATE, 'Cash', NULL, 'BR-TEST-001');
    PERFORM _check('atomicity', 'an expense with no source account is refused', FALSE, 'it succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('atomicity', 'an expense with no source account is refused', TRUE, left(SQLERRM, 70));
  END;
  PERFORM _check('atomicity', 'the refused expense left no row behind',
    (SELECT count(*) FROM expenses) = v_count + 1, NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 12. Reports reconcile to the ledger  (workflows 19 and 20)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_dr NUMERIC; v_cr NUMERIC;
  v_assets NUMERIC; v_liab NUMERIC; v_eq NUMERIC; v_result NUMERIC;
  v_pos RECORD; v_liquid NUMERIC; v_flow NUMERIC;
BEGIN
  SELECT sum(debit_balance), sum(credit_balance) INTO v_dr, v_cr FROM v_trial_balance;
  PERFORM _check('reports', '20. the trial balance balances', round(v_dr, 2) = round(v_cr, 2),
                 format('Dr %s vs Cr %s', v_dr, v_cr));

  SELECT COALESCE(sum(amount) FILTER (WHERE section = 'Assets'), 0),
         COALESCE(sum(amount) FILTER (WHERE section = 'Liabilities'), 0),
         COALESCE(sum(amount) FILTER (WHERE section = 'Capital & Equity'), 0),
         COALESCE(sum(amount) FILTER (WHERE section = 'Result'), 0)
    INTO v_assets, v_liab, v_eq, v_result FROM v_financial_position;
  -- Assets = Liabilities + Equity + (Income - Expenses). `Result` sums income
  -- and expense naturals, so income is positive and expense positive: the
  -- accounting identity is Assets = Liab + Equity + Income - Expenses.
  PERFORM _check('reports', '20. the statement of financial position balances',
    round(v_assets, 2) = round(v_liab + v_eq
      + COALESCE((SELECT sum(natural_balance) FROM v_account_balances WHERE account_class='income'), 0)
      - COALESCE((SELECT sum(natural_balance) FROM v_account_balances WHERE account_class='expense'), 0), 2),
    format('assets %s vs L+E+R %s', v_assets, v_liab + v_eq + v_result));

  SELECT * INTO v_pos FROM v_money_position;
  PERFORM _check('reports', '19. money position liquidity equals the sum of liquid accounts',
    v_pos.total_available_liquidity =
      (SELECT COALESCE(sum(current_balance), 0) FROM v_account_balances
        WHERE account_class = 'asset_liquid' AND status <> 'Closed'), NULL);
  PERFORM _check('reports', '19. cash + bank + wallet + legacy = total liquidity',
    round(v_pos.cash_at_hand + v_pos.cash_at_bank + v_pos.mobile_money + v_pos.unclassified_legacy, 2)
      = round(v_pos.total_available_liquidity, 2), NULL);
  PERFORM _check('reports', '19. net worth on the ledger equals capital plus the net result',
    round(v_pos.net_worth_ledger, 2) = round(v_pos.capital_introduced + v_pos.net_result, 2),
    format('%s vs %s', v_pos.net_worth_ledger, v_pos.capital_introduced + v_pos.net_result));
  PERFORM _check('reports', '19. portfolio = outstanding principal + interest receivable',
    round(v_pos.total_loan_portfolio, 2)
      = round(v_pos.outstanding_principal + v_pos.interest_receivable, 2), NULL);

  SELECT COALESCE(sum(cash_movement), 0) INTO v_flow FROM v_cash_flow;
  SELECT COALESCE(sum(current_balance), 0) INTO v_liquid FROM v_account_balances
   WHERE account_class = 'asset_liquid';
  PERFORM _check('reports', '20. cash flow movements equal the liquid balances',
                 round(v_flow, 2) = round(v_liquid, 2), format('%s vs %s', v_flow, v_liquid));

  PERFORM _check('reports', '20. the P&L excludes returned principal',
    (SELECT COALESCE(sum(income_amount), 0) FROM v_income_statement)
      < (SELECT COALESCE(sum(amount_paid), 0) FROM loan_repayments), NULL);
  PERFORM _check('reports', '20. no report carries a hard-coded opening balance',
    (SELECT cash_at_bank FROM v_money_position) < 250000000, NULL);

  PERFORM _check('reports', 'every disbursement now has a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'disbursement_without_journal'), NULL);
  PERFORM _check('reports', 'every receipt now has a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'repayment_without_journal'), NULL);
  PERFORM _check('reports', 'the ledger agrees with the loan book',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'receivable_vs_loan_book'),
    (SELECT detail FROM v_ledger_health WHERE check_name = 'receivable_vs_loan_book'));
  PERFORM _check('reports', 'no duplicate postings exist',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'duplicate_source_posting'), NULL);
  PERFORM _check('reports', 'the ledger health view is clean overall',
    NOT EXISTS (SELECT 1 FROM v_ledger_health),
    (SELECT string_agg(DISTINCT check_name || ': ' || COALESCE(detail,''), ' | ') FROM v_ledger_health));
END $$;


-- ---------------------------------------------------------------------------
-- 13. Hardening — the tables underneath are closed too  (migration 002200)
--
-- Every test above proves the posting functions do the right thing. These
-- prove that nothing else can: a signed-in caller writing the business table
-- directly, exactly as PostgREST would, must be refused. The write is executed
-- as `authenticated` with a real claim, which is what a browser holding the
-- anon key actually is.
--
-- The attempt runs inside a plpgsql sub-block, so whether it is refused (the
-- point) or succeeds (a failure to report), nothing it did survives.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _direct_write_refused(_area TEXT, _name TEXT, _uid TEXT, _sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE v_msg TEXT;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    RAISE EXCEPTION 'CHETU_WRITE_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg = 'CHETU_WRITE_SUCCEEDED' THEN
    PERFORM _check(_area, _name, FALSE, 'the direct write was allowed through');
  ELSE
    PERFORM _check(_area, _name,
      position('must carry its journal' in v_msg) > 0,
      left(v_msg, 90));
  END IF;
END $fn$;

-- As above, but for a guard with its own wording rather than the journal one.
CREATE OR REPLACE FUNCTION _direct_write_refused_msg(_area TEXT, _name TEXT, _uid TEXT,
                                                     _sql TEXT, _expect TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE v_msg TEXT;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    RAISE EXCEPTION 'CHETU_WRITE_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg = 'CHETU_WRITE_SUCCEEDED' THEN
    PERFORM _check(_area, _name, FALSE, 'the direct write was allowed through');
  ELSE
    PERFORM _check(_area, _name,
      _expect IS NULL OR position(lower(_expect) in lower(v_msg)) > 0, left(v_msg, 90));
  END IF;
END $fn$;

-- Same shape, for a write that must still be allowed: nothing here is money.
CREATE OR REPLACE FUNCTION _direct_write_allowed(_area TEXT, _name TEXT, _uid TEXT, _sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE v_msg TEXT;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    RAISE EXCEPTION 'CHETU_WRITE_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM _check(_area, _name, v_msg = 'CHETU_WRITE_SUCCEEDED', left(v_msg, 90));
END $fn$;

-- A loan to attack, and one to settle, and one to write off. Created here as
-- the owner, which is what a migration or the seed is.
DO $$
DECLARE v_bank TEXT; n TEXT;
BEGIN
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';
  FOREACH n IN ARRAY ARRAY['HARD-A', 'HARD-B', 'HARD-C'] LOOP
    INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
      interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
      weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
      security_amount, security_balance, net_disbursed_amount, first_repayment_date,
      final_due_date, outstanding_balance, status)
    VALUES (format('LN-%s', n), format('CM-LN-2026-9%s', right(n, 1)), 'CLI-TEST-022', 'PRD-TEST-001',
      400000, 20.00, 'Flat Rate', 16, 80000, 480000, 30000, 16000, 4000, 2000, 60000, 60000,
      318000, CURRENT_DATE + 7, CURRENT_DATE + 112, 480000, 'Pending')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO loan_repayment_schedule (id, loan_id, week_number, due_date, installment_amount,
      principal_portion, interest_portion, paid_amount, remaining_balance, status)
    SELECT format('SCH-%s-%s', n, lpad(w::text, 2, '0')), format('LN-%s', n), w,
           CURRENT_DATE + w * 7, 30000, 25000, 5000, 0, 30000, 'Pending'
      FROM generate_series(1, 16) w
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- B and C are disbursed through the proper door, so they are real money.
  PERFORM disburse_loan('LN-HARD-B', v_bank);
  PERFORM disburse_loan('LN-HARD-C', v_bank);

  -- A member who has never been charged: the seed charged all twenty-four of
  -- its own, and record_member_fee is deliberately once-per-member.
  INSERT INTO clients (id, client_number, full_name, nin, gender, date_of_birth, occupation,
    phone_number, physical_address, village, parish, sub_county, district, group_id, branch_id,
    loan_officer_id, registered_by, date_registered, status, approval_status)
  VALUES ('CLI-HARD-001', 'CM-MB-2026-9001', 'Hardening Member', 'CM00000000009001', 'Female',
    DATE '1990-01-01', 'Trader', '0700009001', 'Buyende', 'Buyende', 'Buyende', 'Buyende',
    'Buyende', 'GRP-TEST-001', 'BR-TEST-001', '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333', CURRENT_DATE, 'Active', 'Approved')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- --- the bypasses the pre-flight review found open ------------------------
DO $$
BEGIN
  PERFORM _direct_write_refused('hardening',
    'a Loan Officer cannot mark a loan Active by hand',
    '33333333-3333-3333-3333-333333333333',
    $q$UPDATE loans SET status = 'Active', disbursed_at = now() WHERE id = 'LN-HARD-A'$q$);

  PERFORM _direct_write_refused('hardening',
    'a loan cannot be created already disbursed',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
        interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
        weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
        security_amount, security_balance, net_disbursed_amount, first_repayment_date,
        final_due_date, outstanding_balance, status, disbursed_at)
       VALUES ('LN-SMUGGLED', 'CM-LN-2026-9999', 'CLI-TEST-022', 'PRD-TEST-001', 400000, 20.00,
        'Flat Rate', 16, 80000, 480000, 30000, 16000, 4000, 2000, 60000, 60000, 318000,
        CURRENT_DATE + 7, CURRENT_DATE + 112, 480000, 'Active', now())$q$);

  PERFORM _direct_write_allowed('hardening',
    'a Pending loan can still be created, which is what approval does',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO loans (id, loan_number, client_id, product_id, principal_amount, interest_rate,
        interest_type, loan_period_weeks, total_interest_amount, total_amount_payable,
        weekly_installment, processing_fee_amount, crb_fee_amount, group_maintenance_fee,
        security_amount, security_balance, net_disbursed_amount, first_repayment_date,
        final_due_date, outstanding_balance, status)
       VALUES ('LN-APPROVED', 'CM-LN-2026-9998', 'CLI-TEST-022', 'PRD-TEST-001', 400000, 20.00,
        'Flat Rate', 16, 80000, 480000, 30000, 16000, 4000, 2000, 60000, 60000, 318000,
        CURRENT_DATE + 7, CURRENT_DATE + 112, 480000, 'Pending')$q$);

  PERFORM _direct_write_refused('hardening',
    'a Loan Officer cannot stamp disbursed_at by hand',
    '33333333-3333-3333-3333-333333333333',
    $q$UPDATE loans SET disbursed_at = now() WHERE id = 'LN-HARD-A'$q$);

  PERFORM _direct_write_refused('hardening',
    'a Loan Officer cannot insert a repayment receipt',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO loan_repayments (loan_id, schedule_id, client_id, amount_paid, payment_date,
        payment_method, collection_type, recorded_by)
       SELECT 'LN-HARD-B', s.id, 'CLI-TEST-022', 30000, CURRENT_DATE, 'Cash', 'Regular',
              '33333333-3333-3333-3333-333333333333'
         FROM loan_repayment_schedule s WHERE s.loan_id = 'LN-HARD-B' LIMIT 1$q$);

  PERFORM _direct_write_refused('hardening',
    'an Administrator cannot insert an expense',
    '11111111-1111-1111-1111-111111111111',
    $q$INSERT INTO expenses (expense_number, category, description, amount, expense_date,
        payment_method, recorded_by, branch_id)
       VALUES ('CM-EX-BYPASS', 'Transport', 'bypass', 5000, CURRENT_DATE, 'Cash',
               '11111111-1111-1111-1111-111111111111', 'BR-TEST-001')$q$);

  PERFORM _direct_write_refused('hardening',
    'an Administrator cannot settle a loan by hand',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loans SET status = 'Settled', settled_at = now(), settlement_amount = 100,
              outstanding_balance = 0 WHERE id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_refused('hardening',
    'an Administrator cannot write a loan off by hand',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loans SET status = 'Written Off', writeoff_at = now(), writeoff_amount = 100,
              outstanding_balance = 0 WHERE id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_refused('hardening',
    'nobody can move a loan balance by hand',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loans SET outstanding_balance = 1 WHERE id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_refused('hardening',
    'nobody can release security by hand',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loans SET security_balance = 0 WHERE id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_refused('hardening',
    'a Loan Officer cannot record a member fee',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO member_fees (client_id, admission_fee, passbook_fee, crb_fee, total_amount,
        payment_method, branch_id, collected_by)
       VALUES ('CLI-HARD-001', 5000, 5000, 0, 10000, 'Cash', 'BR-TEST-001',
               '33333333-3333-3333-3333-333333333333')$q$);

  PERFORM _direct_write_refused('hardening',
    'an Administrator cannot record a security refund',
    '11111111-1111-1111-1111-111111111111',
    $q$INSERT INTO loan_security_returns (loan_id, client_id, branch_id, return_date,
        return_amount, previous_amount, present_amount, duration_weeks, principal, interest, status)
       VALUES ('LN-HARD-B', 'CLI-TEST-022', 'BR-TEST-001', CURRENT_DATE, 60000, 60000, 0,
               16, 400000, 80000, 'Returned')$q$);

  -- The legacy register keeps its own wording: it is not "post this properly"
  -- but "this table is finished".
  DECLARE v_msg TEXT;
  BEGIN
    BEGIN
      PERFORM set_config('request.jwt.claims',
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', TRUE);
      EXECUTE 'SET LOCAL ROLE authenticated';
      INSERT INTO bank_transactions (transaction_number, transaction_type, category,
        description, amount, balance_after, reference_number)
      VALUES ('X', 'Deposit', 'test', 'test', 1, 1, 'X');
      RAISE EXCEPTION 'CHETU_WRITE_SUCCEEDED';
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM _check('hardening', 'the legacy bank register is closed to a signed-in caller',
      position('closed legacy register' in v_msg) > 0 OR position('permission denied' in v_msg) > 0,
      left(v_msg, 90));
  END;

  PERFORM _direct_write_refused('hardening',
    'nobody can forge a reversal record',
    '11111111-1111-1111-1111-111111111111',
    $q$INSERT INTO loan_reversals (loan_id, reversal_type, reference_number, amount, reason, reversed_by)
       VALUES ('LN-HARD-B', 'Disbursement', 'FORGED', 1, 'x',
               '11111111-1111-1111-1111-111111111111')$q$);

  PERFORM _direct_write_refused('hardening',
    'nobody can mark an instalment paid by hand',
    '33333333-3333-3333-3333-333333333333',
    $q$UPDATE loan_repayment_schedule SET paid_amount = installment_amount, remaining_balance = 0
        WHERE loan_id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_refused('hardening',
    'a disbursed loan cannot be deleted',
    '11111111-1111-1111-1111-111111111111',
    $q$DELETE FROM loans WHERE id = 'LN-HARD-B'$q$);

  -- ...and the writes that are not money must still go through.
  PERFORM _direct_write_allowed('hardening',
    'declaring a bad debt is still an ordinary update',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loans SET is_bad_debt = TRUE, bad_debt_comment = 'in arrears' WHERE id = 'LN-HARD-B'$q$);

  PERFORM _direct_write_allowed('hardening',
    'a Pending loan can still be deleted, which is how approval rolls back',
    '11111111-1111-1111-1111-111111111111',
    $q$DELETE FROM loans WHERE id = 'LN-HARD-A'$q$);

  PERFORM _direct_write_allowed('hardening',
    'correcting an instalment due date is still allowed',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE loan_repayment_schedule SET due_date = due_date
        WHERE loan_id = 'LN-HARD-B' AND week_number = 16$q$);
END $$;

-- --- settlement, atomically ------------------------------------------------
DO $$
DECLARE
  v_cash TEXT; v_closed TEXT; v_row RECORD;
  v_recv_before NUMERIC; v_recv_after NUMERIC;
  v_cash_before NUMERIC; v_cash_after NUMERIC;
  v_sec_before NUMERIC; v_sec_after NUMERIC; v_status TEXT; v_msg TEXT;
BEGIN
  SELECT id INTO v_cash   FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT id INTO v_closed FROM financial_accounts WHERE account_code = 'BANK-CLOSED';

  -- First: a settlement whose journal cannot post must leave nothing behind.
  BEGIN
    PERFORM settle_loan('LN-HARD-B', 300000, 'Cash', v_closed, 'should fail');
    PERFORM _check('hardening', 'a settlement to a closed account is refused', FALSE, 'it succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _check('hardening', 'a settlement to a closed account is refused', TRUE, left(SQLERRM, 70));
  END;
  SELECT status INTO v_status FROM loans WHERE id = 'LN-HARD-B';
  PERFORM _check('hardening', 'the failed settlement left the loan open', v_status <> 'Settled', v_status);
  PERFORM _check('hardening', 'the failed settlement left no receipt',
    NOT EXISTS (SELECT 1 FROM loan_repayments WHERE loan_id = 'LN-HARD-B'), NULL);
  PERFORM _check('hardening', 'the failed settlement left no paid instalment',
    NOT EXISTS (SELECT 1 FROM loan_repayment_schedule
                 WHERE loan_id = 'LN-HARD-B' AND status = 'Paid'), NULL);

  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT current_balance INTO v_cash_before FROM v_account_balances WHERE account_id = v_cash;
  SELECT natural_balance  INTO v_sec_before FROM v_account_balances WHERE account_code = 'SECURITY-HELD';

  SELECT * INTO v_row FROM settle_loan('LN-HARD-B', 480000, 'Cash', v_cash, 'cleared early');

  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT current_balance INTO v_cash_after  FROM v_account_balances WHERE account_id = v_cash;
  SELECT status INTO v_status FROM loans WHERE id = 'LN-HARD-B';

  PERFORM _check('hardening', 'settle_loan returns its receipt and journal',
                 v_row.repayment_id IS NOT NULL AND v_row.transaction_id IS NOT NULL, NULL);
  PERFORM _check('hardening', 'the settled loan is closed', v_status = 'Settled', v_status);
  PERFORM _check('hardening', 'the settlement journal balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines
      WHERE transaction_id = v_row.transaction_id) = 0, NULL);
  PERFORM _check('hardening', 'the cash received is the full settlement',
                 v_cash_after - v_cash_before = 480000, format('%s', v_cash_after - v_cash_before));
  PERFORM _check('hardening', 'only the principal leaves the receivable',
                 v_recv_before - v_recv_after = 400000, format('%s', v_recv_before - v_recv_after));
  PERFORM _check('hardening', 'the rest is recognised as interest',
                 v_row.interest_portion = 80000, format('%s', v_row.interest_portion));
  PERFORM _check('hardening', 'every instalment is closed',
    NOT EXISTS (SELECT 1 FROM loan_repayment_schedule
                 WHERE loan_id = 'LN-HARD-B' AND status <> 'Paid'), NULL);
  PERFORM _check('hardening', 'the security held is released with it',
                 v_row.security_released = 60000
                 AND (SELECT security_balance FROM loans WHERE id = 'LN-HARD-B') = 0, NULL);
  PERFORM _check_raises('hardening', 'a settled loan cannot be settled again',
    format('SELECT settle_loan(%L, 1000, %L, %L)', 'LN-HARD-B', 'Cash', v_cash),
    'already closed');
END $$;

-- --- write-off, atomically -------------------------------------------------
DO $$
DECLARE
  v_row RECORD; v_recv_before NUMERIC; v_recv_after NUMERIC; v_loss_before NUMERIC; v_loss_after NUMERIC;
BEGIN
  PERFORM _check_raises('hardening', 'a loan not declared bad cannot be written off',
    $q$SELECT write_off_loan('LN-HARD-C', 'no reason')$q$, 'bad debt');

  UPDATE loans SET is_bad_debt = TRUE WHERE id = 'LN-HARD-C';

  PERFORM _check_raises('hardening', 'a write-off without a reason is refused',
    $q$SELECT write_off_loan('LN-HARD-C', '   ')$q$, 'reason');

  SELECT current_balance INTO v_recv_before FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_loss_before FROM v_account_balances WHERE account_code = 'WRITEOFF-LOSS';

  SELECT * INTO v_row FROM write_off_loan('LN-HARD-C', 'Member deceased, no recovery');

  SELECT current_balance INTO v_recv_after FROM v_account_balances WHERE account_code = 'LOANS-RECEIVABLE';
  SELECT natural_balance  INTO v_loss_after FROM v_account_balances WHERE account_code = 'WRITEOFF-LOSS';

  PERFORM _check('hardening', 'write_off_loan returns its journal',
                 v_row.transaction_id IS NOT NULL, NULL);
  PERFORM _check('hardening', 'the written-off loan is closed with nothing outstanding',
    (SELECT status FROM loans WHERE id = 'LN-HARD-C') = 'Written Off'
    AND (SELECT outstanding_balance FROM loans WHERE id = 'LN-HARD-C') = 0, NULL);
  PERFORM _check('hardening', 'the write-off journal balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines
      WHERE transaction_id = v_row.transaction_id) = 0, NULL);
  PERFORM _check('hardening', 'only the principal is taken as a loss',
                 v_loss_after - v_loss_before = 400000
                 AND v_recv_before - v_recv_after = 400000,
                 format('loss %s, receivable %s', v_loss_after - v_loss_before,
                        v_recv_before - v_recv_after));
  PERFORM _check('hardening', 'the write-off is minuted against the loan',
    EXISTS (SELECT 1 FROM bad_loan_comments WHERE loan_id = 'LN-HARD-C'
             AND comment LIKE 'Written off:%'), NULL);
  PERFORM _check_raises('hardening', 'a written-off loan cannot be written off twice',
    $q$SELECT write_off_loan('LN-HARD-C', 'again')$q$, 'already written off');
END $$;

-- --- member fees and security refunds, the two paths never wired -----------
DO $$
DECLARE
  v_cash TEXT; v_row RECORD; v_again RECORD; v_inc_before NUMERIC; v_inc_after NUMERIC;
  v_sec_before NUMERIC; v_sec_after NUMERIC; v_ret RECORD; v_bank TEXT;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';
  SELECT id INTO v_bank FROM financial_accounts WHERE account_code = 'BANK-MAIN';

  SELECT natural_balance INTO v_inc_before FROM v_account_balances WHERE account_code = 'INC-FEE-ADMISSION';
  SELECT * INTO v_row FROM record_member_fee('CLI-HARD-001', v_cash, 5000, 5000, 0, 'Cash', NULL);
  SELECT natural_balance INTO v_inc_after FROM v_account_balances WHERE account_code = 'INC-FEE-ADMISSION';

  PERFORM _check('hardening', 'a member fee now posts its journal',
                 v_row.transaction_id IS NOT NULL AND NOT v_row.already_recorded, NULL);
  PERFORM _check('hardening', 'the admission fee reaches fee income',
                 v_inc_after - v_inc_before = 5000, format('%s', v_inc_after - v_inc_before));
  PERFORM _check('hardening', 'the member fee journal balances',
    (SELECT sum(signed_amount) FROM financial_transaction_lines
      WHERE transaction_id = v_row.transaction_id) = 0, NULL);

  SELECT * INTO v_again FROM record_member_fee('CLI-HARD-001', v_cash, 5000, 5000, 0, 'Cash', NULL);
  SELECT natural_balance INTO v_inc_after FROM v_account_balances WHERE account_code = 'INC-FEE-ADMISSION';
  PERFORM _check('hardening', 'charging the same member twice posts nothing',
                 v_again.already_recorded AND v_inc_after - v_inc_before = 5000, NULL);

  -- Security refund on a loan that still holds one.
  SELECT natural_balance INTO v_sec_before FROM v_account_balances WHERE account_code = 'SECURITY-HELD';
  SELECT * INTO v_ret FROM return_loan_security('LN-TEST-ATOMIC', 20000, v_bank);
  SELECT natural_balance INTO v_sec_after FROM v_account_balances WHERE account_code = 'SECURITY-HELD';

  PERFORM _check('hardening', 'a security refund now posts its journal',
                 v_ret.transaction_id IS NOT NULL, NULL);
  PERFORM _check('hardening', 'the liability falls by what was refunded',
                 v_sec_before - v_sec_after = 20000, format('%s', v_sec_before - v_sec_after));
  PERFORM _check('hardening', 'the loan keeps the rest of the security',
                 v_ret.remaining_security = 40000, format('%s', v_ret.remaining_security));
  PERFORM _check_raises('hardening', 'more security cannot be returned than is held',
    format('SELECT return_loan_security(%L, 999999, %L)', 'LN-TEST-ATOMIC', v_bank),
    'holds only');
END $$;

-- --- the new functions answer to the same permission model -----------------
DO $$
DECLARE v_cash TEXT;
BEGIN
  SELECT id INTO v_cash FROM financial_accounts WHERE account_code = 'CASH-HO';

  PERFORM _as('44444444-4444-4444-4444-444444444444');
  PERFORM _check_raises('hardening', 'an Auditor cannot settle a loan',
    format('SELECT settle_loan(%L, 1000, %L, %L)', 'LN-TEST-ATOMIC', 'Cash', v_cash),
    'Auditors cannot');
  PERFORM _check_raises('hardening', 'an Auditor cannot collect a member fee',
    format('SELECT record_member_fee(%L, %L, 5000, 5000)', 'CLI-TEST-020', v_cash),
    'Auditors cannot');
  PERFORM _check_raises('hardening', 'an Auditor cannot return security',
    format('SELECT return_loan_security(%L, 1000, %L)', 'LN-TEST-ATOMIC', v_cash),
    'Auditors cannot');

  PERFORM _as('33333333-3333-3333-3333-333333333333');
  PERFORM _check_raises('hardening', 'a Loan Officer cannot write a loan off',
    $q$SELECT write_off_loan('LN-TEST-ATOMIC', 'trying it on')$q$,
    'Only an Administrator');

  PERFORM _as('22222222-2222-2222-2222-222222222222');
  PERFORM _check_raises('hardening', 'a Branch Manager cannot write a loan off either',
    $q$SELECT write_off_loan('LN-TEST-ATOMIC', 'trying it on')$q$,
    'Only an Administrator');

  PERFORM _as(NULL);
END $$;

-- --- half a financial event is unreachable too -----------------------------
-- The other way round from the original bug: a journal posted for a business
-- record nothing else wrote. Each of these is now reached only by the atomic
-- function that owns it.
DO $$
DECLARE v_msg TEXT; fn TEXT; v_blocked INT := 0; v_total INT := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['post_disbursement', 'post_repayment', 'post_expense',
                            'post_member_fee', 'post_security_refund', 'post_writeoff'] LOOP
    v_total := v_total + 1;
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      EXECUTE format('SELECT %I(%L, %L)', fn, 'x', 'y');
      RAISE EXCEPTION 'CHETU_WRITE_SUCCEEDED';
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
      IF position('permission denied' in v_msg) > 0
         OR position('does not exist' in v_msg) > 0 THEN
        v_blocked := v_blocked + 1;
      END IF;
    END;
    EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM _check('hardening', 'no single-step posting is callable from a session',
                 v_blocked = v_total, format('%s of %s refused', v_blocked, v_total));
END $$;

-- ...while the standalone postings, which have no business row to be atomic
-- with, stay open to the Financial Ledger screen.
DO $$
DECLARE fn TEXT; v_open INT := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['post_capital_injection', 'post_internal_transfer',
                            'post_reconciliation_adjustment', 'post_opening_balance',
                            'reverse_financial_transaction'] LOOP
    IF has_function_privilege('authenticated',
         (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = fn LIMIT 1), 'EXECUTE') THEN
      v_open := v_open + 1;
    END IF;
  END LOOP;
  PERFORM _check('hardening', 'the standalone postings are still reachable',
                 v_open = 5, format('%s of 5', v_open));
END $$;

-- --- the system reset cannot be used against real money -------------------
-- Only the refusals are exercised: running the reset for real would empty the
-- database this suite is still asserting against.
DO $$
BEGIN
  PERFORM _as('33333333-3333-3333-3333-333333333333');
  PERFORM _check_raises('hardening', 'a Loan Officer cannot reset the system',
    $q$SELECT reset_operational_data('RESET ALL DATA')$q$, 'Only an Administrator');

  PERFORM _as('11111111-1111-1111-1111-111111111111');
  PERFORM _check_raises('hardening', 'the reset needs its exact confirmation phrase',
    $q$SELECT reset_operational_data('yes please')$q$, 'exact phrase');

  UPDATE settings SET financial_cutover_completed = TRUE WHERE id = 1;
  PERFORM _check_raises('hardening', 'the reset is refused once the cut-over is complete',
    $q$SELECT reset_operational_data('RESET ALL DATA')$q$, 'permanently disabled');
  UPDATE settings SET financial_cutover_completed = FALSE WHERE id = 1;

  PERFORM _as(NULL);
END $$;

-- --- and after all of that, the ledger is still whole ----------------------
DO $$
BEGIN
  PERFORM _check('hardening', 'reversal still works after hardening',
    (SELECT count(*) FROM financial_transactions WHERE entry_type = 'reversal') > 0,
    format('%s reversals', (SELECT count(*) FROM financial_transactions WHERE entry_type = 'reversal')));
  PERFORM _check('hardening', 'no member fee is left without a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'member_fee_without_journal'), NULL);
  PERFORM _check('hardening', 'no security refund is left without a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'security_refund_without_journal'), NULL);
  PERFORM _check('hardening', 'no write-off is left without a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health WHERE check_name = 'writeoff_without_journal'), NULL);
  PERFORM _check('hardening', 'the ledger health view is still clean',
    NOT EXISTS (SELECT 1 FROM v_ledger_health),
    (SELECT string_agg(DISTINCT check_name || ': ' || COALESCE(detail, ''), ' | ') FROM v_ledger_health));
END $$;


-- ---------------------------------------------------------------------------
-- 14. Savings — closed until it can be journalled  (migration 002300)
--
-- Savings is the one money-shaped module with no ledger integration. It has
-- never been used in production — 25 accounts, every one at zero, and not a
-- single transaction — and the code that existed could not be journalled, so
-- it is closed rather than half-wired. These prove it is closed at the
-- database, that the accounts already open are untouched by closing it, and
-- that nothing can slip through unnoticed if the guard is ever lifted.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO savings_accounts (id, account_number, client_id, account_type, balance, status)
  VALUES ('SAV-TEST-001', 'CM-SAV-9001', 'CLI-TEST-020', 'Individual', 0, 'Active'),
         ('SAV-TEST-002', 'CM-SAV-9002', 'CLI-TEST-021', 'Individual', 0, 'Active')
  ON CONFLICT (id) DO NOTHING;

  -- A row for the UPDATE and DELETE tests to aim at. On an empty table those
  -- statements touch nothing, a FOR EACH ROW guard never fires, and the test
  -- would pass while proving nothing. Written as the owner, which is the one
  -- context the guard lets through, and removed again below.
  INSERT INTO savings_transactions (id, transaction_number, account_id, transaction_type,
    amount, balance_after, payment_method, recorded_by, receipt_number)
  VALUES ('STX-TEST-LEGACY', 'CM-STX-9000', 'SAV-TEST-001', 'Deposit', 0, 0, 'Cash',
          '33333333-3333-3333-3333-333333333333', 'CM-SREC-9000')
  ON CONFLICT (id) DO NOTHING;
END $$;

DO $$
DECLARE v_accounts INT; v_balance NUMERIC; v_tx INT;
BEGIN
  SELECT count(*), COALESCE(sum(balance), 0) INTO v_accounts, v_balance FROM savings_accounts;
  SELECT count(*) INTO v_tx FROM savings_transactions;

  -- --- no signed-in role may record a deposit or a withdrawal --------------
  PERFORM _direct_write_refused_msg('savings',
    'a Loan Officer cannot record a savings deposit',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO savings_transactions (transaction_number, account_id, transaction_type,
        amount, balance_after, payment_method, recorded_by, receipt_number)
       VALUES ('CM-STX-9001', 'SAV-TEST-001', 'Deposit', 50000, 50000, 'Cash',
               '33333333-3333-3333-3333-333333333333', 'CM-SREC-9001')$q$,
    'Savings is not enabled');

  PERFORM _direct_write_refused_msg('savings',
    'a Branch Manager cannot record a savings withdrawal',
    '22222222-2222-2222-2222-222222222222',
    $q$INSERT INTO savings_transactions (transaction_number, account_id, transaction_type,
        amount, balance_after, payment_method, recorded_by, receipt_number)
       VALUES ('CM-STX-9002', 'SAV-TEST-001', 'Withdrawal', 10000, 0, 'Cash',
               '22222222-2222-2222-2222-222222222222', 'CM-SREC-9002')$q$,
    'Savings is not enabled');

  PERFORM _direct_write_refused_msg('savings',
    'an Administrator cannot record one either',
    '11111111-1111-1111-1111-111111111111',
    $q$INSERT INTO savings_transactions (transaction_number, account_id, transaction_type,
        amount, balance_after, payment_method, recorded_by, receipt_number)
       VALUES ('CM-STX-9003', 'SAV-TEST-001', 'Deposit', 50000, 50000, 'Cash',
               '11111111-1111-1111-1111-111111111111', 'CM-SREC-9003')$q$,
    'Savings is not enabled');

  PERFORM _direct_write_refused_msg('savings',
    'an Auditor cannot record one either',
    '44444444-4444-4444-4444-444444444444',
    $q$INSERT INTO savings_transactions (transaction_number, account_id, transaction_type,
        amount, balance_after, payment_method, recorded_by, receipt_number)
       VALUES ('CM-STX-9004', 'SAV-TEST-001', 'Deposit', 1, 1, 'Cash',
               '44444444-4444-4444-4444-444444444444', 'CM-SREC-9004')$q$,
    NULL);

  -- --- nor edit or delete what is already there ---------------------------
  PERFORM _direct_write_refused_msg('savings',
    'a posted savings transaction cannot be altered',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE savings_transactions SET amount = 1$q$, 'Savings is not enabled');
  PERFORM _direct_write_refused_msg('savings',
    'a posted savings transaction cannot be deleted',
    '11111111-1111-1111-1111-111111111111',
    $q$DELETE FROM savings_transactions$q$, 'Savings is not enabled');

  -- --- and the balance is frozen, which is the other way money could move --
  PERFORM _direct_write_refused_msg('savings',
    'a savings balance cannot be moved by hand',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE savings_accounts SET balance = 500000 WHERE id = 'SAV-TEST-001'$q$,
    'cannot be changed');

  PERFORM _direct_write_refused_msg('savings',
    'not even by a Loan Officer on their own member',
    '33333333-3333-3333-3333-333333333333',
    $q$UPDATE savings_accounts SET balance = balance + 1$q$, 'cannot be changed');

  DELETE FROM savings_transactions WHERE id = 'STX-TEST-LEGACY';
  v_tx := 0;

  -- --- closing savings did not disturb the accounts already open ----------
  PERFORM _check('savings', 'every savings account is still there',
    (SELECT count(*) FROM savings_accounts) = v_accounts,
    format('%s, was %s', (SELECT count(*) FROM savings_accounts), v_accounts));
  PERFORM _check('savings', 'every savings balance is unchanged, and zero',
    (SELECT COALESCE(sum(balance), 0) FROM savings_accounts) = v_balance AND v_balance = 0,
    format('%s', (SELECT COALESCE(sum(balance), 0) FROM savings_accounts)));
  PERFORM _check('savings', 'no savings transaction was created by any of that',
    (SELECT count(*) FROM savings_transactions) = v_tx, NULL);

  -- --- accounts are still readable, and still open for new members --------
  PERFORM _direct_write_allowed('savings',
    'opening an account for a new member still works — it holds nothing',
    '33333333-3333-3333-3333-333333333333',
    $q$INSERT INTO savings_accounts (id, account_number, client_id, account_type, balance, status)
       VALUES ('SAV-TEST-003', 'CM-SAV-9003', 'CLI-TEST-022', 'Individual', 0, 'Active')$q$);

  PERFORM _direct_write_allowed('savings',
    'an account can still be closed, which moves nothing',
    '11111111-1111-1111-1111-111111111111',
    $q$UPDATE savings_accounts SET status = 'Closed' WHERE id = 'SAV-TEST-002'$q$);
END $$;

-- --- the integration is genuinely absent, not silently half-present --------
DO $$
BEGIN
  PERFORM _check('savings', 'the ledger does not claim savings is ready',
                 private.savings_ledger_ready() = FALSE, NULL);
  PERFORM _check('savings', 'no savings posting function exists to be called',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND (p.proname LIKE 'record_savings%' OR p.proname LIKE 'post_savings%'
                        OR p.proname LIKE '%savings_deposit%'
                        OR p.proname LIKE '%savings_withdrawal%')),
    (SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE '%savings%'));
  PERFORM _check('savings', 'there is no savings liability account to post to yet',
    NOT EXISTS (SELECT 1 FROM financial_accounts WHERE account_code LIKE 'SAVINGS%'), NULL);
END $$;

-- --- and if the guard were ever lifted without the ledger, health says so --
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM _check('savings', 'no savings transaction is missing a journal',
    NOT EXISTS (SELECT 1 FROM v_ledger_health
                 WHERE check_name = 'savings_transaction_without_journal'), NULL);
  PERFORM _check('savings', 'no savings balance sits outside the ledger',
    NOT EXISTS (SELECT 1 FROM v_ledger_health
                 WHERE check_name = 'savings_balance_without_ledger'), NULL);

  -- Prove the check actually fires, by writing what only the owner can write
  -- and then putting it back. If this ever stopped reporting, the guard above
  -- would be the only thing standing between savings and a silent hole.
  UPDATE savings_accounts SET balance = 1 WHERE id = 'SAV-TEST-001';
  SELECT count(*) INTO v_rows FROM v_ledger_health
   WHERE check_name = 'savings_balance_without_ledger';
  PERFORM _check('savings', 'a savings balance outside the ledger is reported',
                 v_rows = 1, format('%s rows', v_rows));
  UPDATE savings_accounts SET balance = 0 WHERE id = 'SAV-TEST-001';

  INSERT INTO savings_transactions (transaction_number, account_id, transaction_type,
    amount, balance_after, payment_method, recorded_by, receipt_number)
  VALUES ('CM-STX-HEALTH', 'SAV-TEST-001', 'Deposit', 1, 1, 'Cash',
          '33333333-3333-3333-3333-333333333333', 'CM-SREC-HEALTH');
  SELECT count(*) INTO v_rows FROM v_ledger_health
   WHERE check_name = 'savings_transaction_without_journal';
  PERFORM _check('savings', 'a savings transaction with no journal is reported',
                 v_rows = 1, format('%s rows', v_rows));
  DELETE FROM savings_transactions WHERE transaction_number = 'CM-STX-HEALTH';

  PERFORM _check('savings', 'the ledger health view is clean again afterwards',
    NOT EXISTS (SELECT 1 FROM v_ledger_health),
    (SELECT string_agg(DISTINCT check_name, ' | ') FROM v_ledger_health));
END $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=============================== RESULTS ==============================='
SELECT area, count(*) FILTER (WHERE passed) AS passed, count(*) FILTER (WHERE NOT passed) AS failed
  FROM _verify_results GROUP BY area ORDER BY min(seq);
SELECT seq, area, name, COALESCE(detail, '') AS detail FROM _verify_results WHERE NOT passed ORDER BY seq;
SELECT count(*) FILTER (WHERE passed) AS total_passed,
       count(*) FILTER (WHERE NOT passed) AS total_failed FROM _verify_results;
