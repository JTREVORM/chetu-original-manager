-- ===========================================================================
-- CHETU MICROFINANCE — reporting views
-- ===========================================================================
-- One source of truth. Before this, the same figure was computed three times:
-- in DatabaseContext's derived aggregates, again in branchMetrics.ts, and
-- again inline in Reports.tsx — with different period boundaries, so the
-- Dashboard's "this month" and a branch card's "this month" were different
-- numbers by construction.
--
-- Everything below is derived. No view reads a stored balance.
--
-- All views are `security_invoker`, so row level security follows the caller
-- through: a Branch Manager reading v_money_position sees their branch, not
-- the institution.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Account balances. The answer to "how much is in this account?".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_account_balances
WITH (security_invoker = on) AS
SELECT
  a.id                AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.account_class,
  a.branch_id,
  b.branch_name,
  a.institution,
  a.account_reference,
  a.currency,
  a.status,
  a.is_system,
  a.is_legacy,
  a.opening_balance,
  a.opening_balance_date,
  COALESCE(m.debits,  0)                                   AS total_debits,
  COALESCE(m.credits, 0)                                   AS total_credits,
  -- Inflow and outflow read naturally for a cash account: money arriving is a
  -- debit, money leaving is a credit. Income and liability accounts are the
  -- other way round, which the class tells the reader.
  CASE WHEN a.account_class IN ('asset_liquid', 'asset_receivable', 'expense')
       THEN COALESCE(m.debits, 0) ELSE COALESCE(m.credits, 0) END AS total_inflows,
  CASE WHEN a.account_class IN ('asset_liquid', 'asset_receivable', 'expense')
       THEN COALESCE(m.credits, 0) ELSE COALESCE(m.debits, 0) END AS total_outflows,
  a.opening_balance + COALESCE(m.net, 0)                   AS current_balance,
  -- Signed so that a credit-natured account reads positive when it should.
  CASE WHEN a.account_class IN ('asset_liquid', 'asset_receivable', 'expense')
       THEN a.opening_balance + COALESCE(m.net, 0)
       ELSE -(a.opening_balance + COALESCE(m.net, 0)) END  AS natural_balance,
  m.last_transaction_at,
  m.last_transaction_date,
  COALESCE(m.posting_count, 0)                             AS posting_count,
  a.sort_order
FROM public.financial_accounts a
LEFT JOIN public.branches b ON b.id = a.branch_id
LEFT JOIN LATERAL (
  SELECT
    sum(l.amount) FILTER (WHERE l.direction = 'debit')  AS debits,
    sum(l.amount) FILTER (WHERE l.direction = 'credit') AS credits,
    sum(l.signed_amount)                                AS net,
    max(t.created_at)                                   AS last_transaction_at,
    max(t.transaction_date)                             AS last_transaction_date,
    count(*)                                            AS posting_count
  FROM public.financial_transaction_lines l
  JOIN public.financial_transactions t ON t.id = l.transaction_id
  WHERE l.account_id = a.id
) m ON TRUE;

COMMENT ON VIEW public.v_account_balances IS
  'Derived balance per account: opening_balance + sum of posted lines. Never a stored total.';

