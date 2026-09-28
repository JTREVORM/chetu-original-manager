-- ===========================================================================
-- Verification seed: production's shape, reproduced
-- ===========================================================================
-- Mirrors the live Chetu dataset as at the audit: one branch, three staff,
-- 25 members, 16 loans (15 disbursed), 26 receipts, 24 member-fee records and
-- the two capital deposits. The aggregate control totals it produces are the
-- ones the backfill must reconcile:
--
--   principal disbursed   6,600,000      collected        851,100
--   net cash to members   5,250,000      member fees      240,000
--   loan fees charged       360,000      capital        2,090,000
--   security withheld       990,000
--
-- Per-week principal/interest portions here divide evenly, where production
-- rounds them to the nearest 100. The collected split therefore differs from
-- production by a few hundred shillings; that is expected and is called out in
-- the report. What this seed proves is that the logic reconciles, whatever the
-- rounding — the migration's own assertions check the real figures on apply.
--
-- Run against a scratch database only. Never against a real project.
-- ===========================================================================

SET session_replication_role = replica;   -- business-day guards off while seeding

-- --- staff -----------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@chetu.test'),
  ('22222222-2222-2222-2222-222222222222', 'manager@chetu.test'),
  ('33333333-3333-3333-3333-333333333333', 'officer@chetu.test'),
  ('44444444-4444-4444-4444-444444444444', 'auditor@chetu.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.branches (id, branch_name, branch_code, status, branch_type)
VALUES ('BR-TEST-001', 'Buyende', 'BR-001', 'Active', 'Main Branch')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role, status, branch_ids, primary_branch_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@chetu.test',   'Test Administrator', 'Administrator', 'Active', ARRAY['BR-TEST-001'], 'BR-TEST-001'),
  ('22222222-2222-2222-2222-222222222222', 'manager@chetu.test', 'Test Branch Manager','Branch Manager','Active', ARRAY['BR-TEST-001'], 'BR-TEST-001'),
  ('33333333-3333-3333-3333-333333333333', 'officer@chetu.test', 'Test Loan Officer',  'Loan Officer',  'Active', ARRAY['BR-TEST-001'], 'BR-TEST-001'),
  ('44444444-4444-4444-4444-444444444444', 'auditor@chetu.test', 'Test Auditor',       'Auditor',       'Active', ARRAY['BR-TEST-001'], 'BR-TEST-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_groups (id, group_name, group_code, branch_id, loan_officer_id, status, approval_status, meeting_day)
VALUES ('GRP-TEST-001', 'Buyende Group A', 'CM-GRP-001', 'BR-TEST-001',
        '33333333-3333-3333-3333-333333333333', 'Active', 'Approved', 'Thursday')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.loan_products
  (id, product_name, description, interest_rate, interest_type, processing_fee_percentage,
   penalty_rate, min_amount, max_amount, min_weeks, max_weeks, status)
VALUES ('PRD-TEST-001', 'Group Business Loan', 'Weekly group loan', 20.00, 'Flat Rate', 4.00,
        1.00, 100000, 5000000, 8, 24, 'Active')
ON CONFLICT (id) DO NOTHING;

-- --- members ---------------------------------------------------------------
INSERT INTO public.clients (
  id, client_number, full_name, nin, gender, date_of_birth, occupation, phone_number,
  physical_address, village, parish, sub_county, district,
  group_id, branch_id, loan_officer_id, registered_by, date_registered,
  status, approval_status, created_at)
SELECT
  format('CLI-TEST-%s', lpad(n::text, 3, '0')),
  format('CM-MB-2026-%s', lpad(n::text, 4, '0')),
  format('Test Member %s', n),
  format('CM%014s', n), CASE WHEN n % 2 = 0 THEN 'Female' ELSE 'Male' END,
  DATE '1990-01-01' + n, 'Trader', format('070000%04s', n),
  'Buyende', 'Buyende', 'Buyende', 'Buyende', 'Buyende',
  'GRP-TEST-001', 'BR-TEST-001',
  '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
  DATE '2026-09-06', 'Active', 'Approved', TIMESTAMPTZ '2026-09-06 08:00:00+00'
FROM generate_series(1, 25) n
ON CONFLICT (id) DO NOTHING;

-- --- member fees: 24 members charged 5,000 + 5,000, all cash ---------------
INSERT INTO public.member_fees
  (id, client_id, admission_fee, passbook_fee, crb_fee, total_amount, payment_method,
   receipt_number, branch_id, collected_by, created_at)
SELECT
  format('FEE-TEST-%s', lpad(n::text, 3, '0')),
  format('CLI-TEST-%s', lpad(n::text, 3, '0')),
  5000, 5000, 0, 10000, 'Cash',
  format('CM-MFR-2026-%s', lpad(n::text, 4, '0')), 'BR-TEST-001',
  '33333333-3333-3333-3333-333333333333', TIMESTAMPTZ '2026-09-07 09:00:00+00'
FROM generate_series(1, 24) n
ON CONFLICT (id) DO NOTHING;

-- --- capital: the two historical deposits ----------------------------------
INSERT INTO public.bank_transactions
  (id, transaction_number, transaction_type, category, description, amount, balance_after,
   reference_number, transaction_date, branch_id, recorded_by, created_at)
VALUES
  ('BT-TEST-001', 'CM-TX-2026-0001', 'Deposit', 'Capital Equity Injection', 'Cash Deposit',
   2000000, 2000000, '001', DATE '2026-09-07', 'BR-TEST-001',
   '11111111-1111-1111-1111-111111111111', TIMESTAMPTZ '2026-09-07 12:09:27+00'),
  ('BT-TEST-002', 'CM-TX-2026-0002', 'Deposit', 'Capital Equity Injection', 'Cash at hand',
   90000, 2090000, '002', DATE '2026-09-07', 'BR-TEST-001',
   '11111111-1111-1111-1111-111111111111', TIMESTAMPTZ '2026-09-07 12:16:51+00')
ON CONFLICT (id) DO NOTHING;

-- --- loans -----------------------------------------------------------------
-- Principals and terms copied from production. Loan 16 is approved but not
-- disbursed, exactly as CM-LN-2026-0016 is.
CREATE TEMP TABLE _seed_loans (seq INT, principal NUMERIC, weeks INT, first_due DATE, disbursed BOOLEAN);
INSERT INTO _seed_loans VALUES
  ( 2, 300000, 16, DATE '2026-09-14', TRUE),
  ( 3, 500000, 16, DATE '2026-09-14', TRUE),
  ( 4, 500000, 16, DATE '2026-09-15', TRUE),
  ( 5, 400000, 16, DATE '2026-09-18', TRUE),
  ( 6, 500000, 16, DATE '2026-09-18', TRUE),
  ( 7, 400000, 16, DATE '2026-09-18', TRUE),
  ( 8, 300000, 16, DATE '2026-09-18', TRUE),
  ( 9, 500000, 16, DATE '2026-09-18', TRUE),
  (10, 500000, 16, DATE '2026-09-18', TRUE),
  (11, 500000, 23, DATE '2026-09-24', TRUE),
  (12, 400000, 16, DATE '2026-09-24', TRUE),
  (13, 500000, 16, DATE '2026-09-26', TRUE),
  (14, 500000, 16, DATE '2026-09-29', TRUE),
  (15, 500000, 16, DATE '2026-09-29', TRUE),
  (16, 500000, 16, DATE '2026-09-29', FALSE),
  (17, 300000, 16, DATE '2026-09-30', TRUE);

INSERT INTO public.loans (
  id, loan_number, client_id, product_id, principal_amount, interest_rate, interest_type,
  loan_period_weeks, total_interest_amount, total_amount_payable, weekly_installment,
  processing_fee_amount, crb_fee_amount, group_maintenance_fee, security_amount,
  security_balance, net_disbursed_amount, first_repayment_date, final_due_date,
  outstanding_balance, completion_percentage, status, approved_by, disbursed_by,
  disbursed_at, created_at)
SELECT
  format('LN-TEST-%s', lpad(seq::text, 3, '0')),
  format('CM-LN-2026-%s', lpad(seq::text, 4, '0')),
  format('CLI-TEST-%s', lpad(seq::text, 3, '0')),
  'PRD-TEST-001', principal, 20.00, 'Flat Rate', weeks,
  principal * 0.20, principal * 1.20, round(principal * 1.20 / weeks, 2),
  principal * 0.04, principal * 0.01, 2000, principal * 0.15,
  principal * 0.15,
  principal - principal * 0.04 - principal * 0.01 - 2000 - principal * 0.15,
  first_due, first_due + (weeks - 1) * 7,
  principal * 1.20, 0.00,
  CASE WHEN disbursed THEN 'Active' ELSE 'Pending' END,
  '11111111-1111-1111-1111-111111111111',
  CASE WHEN disbursed THEN '33333333-3333-3333-3333-333333333333'::uuid END,
  CASE WHEN disbursed THEN (first_due - 3)::timestamptz + INTERVAL '12 hours' END,
  (first_due - 5)::timestamptz
FROM _seed_loans
ON CONFLICT (id) DO NOTHING;

-- --- instalment schedule ---------------------------------------------------
-- Production rounds to whole hundreds of shillings, which matters more than it
-- looks: the repayment-allocation backfill splits each receipt by its
-- instalment's principal/interest ratio, so a schedule built on an exact
-- even split (ratio a flat 1/1.2) hands the backfill a different ratio from
-- the one production holds. Seeding the even split understated interest
-- income by UGX 1,050 across the 26 receipts and overstated Loans Receivable
-- by the same, which made the harness disagree with production on the very
-- opening balances it exists to prove.
--
-- The rule, read back off production and reproduced here exactly:
--
--   * the instalment and the interest are each floored to a whole 100;
--   * the leftover hundreds are handed to the EARLIEST weeks, one each;
--   * principal is whatever the instalment has left after interest.
--
-- So the earliest weeks — the only ones Chetu's 26 receipts have reached —
-- carry the higher interest and the lower principal, exactly as production
-- does, and each column still sums to the loan's own total.
INSERT INTO public.loan_repayment_schedule
  (id, loan_id, week_number, due_date, installment_amount, principal_portion,
   interest_portion, paid_amount, remaining_balance, status)
SELECT
  format('SCH-TEST-%s-%s', lpad(s.seq::text, 3, '0'), lpad(w::text, 2, '0')),
  format('LN-TEST-%s', lpad(s.seq::text, 3, '0')),
  w, s.first_due + (w - 1) * 7,
  b.inst,
  b.inst - b.intr,
  b.intr,
  0, 0, 'Pending'
FROM _seed_loans s,
     LATERAL generate_series(1, s.weeks) w,
     LATERAL (SELECT
       floor(s.principal * 1.20 / s.weeks / 100) * 100 AS inst_base,
       (s.principal * 1.20 - floor(s.principal * 1.20 / s.weeks / 100) * 100 * s.weeks) / 100 AS inst_extra,
       floor(s.principal * 0.20 / s.weeks / 100) * 100 AS int_base,
       (s.principal * 0.20 - floor(s.principal * 0.20 / s.weeks / 100) * 100 * s.weeks) / 100 AS int_extra
     ) r,
     LATERAL (SELECT
       r.inst_base + CASE WHEN w <= r.inst_extra THEN 100 ELSE 0 END AS inst,
       r.int_base  + CASE WHEN w <= r.int_extra  THEN 100 ELSE 0 END AS intr
     ) b
ON CONFLICT (id) DO NOTHING;

-- --- receipts --------------------------------------------------------------
-- The 26 production receipts, by loan and date.
CREATE TEMP TABLE _seed_payments (seq INT, pay_date DATE, amount NUMERIC, ord INT);
INSERT INTO _seed_payments VALUES
  ( 2, DATE '2026-09-11',  22500, 1), ( 3, DATE '2026-09-11',  37500, 2),
  ( 4, DATE '2026-09-17',  37500, 3), ( 5, DATE '2026-09-17',  30000, 4),
  ( 7, DATE '2026-09-17',  30000, 5), ( 6, DATE '2026-09-17',  37500, 6),
  ( 9, DATE '2026-09-17',  37500, 7), ( 8, DATE '2026-09-17',  22500, 8),
  (10, DATE '2026-09-17',  37500, 9), (11, DATE '2026-09-22',  26100, 10),
  (12, DATE '2026-09-22',  30000, 11), ( 3, DATE '2026-09-23',  37500, 12),
  ( 2, DATE '2026-09-23',  22500, 13), ( 4, DATE '2026-09-23',  37500, 14),
  (10, DATE '2026-09-24',  37500, 15), ( 9, DATE '2026-09-24',  37500, 16),
  ( 6, DATE '2026-09-24',  37500, 17), ( 8, DATE '2026-09-24',  22500, 18),
  ( 7, DATE '2026-09-24',  30000, 19), ( 5, DATE '2026-09-24',  30000, 20),
  (10, DATE '2026-09-24',  37500, 21), ( 9, DATE '2026-09-24',  37500, 22),
  ( 6, DATE '2026-09-24',  37500, 23), ( 3, DATE '2026-09-25',  37500, 24),
  ( 2, DATE '2026-09-25',  22500, 25), (13, DATE '2026-09-25',  37500, 26);

-- Apply each payment to the oldest unpaid instalment, which is the rule
-- `allocatePayment` has always used, then link the receipt to that instalment.
DO $$
DECLARE
  p        RECORD;
  v_sched  TEXT;
  v_owed   NUMERIC;
  v_inst   NUMERIC;
BEGIN
  FOR p IN SELECT * FROM _seed_payments ORDER BY ord LOOP
    SELECT s.id, s.installment_amount - s.paid_amount, s.installment_amount
      INTO v_sched, v_owed, v_inst
      FROM public.loan_repayment_schedule s
     WHERE s.loan_id = format('LN-TEST-%s', lpad(p.seq::text, 3, '0'))
       AND s.installment_amount - s.paid_amount > 0
     ORDER BY s.due_date, s.week_number
     LIMIT 1;

    UPDATE public.loan_repayment_schedule
       SET paid_amount = paid_amount + p.amount,
           remaining_balance = GREATEST(0, installment_amount - (paid_amount + p.amount)),
           status = CASE WHEN installment_amount - (paid_amount + p.amount) < 1
                         THEN 'Paid' ELSE 'Partially Paid' END,
           paid_at = p.pay_date
     WHERE id = v_sched;

    INSERT INTO public.loan_repayments
      (id, repayment_number, receipt_number, loan_id, schedule_id, client_id,
       amount_paid, payment_date, payment_method, collection_type, recorded_by, created_at)
    VALUES
      (format('RP-TEST-%s', lpad(p.ord::text, 3, '0')),
       format('CM-RP-2026-%s', lpad(p.ord::text, 4, '0')),
       format('CM-REC-2026-%s', lpad(p.ord::text, 4, '0')),
       format('LN-TEST-%s', lpad(p.seq::text, 3, '0')),
       v_sched,
       format('CLI-TEST-%s', lpad(p.seq::text, 3, '0')),
       p.amount, p.pay_date, 'Cash', 'Regular',
       '33333333-3333-3333-3333-333333333333', p.pay_date::timestamptz + INTERVAL '12 hours');
  END LOOP;
END $$;

-- Roll the loan totals forward the way the application does.
UPDATE public.loans l
   SET outstanding_balance = l.total_amount_payable - COALESCE(s.paid, 0),
       completion_percentage = LEAST(100, round(COALESCE(s.paid, 0) / l.total_amount_payable * 100)),
       status = CASE WHEN l.status = 'Pending' THEN 'Pending'
                     WHEN COALESCE(s.paid, 0) = 0 THEN 'Active'
                     WHEN l.total_amount_payable - COALESCE(s.paid, 0) <= 0 THEN 'Fully Paid'
                     ELSE 'Partially Paid' END
  FROM (SELECT loan_id, sum(paid_amount) paid FROM public.loan_repayment_schedule GROUP BY loan_id) s
 WHERE s.loan_id = l.id;

SET session_replication_role = origin;

-- --- what the seed produced ------------------------------------------------
SELECT 'principal_disbursed' AS control, sum(principal_amount) AS value FROM public.loans WHERE disbursed_at IS NOT NULL
UNION ALL SELECT 'net_cash_to_members', sum(net_disbursed_amount) FROM public.loans WHERE disbursed_at IS NOT NULL
UNION ALL SELECT 'loan_fees_charged', sum(processing_fee_amount + crb_fee_amount + group_maintenance_fee) FROM public.loans WHERE disbursed_at IS NOT NULL
UNION ALL SELECT 'security_withheld', sum(security_amount) FROM public.loans WHERE disbursed_at IS NOT NULL
UNION ALL SELECT 'total_collected', sum(amount_paid) FROM public.loan_repayments
UNION ALL SELECT 'member_fees', sum(total_amount) FROM public.member_fees
UNION ALL SELECT 'capital', sum(amount) FROM public.bank_transactions
ORDER BY control;
