-- ===========================================================================
-- CHETU MICROFINANCE — savings: closed until it can be journalled
-- ===========================================================================
-- Migration 002200 closed every way of moving money without a journal, with
-- one exception it named: savings. `savings_accounts.balance` and
-- `savings_transactions` were still writable and posted nothing.
--
-- ---------------------------------------------------------------------------
-- Why this disables the module rather than integrating it
-- ---------------------------------------------------------------------------
-- Production has 25 savings accounts, every one of them at zero, created
-- alongside their members between 7 and 22 September. It has never held a
-- single savings transaction. The module has never been used.
--
-- Integrating it would not be a guard, it would be building the product:
-- there is no savings liability account in the chart of accounts, and no
-- answer recorded anywhere to what a savings account at Chetu actually is —
-- whether it earns interest, whether a balance may go negative, what a
-- withdrawal may be refused for, whether a group account is the sum of its
-- members' or a thing in its own right.
--
-- And the code that exists could not be journalled as it stands. Every fault
-- this programme removed elsewhere is still in `addSavingsTransaction`:
--
--   * the reference number is `savingsTransactions.length + 1`, taken from an
--     RLS-filtered array — the documented bug that stopped the second loan
--     officer submitting their first application;
--   * `if (!accError)` and `if (!txError)`, the exact shape of the discarded
--     error that left fifteen loans disbursed with no ledger entry;
--   * when the insert fails it still returns a transaction object with a
--     client-invented id, so the screen prints a receipt for a row that does
--     not exist;
--   * `savings_accounts.balance` is a stored total maintained from the
--     browser, and a stored total is what this ledger replaced;
--   * an over-withdrawal is silently clamped with `Math.max(0, …)` rather
--     than refused;
--   * the balance and the transaction are two round trips.
--
-- So: closed. Reading stays open, the 25 accounts stay visible and unchanged,
-- and nothing can move.
--
-- ---------------------------------------------------------------------------
-- How to open it again
-- ---------------------------------------------------------------------------
-- `private.savings_ledger_ready()` is the seam, and it is a function rather
-- than a settings row on purpose: no flag in the application, and no row a
-- support engineer can flip in the SQL editor, can turn savings back on. It
-- takes a migration, which is the right weight for the decision, because a
-- deposit cannot be taken until the ledger has somewhere to put it.
--
-- A future `…002400_savings_ledger.sql` would need all of:
--
--   1. a `SAVINGS-HELD` liability account in `financial_accounts`;
--   2. `record_savings_deposit(account, amount, method, receiving_account)` —
--      debit the cash/bank/wallet account, credit SAVINGS-HELD, write the
--      transaction, in one transaction;
--   3. `record_savings_withdrawal(...)` — the mirror, refusing rather than
--      clamping when the balance will not cover it;
--   4. `undo_savings_transaction(...)` — a reversing journal, never a delete;
--   5. the balance derived from the ledger, not stored, exactly as
--      `v_account_balances` does it;
--   6. `private.savings_ledger_ready()` replaced to return TRUE, last.
--
-- Until step 6, this guard stands.
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.savings_ledger_ready()
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT FALSE $$;

COMMENT ON FUNCTION private.savings_ledger_ready() IS
  'FALSE until savings deposits and withdrawals post balanced journals. Replaced by the migration that integrates savings with the ledger, and by nothing else.';

REVOKE ALL ON FUNCTION private.savings_ledger_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.savings_ledger_ready() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The refusal
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, like the other guards in 002200: a SECURITY DEFINER
-- trigger would see the owner as `current_user` whoever called it, and that is
-- the fact being read.
CREATE OR REPLACE FUNCTION public.guard_savings_module()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NOT private.is_api_write() OR private.savings_ledger_ready() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION
    'Savings is not enabled. A deposit or withdrawal has nowhere to post, so it cannot be recorded.'
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Existing accounts stay readable. Savings reopens when deposits and withdrawals post balanced journals.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_savings_module() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_savings_module() TO authenticated, service_role;

-- Every write. A savings transaction is money and nothing else.
DROP TRIGGER IF EXISTS trg_guard_savings_transaction ON public.savings_transactions;
CREATE TRIGGER trg_guard_savings_transaction
  BEFORE INSERT OR UPDATE OR DELETE ON public.savings_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_savings_module();

-- The account itself is not money — member admission opens one at zero for
-- every new member, and closing or renaming one moves nothing. Only `balance`
-- is guarded, which is the single column that can make a shilling appear.
CREATE OR REPLACE FUNCTION public.guard_savings_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF private.is_api_write()
     AND NOT private.savings_ledger_ready()
     AND OLD.balance IS DISTINCT FROM NEW.balance THEN
    RAISE EXCEPTION
      'Savings is not enabled, so a savings balance cannot be changed.'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'The balance follows the transactions, and savings transactions cannot be recorded yet.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_savings_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_savings_balance() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_savings_balance ON public.savings_accounts;
CREATE TRIGGER trg_guard_savings_balance
  BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_savings_balance();

-- ---------------------------------------------------------------------------
-- And the standing check, so a lifted guard cannot go unnoticed
-- ---------------------------------------------------------------------------
-- `service_role` is not blocked above — the seed and repair scripts run under
-- it, as everywhere else. These two checks are what make that safe: a savings
-- transaction with no journal, or a savings balance that is not zero while the
-- module cannot journal one, is reported the moment it appears.
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
  -- Savings is closed, so any transaction at all is one the ledger cannot
  -- account for. Once it is integrated this reads as it does for every other
  -- kind of movement: a transaction with no journal behind it.
  SELECT 'savings_transaction_without_journal', s.id, s.transaction_number,
         format('Savings %s of UGX %s has no ledger entry', s.transaction_type, s.amount)
    FROM public.savings_transactions s
   WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions t
                      WHERE t.source_table = 'savings_transactions' AND t.source_id = s.id
                        AND t.status <> 'reversed')

  UNION ALL
  SELECT 'savings_balance_without_ledger', a.id, a.account_number,
         format('Savings account holds UGX %s while savings cannot be journalled', a.balance)
    FROM public.savings_accounts a
   WHERE COALESCE(a.balance, 0) <> 0
     AND NOT private.savings_ledger_ready()

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

-- ---------------------------------------------------------------------------
-- Say so on the table itself, for whoever finds it before finding this file.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.savings_transactions IS
  'Closed. Savings does not post to the financial ledger, so no deposit or withdrawal may be recorded. Readable, never writable, until the savings ledger migration lands.';
COMMENT ON COLUMN public.savings_accounts.balance IS
  'Frozen while savings is closed. It is a stored total, which the ledger does not use anywhere else; when savings is integrated the balance should be derived from its journals, not kept here.';