-- ---------------------------------------------------------------------------
-- Loan portfolio. Principal and interest are split from the schedule, which
-- the audit verified reconciles exactly against every stored loan total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_loan_portfolio
WITH (security_invoker = on) AS
SELECT
  l.id                       AS loan_id,
  l.loan_number,
  l.client_id,
  c.full_name                AS client_name,
  c.client_number,
  c.branch_id,
  br.branch_name,
  COALESCE(c.loan_officer_id, g.loan_officer_id) AS officer_id,
  g.id                       AS group_id,
  g.group_name,
  l.product_id,
  p.product_name,
  l.status,
  l.is_bad_debt,
  l.writeoff_status,
  l.principal_amount,
  l.total_interest_amount,
  l.total_amount_payable,
  l.processing_fee_amount + l.crb_fee_amount + l.group_maintenance_fee AS total_fees_charged,
  l.security_amount,
  l.security_balance,
  l.net_disbursed_amount,
  l.disbursed_at,
  l.first_repayment_date,
  l.final_due_date,
  l.loan_period_weeks,
  round(COALESCE(s.principal_paid, 0), 2)                        AS principal_collected,
  round(COALESCE(s.interest_paid, 0), 2)                         AS interest_collected,
  round(COALESCE(s.total_paid, 0), 2)                            AS total_collected,
  -- Principal is rounded; interest takes the remainder, so the two always sum
  -- back to the loan's total outstanding with no stray shilling.
  GREATEST(0, round(COALESCE(s.principal_due, 0) - COALESCE(s.principal_paid, 0), 2)) AS principal_outstanding,
  GREATEST(0, round(COALESCE(s.total_due, 0) - COALESCE(s.total_paid, 0), 2)
            - round(COALESCE(s.principal_due, 0) - COALESCE(s.principal_paid, 0), 2)) AS interest_outstanding,
  round(GREATEST(0, COALESCE(s.total_due, 0) - COALESCE(s.total_paid, 0)), 2)         AS total_outstanding,
  l.outstanding_balance      AS stored_outstanding_balance,
  round(COALESCE(o.overdue_total, 0), 2)     AS overdue_amount,
  round(COALESCE(o.overdue_principal, 0), 2) AS overdue_principal,
  round(COALESCE(o.overdue_interest, 0), 2)  AS overdue_interest,
  COALESCE(o.days_past_due, 0)      AS days_past_due,
  CASE
    WHEN COALESCE(o.days_past_due, 0) = 0  THEN 'Current'
    WHEN o.days_past_due BETWEEN 1  AND 7  THEN '1-7'
    WHEN o.days_past_due BETWEEN 8  AND 30 THEN '8-30'
    WHEN o.days_past_due BETWEEN 31 AND 60 THEN '31-60'
    WHEN o.days_past_due BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS par_bucket,
  l.created_at
FROM public.loans l
JOIN public.clients c        ON c.id = l.client_id
LEFT JOIN public.client_groups g ON g.id = c.group_id
LEFT JOIN public.branches br ON br.id = c.branch_id
LEFT JOIN public.loan_products p ON p.id = l.product_id
LEFT JOIN LATERAL (
  SELECT
    sum(sc.principal_portion) AS principal_due,
    sum(sc.interest_portion)  AS interest_due,
    sum(sc.installment_amount) AS total_due,
    sum(sc.paid_amount)       AS total_paid,
    sum(CASE WHEN sc.installment_amount > 0
             THEN sc.paid_amount * sc.principal_portion / sc.installment_amount ELSE 0 END) AS principal_paid,
    sum(CASE WHEN sc.installment_amount > 0
             THEN sc.paid_amount * sc.interest_portion  / sc.installment_amount ELSE 0 END) AS interest_paid
  FROM public.loan_repayment_schedule sc WHERE sc.loan_id = l.id
) s ON TRUE
LEFT JOIN LATERAL (
  SELECT
    sum(GREATEST(0, sc.installment_amount - sc.paid_amount)) AS overdue_total,
    sum(GREATEST(0, sc.principal_portion - CASE WHEN sc.installment_amount > 0
        THEN sc.paid_amount * sc.principal_portion / sc.installment_amount ELSE 0 END)) AS overdue_principal,
    sum(GREATEST(0, sc.interest_portion - CASE WHEN sc.installment_amount > 0
        THEN sc.paid_amount * sc.interest_portion / sc.installment_amount ELSE 0 END))  AS overdue_interest,
    (CURRENT_DATE - min(sc.due_date) FILTER (WHERE sc.installment_amount - sc.paid_amount > 0)) AS days_past_due
  FROM public.loan_repayment_schedule sc
  WHERE sc.loan_id = l.id AND sc.due_date <= CURRENT_DATE
) o ON TRUE;

COMMENT ON VIEW public.v_loan_portfolio IS
  'Per-loan position with principal and interest separated, arrears and PAR bucket. Derived from the instalment schedule.';

-- ---------------------------------------------------------------------------
-- Money Position. The dashboard panel, and the answer to the question this
-- whole programme exists for.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_money_position
WITH (security_invoker = on) AS
WITH liquid AS (
  SELECT account_type, branch_id, current_balance
  FROM public.v_account_balances
  WHERE account_class = 'asset_liquid' AND status <> 'Closed'
),
book AS (
  SELECT
    round(COALESCE(sum(principal_outstanding), 0), 2) AS principal_outstanding,
    round(COALESCE(sum(interest_outstanding),  0), 2) AS interest_outstanding,
    round(COALESCE(sum(overdue_amount),        0), 2) AS overdue_portfolio,
    round(COALESCE(sum(overdue_principal),     0), 2) AS overdue_principal,
    round(COALESCE(sum(total_outstanding) FILTER (WHERE days_past_due > 30), 0), 2) AS par30_value,
    count(*) FILTER (WHERE days_past_due > 30)  AS par30_count,
    count(*)                                     AS active_loans,
    count(DISTINCT client_id)                    AS active_borrowers
  FROM public.v_loan_portfolio
  WHERE status IN ('Active', 'Partially Paid', 'Overdue')
),
equity AS (
  SELECT
    COALESCE(sum(natural_balance) FILTER (WHERE account_class = 'equity'),    0) AS capital_introduced,
    COALESCE(sum(natural_balance) FILTER (WHERE account_class = 'income'),    0) AS total_income,
    COALESCE(sum(natural_balance) FILTER (WHERE account_class = 'expense'),   0) AS total_expenses,
    COALESCE(sum(natural_balance) FILTER (WHERE account_class = 'liability'), 0) AS total_liabilities,
    -- Taken from the ledger itself, not from the loan book, so the accounting
    -- figures below tie to the trial balance exactly. Where the two records
    -- disagree, `v_ledger_health` says so rather than either one absorbing it.
    COALESCE(sum(natural_balance) FILTER (WHERE account_class = 'asset_receivable'), 0) AS ledger_receivable
  FROM public.v_account_balances
)
SELECT
  COALESCE((SELECT sum(current_balance) FROM liquid
             WHERE account_type IN ('cash_at_hand', 'cashier_till', 'branch_cash')), 0) AS cash_at_hand,
  COALESCE((SELECT sum(current_balance) FROM liquid WHERE account_type = 'bank'), 0)    AS cash_at_bank,
  COALESCE((SELECT sum(current_balance) FROM liquid
             WHERE account_type IN ('mobile_money', 'merchant')), 0)                    AS mobile_money,
  COALESCE((SELECT sum(current_balance) FROM liquid WHERE account_type = 'other'), 0)   AS unclassified_legacy,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)                                AS total_available_liquidity,
  book.principal_outstanding      AS outstanding_principal,
  book.interest_outstanding       AS interest_receivable,
  0::NUMERIC                      AS penalties_receivable,   -- no penalty logic in production yet
  book.principal_outstanding + book.interest_outstanding AS total_loan_portfolio,
  book.overdue_portfolio,
  book.overdue_principal,
  book.par30_value,
  book.par30_count,
  book.active_loans,
  book.active_borrowers,
  equity.capital_introduced,
  equity.total_income,
  equity.total_expenses,
  equity.total_income - equity.total_expenses            AS net_result,
  equity.total_liabilities                               AS security_held,
  -- Two different, both-correct answers to "what is Chetu worth?".
  --
  -- `net_worth_ledger` is the accounting answer: it ties exactly to the trial
  -- balance and the Statement of Financial Position, and counts only interest
  -- actually collected, because that is when Chetu recognises it.
  --
  -- `total_financial_position` is the management answer: it adds the interest
  -- members are contracted to pay but have not yet. That figure is real and
  -- worth seeing, but it is not yet income, so the two deliberately differ —
  -- by exactly `interest_receivable`, which is published here so the gap can
  -- always be explained rather than discovered.
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + equity.ledger_receivable                                             AS total_assets_ledger,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + equity.ledger_receivable - equity.total_liabilities                  AS net_worth_ledger,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + book.principal_outstanding + book.interest_outstanding               AS total_assets,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + book.principal_outstanding + book.interest_outstanding
    - equity.total_liabilities                                             AS total_financial_position
FROM book, equity;

COMMENT ON VIEW public.v_money_position IS
  'Where Chetu''s money is right now. Liquidity by location, money with borrowers, capital, income, expenses. One row.';

-- ---------------------------------------------------------------------------
-- Repayment allocation — every receipt with its principal/interest split.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_repayment_allocation
WITH (security_invoker = on) AS
SELECT
  r.id AS repayment_id, r.repayment_number, r.receipt_number,
  r.loan_id, l.loan_number, r.client_id, c.full_name AS client_name,
  c.branch_id, br.branch_name,
  COALESCE(c.loan_officer_id, g.loan_officer_id) AS officer_id,
  r.payment_date, r.payment_method, r.collection_type,
  r.amount_paid, r.principal_portion, r.interest_portion,
  r.penalty_portion, r.fee_portion, r.security_amount,
  r.allocation_source, r.schedule_id, sc.week_number, sc.due_date,
  CASE WHEN sc.due_date IS NOT NULL AND r.payment_date > sc.due_date THEN TRUE ELSE FALSE END AS was_overdue,
  r.recorded_by, r.business_day_id, r.created_at,
  ft.id AS journal_id, ft.transaction_number AS journal_number
FROM public.loan_repayments r
LEFT JOIN public.loans l         ON l.id = r.loan_id
LEFT JOIN public.clients c       ON c.id = r.client_id
LEFT JOIN public.client_groups g ON g.id = c.group_id
LEFT JOIN public.branches br     ON br.id = c.branch_id
LEFT JOIN public.loan_repayment_schedule sc ON sc.id = r.schedule_id
LEFT JOIN public.financial_transactions ft
       ON ft.repayment_id = r.id AND ft.status <> 'reversal';

-- ---------------------------------------------------------------------------
-- Transaction audit — the ledger, flattened for the Transactions tab.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_transaction_audit
WITH (security_invoker = on) AS
SELECT
  t.id, t.transaction_number, t.transaction_date, t.created_at,
  t.entry_type, t.status, t.description, t.reference_number,
  t.branch_id, b.branch_name,
  t.loan_id, l.loan_number, t.repayment_id, rp.receipt_number,
  t.expense_id, e.expense_number, t.member_fee_id, t.client_id, cl.full_name AS client_name,
  t.approval_status, t.approved_by, t.approved_at,
  t.reversal_of_id, ro.transaction_number AS reverses_number, t.reversal_reason,
  rev.transaction_number AS reversed_by_number,
  t.is_legacy, t.business_day_id,
  t.created_by, p.full_name AS created_by_name, p.role AS created_by_role,
  (SELECT sum(amount) FROM public.financial_transaction_lines WHERE transaction_id = t.id AND direction = 'debit') AS amount,
  (SELECT string_agg(fa.account_name, ' → ' ORDER BY fl.line_no)
     FROM public.financial_transaction_lines fl
     JOIN public.financial_accounts fa ON fa.id = fl.account_id
    WHERE fl.transaction_id = t.id) AS accounts,
  (SELECT fa.account_name FROM public.financial_transaction_lines fl
     JOIN public.financial_accounts fa ON fa.id = fl.account_id
    WHERE fl.transaction_id = t.id AND fl.direction = 'credit'
      AND fa.account_class = 'asset_liquid' ORDER BY fl.line_no LIMIT 1) AS source_account,
  (SELECT fa.account_name FROM public.financial_transaction_lines fl
     JOIN public.financial_accounts fa ON fa.id = fl.account_id
    WHERE fl.transaction_id = t.id AND fl.direction = 'debit'
    ORDER BY fl.line_no LIMIT 1) AS destination_account
FROM public.financial_transactions t
LEFT JOIN public.branches b   ON b.id  = t.branch_id
LEFT JOIN public.loans l      ON l.id  = t.loan_id
LEFT JOIN public.loan_repayments rp ON rp.id = t.repayment_id
LEFT JOIN public.expenses e   ON e.id  = t.expense_id
LEFT JOIN public.clients cl   ON cl.id = t.client_id
LEFT JOIN public.profiles p   ON p.id  = t.created_by
LEFT JOIN public.financial_transactions ro  ON ro.id = t.reversal_of_id
LEFT JOIN public.financial_transactions rev ON rev.reversal_of_id = t.id;

-- ---------------------------------------------------------------------------
-- Account ledger — every line, running balance per account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_account_ledger
WITH (security_invoker = on) AS
SELECT
  l.account_id, a.account_code, a.account_name, a.account_class, a.branch_id,
  t.id AS transaction_id, t.transaction_number, t.transaction_date, t.created_at,
  t.entry_type, t.status, t.description, t.reference_number, t.is_legacy,
  l.line_no, l.direction, l.amount, l.signed_amount, l.memo,
  sum(l.signed_amount) OVER (
    PARTITION BY l.account_id
    ORDER BY t.transaction_date, t.created_at, t.transaction_number, l.line_no
    ROWS UNBOUNDED PRECEDING
  ) + a.opening_balance AS running_balance,
  t.created_by, t.loan_id, t.repayment_id, t.expense_id
FROM public.financial_transaction_lines l
JOIN public.financial_transactions t ON t.id = l.transaction_id
JOIN public.financial_accounts a     ON a.id = l.account_id;

-- ---------------------------------------------------------------------------
-- Trial balance — the thing you check when a report looks wrong.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_trial_balance
WITH (security_invoker = on) AS
SELECT
  account_code, account_name, account_class, account_type, branch_id, branch_name,
  total_debits, total_credits, current_balance, natural_balance,
  CASE WHEN current_balance >= 0 THEN current_balance ELSE 0 END AS debit_balance,
  CASE WHEN current_balance <  0 THEN -current_balance ELSE 0 END AS credit_balance
FROM public.v_account_balances
WHERE posting_count > 0 OR opening_balance <> 0
ORDER BY account_class, sort_order, account_code;

-- ---------------------------------------------------------------------------
-- Income statement / Profit & Loss.
--
-- Returned principal is NOT income. It never touches an income account, so it
-- cannot appear here — which is the structural fix for a P&L that previously
-- reported every shilling collected as revenue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_income_statement
WITH (security_invoker = on) AS
SELECT
  a.account_class, a.account_code, a.account_name, a.sort_order,
  t.branch_id, t.transaction_date,
  sum(CASE WHEN a.account_class = 'income'  THEN -l.signed_amount ELSE 0 END) AS income_amount,
  sum(CASE WHEN a.account_class = 'expense' THEN  l.signed_amount ELSE 0 END) AS expense_amount
FROM public.financial_transaction_lines l
JOIN public.financial_transactions t ON t.id = l.transaction_id
JOIN public.financial_accounts a     ON a.id = l.account_id
WHERE a.account_class IN ('income', 'expense')
GROUP BY a.account_class, a.account_code, a.account_name, a.sort_order, t.branch_id, t.transaction_date;

COMMENT ON VIEW public.v_income_statement IS
  'Income and expense by account and date. Loan principal movement is structurally excluded.';

-- ---------------------------------------------------------------------------
-- Statement of financial position.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_financial_position
WITH (security_invoker = on) AS
SELECT
  CASE
    WHEN account_class IN ('asset_liquid', 'asset_receivable') THEN 'Assets'
    WHEN account_class = 'liability' THEN 'Liabilities'
    WHEN account_class = 'equity'    THEN 'Capital & Equity'
    ELSE 'Result'
  END AS section,
  account_class, account_code, account_name, account_type, branch_id, branch_name,
  natural_balance AS amount, sort_order
FROM public.v_account_balances
WHERE posting_count > 0 OR opening_balance <> 0 OR is_system;

-- ---------------------------------------------------------------------------
-- Cash flow. Every movement through a liquid account, classified. Internal
-- transfers are their own bucket and net to nil across the institution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cash_flow
WITH (security_invoker = on) AS
SELECT
  t.transaction_date, t.branch_id, b.branch_name,
  l.account_id, a.account_code, a.account_name, a.account_type,
  t.entry_type,
  CASE t.entry_type
    WHEN 'capital_injection'         THEN 'Capital introduced'
    WHEN 'capital_withdrawal'        THEN 'Capital withdrawn'
    WHEN 'repayment'                 THEN 'Loan repayments'
    WHEN 'fee_collection'            THEN 'Fee income'
    WHEN 'other_income'              THEN 'Other income'
    WHEN 'disbursement'              THEN 'Loan disbursements'
    WHEN 'expense'                   THEN 'Operating expenses'
    WHEN 'internal_transfer'         THEN 'Internal transfers'
    WHEN 'security_refund'           THEN 'Security refunds'
    WHEN 'reconciliation_adjustment' THEN 'Reconciliation adjustments'
    WHEN 'opening_balance'           THEN 'Opening balances'
    WHEN 'reversal'                  THEN 'Reversals'
    ELSE 'Other'
  END AS flow_category,
  t.entry_type = 'internal_transfer' AS is_internal_transfer,
  l.signed_amount AS cash_movement,
  CASE WHEN l.direction = 'debit'  THEN l.amount ELSE 0 END AS cash_in,
  CASE WHEN l.direction = 'credit' THEN l.amount ELSE 0 END AS cash_out,
  t.id AS transaction_id, t.transaction_number, t.description, t.is_legacy
FROM public.financial_transaction_lines l
JOIN public.financial_transactions t ON t.id = l.transaction_id
JOIN public.financial_accounts a     ON a.id = l.account_id
LEFT JOIN public.branches b          ON b.id = t.branch_id
WHERE a.account_class = 'asset_liquid';

COMMENT ON VIEW public.v_cash_flow IS
  'Movements through liquid accounts only. Internal transfers are flagged so they never inflate income or expenses.';

-- ---------------------------------------------------------------------------
-- PAR ageing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_par_ageing
WITH (security_invoker = on) AS
SELECT
  par_bucket, branch_id, branch_name, officer_id, product_name,
  count(*)                        AS loan_count,
  sum(overdue_principal)          AS overdue_principal,
  sum(overdue_interest)           AS overdue_interest,
  sum(overdue_amount)             AS overdue_total,
  sum(principal_outstanding)      AS principal_outstanding,
  sum(total_outstanding)          AS total_outstanding
FROM public.v_loan_portfolio
WHERE status IN ('Active', 'Partially Paid', 'Overdue')
GROUP BY par_bucket, branch_id, branch_name, officer_id, product_name;

-- ---------------------------------------------------------------------------
-- Branch financials.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_branch_financials
WITH (security_invoker = on) AS
SELECT
  b.id AS branch_id, b.branch_name, b.branch_code, b.status,
  COALESCE(liq.liquidity, 0)            AS liquidity,
  COALESCE(port.principal_outstanding, 0) AS principal_outstanding,
  COALESCE(port.interest_outstanding, 0)  AS interest_outstanding,
  COALESCE(port.total_outstanding, 0)     AS total_outstanding,
  COALESCE(port.overdue_amount, 0)        AS arrears,
  COALESCE(port.active_loans, 0)          AS active_loans,
  COALESCE(port.disbursed_total, 0)       AS principal_disbursed,
  COALESCE(coll.collected, 0)             AS total_collected,
  COALESCE(coll.principal_collected, 0)   AS principal_collected,
  COALESCE(coll.interest_collected, 0)    AS interest_collected,
  COALESCE(pl.income, 0)                  AS income,
  COALESCE(pl.expenses, 0)                AS expenses,
  COALESCE(pl.income, 0) - COALESCE(pl.expenses, 0) AS net_result
FROM public.branches b
LEFT JOIN LATERAL (
  SELECT sum(current_balance) AS liquidity FROM public.v_account_balances
   WHERE account_class = 'asset_liquid' AND branch_id = b.id
) liq ON TRUE
LEFT JOIN LATERAL (
  SELECT sum(principal_outstanding) AS principal_outstanding,
         sum(interest_outstanding)  AS interest_outstanding,
         sum(total_outstanding)     AS total_outstanding,
         sum(overdue_amount)        AS overdue_amount,
         count(*) FILTER (WHERE status IN ('Active','Partially Paid','Overdue')) AS active_loans,
         sum(principal_amount) FILTER (WHERE disbursed_at IS NOT NULL)           AS disbursed_total
    FROM public.v_loan_portfolio WHERE branch_id = b.id
) port ON TRUE
LEFT JOIN LATERAL (
  SELECT sum(amount_paid) AS collected, sum(principal_portion) AS principal_collected,
         sum(interest_portion) AS interest_collected
    FROM public.v_repayment_allocation WHERE branch_id = b.id
) coll ON TRUE
LEFT JOIN LATERAL (
  SELECT sum(income_amount) AS income, sum(expense_amount) AS expenses
    FROM public.v_income_statement WHERE branch_id = b.id
) pl ON TRUE;

-- ---------------------------------------------------------------------------
-- Loan officer performance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_officer_performance
WITH (security_invoker = on) AS
SELECT
  p.id AS officer_id, p.full_name AS officer_name, p.role, p.branch_ids,
  COALESCE(port.active_loans, 0)          AS active_loans,
  COALESCE(port.borrowers, 0)             AS active_borrowers,
  COALESCE(port.principal_outstanding, 0) AS principal_outstanding,
  COALESCE(port.total_outstanding, 0)     AS portfolio_managed,
  COALESCE(port.disbursed, 0)             AS amount_disbursed,
  COALESCE(port.expected, 0)              AS expected_collections,
  COALESCE(coll.collected, 0)             AS actual_collections,
  COALESCE(port.overdue, 0)               AS overdue_portfolio,
  CASE WHEN COALESCE(port.expected, 0) > 0
       THEN round(COALESCE(coll.collected, 0) / port.expected * 100, 2) ELSE NULL END AS collection_rate
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE status IN ('Active','Partially Paid','Overdue')) AS active_loans,
         count(DISTINCT client_id) FILTER (WHERE status IN ('Active','Partially Paid','Overdue')) AS borrowers,
         sum(principal_outstanding) AS principal_outstanding,
         sum(total_outstanding)     AS total_outstanding,
         sum(principal_amount) FILTER (WHERE disbursed_at IS NOT NULL) AS disbursed,
         sum(total_collected + overdue_amount) AS expected,
         sum(overdue_amount)        AS overdue
    FROM public.v_loan_portfolio WHERE officer_id = p.id
) port ON TRUE
LEFT JOIN LATERAL (
  SELECT sum(amount_paid) AS collected FROM public.v_repayment_allocation WHERE officer_id = p.id
) coll ON TRUE
WHERE p.role IN ('Loan Officer', 'Branch Manager');

-- ---------------------------------------------------------------------------
-- Borrower statement — one row per member with their whole history summarised.
-- Instalment and receipt detail come from v_loan_portfolio and
-- v_repayment_allocation filtered by client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_borrower_statement
WITH (security_invoker = on) AS
SELECT
  c.id AS client_id, c.client_number, c.full_name, c.phone_number,
  c.branch_id, br.branch_name, c.group_id, g.group_name,
  c.loan_officer_id, c.status AS member_status, c.approval_status,
  COALESCE(f.fees_paid, 0)                AS fees_paid,
  COALESCE(lp.loans_count, 0)             AS loans_count,
  COALESCE(lp.principal_disbursed, 0)     AS principal_disbursed,
  COALESCE(lp.principal_outstanding, 0)   AS principal_outstanding,
  COALESCE(lp.interest_outstanding, 0)    AS interest_outstanding,
  COALESCE(lp.total_outstanding, 0)       AS total_outstanding,
  COALESCE(lp.overdue_amount, 0)          AS overdue_amount,
  COALESCE(lp.security_balance, 0)        AS security_held,
  COALESCE(rp.total_paid, 0)              AS total_paid,
  COALESCE(rp.principal_paid, 0)          AS principal_paid,
  COALESCE(rp.interest_paid, 0)           AS interest_paid,
  rp.last_payment_date
FROM public.clients c
LEFT JOIN public.branches br     ON br.id = c.branch_id
LEFT JOIN public.client_groups g ON g.id = c.group_id
LEFT JOIN LATERAL (
  SELECT sum(total_amount) AS fees_paid FROM public.member_fees WHERE client_id = c.id
) f ON TRUE
LEFT JOIN LATERAL (
  SELECT count(*) AS loans_count,
         sum(principal_amount) FILTER (WHERE disbursed_at IS NOT NULL) AS principal_disbursed,
         sum(principal_outstanding) AS principal_outstanding,
         sum(interest_outstanding)  AS interest_outstanding,
         sum(total_outstanding)     AS total_outstanding,
         sum(overdue_amount)        AS overdue_amount,
         sum(security_balance)      AS security_balance
    FROM public.v_loan_portfolio WHERE client_id = c.id
) lp ON TRUE
LEFT JOIN LATERAL (
  SELECT sum(amount_paid) AS total_paid, sum(principal_portion) AS principal_paid,
         sum(interest_portion) AS interest_paid, max(payment_date) AS last_payment_date
    FROM public.v_repayment_allocation WHERE client_id = c.id
) rp ON TRUE;

-- ---------------------------------------------------------------------------
GRANT SELECT ON
  public.v_account_balances, public.v_loan_portfolio, public.v_money_position,
  public.v_repayment_allocation, public.v_transaction_audit, public.v_account_ledger,
  public.v_trial_balance, public.v_income_statement, public.v_financial_position,
  public.v_cash_flow, public.v_par_ageing, public.v_branch_financials,
  public.v_officer_performance, public.v_borrower_statement
TO authenticated, service_role;
