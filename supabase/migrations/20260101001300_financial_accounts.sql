-- ===========================================================================
-- CHETU MICROFINANCE — financial accounts (chart of accounts)
-- ===========================================================================
-- Until now the system had exactly one implicit money location: an unnamed
-- institutional bank, represented by `bank_transactions` and a client-computed
-- running balance. There was nowhere to say that cash was in a till, a bank,
-- or a mobile-money wallet, and nowhere to record that money had moved between
-- them. "Where is Chetu's money right now?" had no answer.
--
-- This table is that answer. Every place money can sit, and every category it
-- can arrive from or leave to, is a row here.
--
-- Two kinds of account live side by side:
--
--   Real accounts        cash tills, branch cash, bank accounts, mobile money,
--                        merchant floats. Operators post to these directly.
--   Control accounts     Loans Receivable, Security Held, Capital, the income
--                        and expense categories. `is_system` and
--                        `allow_manual_posting = false`: only a posting
--                        function may touch them, so nobody can hand-journal
--                        the loan book.
--
-- There is deliberately NO `current_balance` column. A stored total is a total
-- that can drift, and drift is the problem this migration exists to end. The
-- balance is `opening_balance + SUM(lines)`, served by `v_account_balances` in
-- migration 001500.
--
-- Account names are configurable. Nothing here hard-codes a real bank or a
-- mobile-money provider, because production does not yet tell us which ones
-- Chetu uses. Three accounts are seeded — Head Office Cash, Main Bank Account
-- and Legacy / Unclassified — and staff rename them and add more.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  account_code          TEXT NOT NULL UNIQUE,
  account_name          TEXT NOT NULL,
  account_type          TEXT NOT NULL,
  account_class         TEXT NOT NULL,
  branch_id             TEXT REFERENCES public.branches(id) ON DELETE RESTRICT,
  institution           TEXT,
  account_reference     TEXT,
  description           TEXT,
  opening_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_balance_date  DATE,
  currency              TEXT NOT NULL DEFAULT 'UGX',
  status                TEXT NOT NULL DEFAULT 'Active',
  is_system             BOOLEAN NOT NULL DEFAULT FALSE,
  is_legacy             BOOLEAN NOT NULL DEFAULT FALSE,
  allow_manual_posting  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INTEGER NOT NULL DEFAULT 100,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT financial_accounts_type_check CHECK (account_type IN (
    -- real money locations
    'cash_at_hand', 'cashier_till', 'branch_cash', 'bank', 'mobile_money',
    'merchant',
    -- control accounts
    'loans_receivable', 'interest_receivable', 'penalty_receivable',
    'security_held', 'capital', 'income', 'expense', 'writeoff', 'other'
  )),
  CONSTRAINT financial_accounts_class_check CHECK (account_class IN (
    'asset_liquid', 'asset_receivable', 'liability', 'equity', 'income', 'expense'
  )),
  CONSTRAINT financial_accounts_status_check CHECK (status IN ('Active', 'Dormant', 'Closed')),
  CONSTRAINT financial_accounts_currency_check CHECK (currency = upper(currency))
);

COMMENT ON TABLE public.financial_accounts IS
  'Chart of accounts. Every place money sits and every category it flows to. Balances are derived, never stored.';
COMMENT ON COLUMN public.financial_accounts.account_class IS
  'What the reports group by: asset_liquid | asset_receivable | liability | equity | income | expense.';
COMMENT ON COLUMN public.financial_accounts.allow_manual_posting IS
  'FALSE on control accounts — only a post_* function may write to them.';
COMMENT ON COLUMN public.financial_accounts.opening_balance IS
  'Set once at cut-over from a physical cash count or a bank statement. Zero until then.';

CREATE INDEX IF NOT EXISTS idx_financial_accounts_branch ON public.financial_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_class  ON public.financial_accounts(account_class);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_type   ON public.financial_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_status ON public.financial_accounts(status);

DROP TRIGGER IF EXISTS trg_financial_accounts_updated_at ON public.financial_accounts;
CREATE TRIGGER trg_financial_accounts_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- A system account may be renamed and re-described, but its identity, class
-- and posting rules are load-bearing: `post_disbursement` resolves
-- LOANS-RECEIVABLE by code, and every report groups by class. Let staff
-- relabel them; do not let anyone repoint them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_financial_account_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'Account % is a system control account and cannot be deleted', OLD.account_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.financial_transaction_lines WHERE account_id = OLD.id) THEN
      RAISE EXCEPTION 'Account % carries postings and cannot be deleted — close it instead', OLD.account_code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_system THEN
    IF NEW.account_code <> OLD.account_code
       OR NEW.account_class <> OLD.account_class
       OR NEW.account_type <> OLD.account_type
       OR NEW.is_system <> OLD.is_system
       OR NEW.allow_manual_posting <> OLD.allow_manual_posting THEN
      RAISE EXCEPTION 'Account % is a system control account: only its name, description and status may change',
        OLD.account_code USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The opening balance is the cut-over anchor. Moving it silently restates
  -- every balance in the system, so it may only be set while it is still zero.
  IF TG_OP = 'UPDATE'
     AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
     AND OLD.opening_balance <> 0 THEN
    RAISE EXCEPTION 'Opening balance for % is already set — correct it with a reconciliation adjustment, not an edit',
      OLD.account_code USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_financial_account_change() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_financial_account ON public.financial_accounts;
CREATE TRIGGER trg_guard_financial_account
  BEFORE UPDATE OR DELETE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_account_change();

-- ---------------------------------------------------------------------------
-- Seed. Control accounts first, then the minimum set of real accounts.
-- Re-runnable: ON CONFLICT DO NOTHING, so an existing estate is never restated.
-- ---------------------------------------------------------------------------
INSERT INTO public.financial_accounts
  (account_code, account_name, account_type, account_class, is_system, allow_manual_posting, sort_order, description)
VALUES
  -- Receivables — money with borrowers
  ('LOANS-RECEIVABLE',    'Loans Receivable',            'loans_receivable',    'asset_receivable', TRUE, FALSE, 200, 'Outstanding loan principal owed by members.'),
  ('INTEREST-RECEIVABLE', 'Interest Receivable',         'interest_receivable', 'asset_receivable', TRUE, FALSE, 210, 'Contracted interest not yet collected.'),
  ('PENALTY-RECEIVABLE',  'Penalties Receivable',        'penalty_receivable',  'asset_receivable', TRUE, FALSE, 220, 'Penalties charged and not yet collected. Unused until penalties are enabled.'),
  -- Liabilities
  ('SECURITY-HELD',       'Member Security Deposits',    'security_held',       'liability',        TRUE, FALSE, 300, 'Refundable 15% security withheld at disbursement. Owed back to members.'),
  -- Equity
  ('CAPITAL-INTRODUCED',  'Capital Introduced',          'capital',             'equity',           TRUE, FALSE, 400, 'Owner and company funding injected into the business.'),
  -- Income
  ('INC-INTEREST',        'Interest Income',             'income',              'income',           TRUE, FALSE, 500, 'Interest earned on loans, recognised as collected.'),
  ('INC-FEE-PROCESSING',  'Processing Fee Income',       'income',              'income',           TRUE, FALSE, 510, 'Loan processing fee charged at disbursement.'),
  ('INC-FEE-CRB',         'CRB Fee Income',              'income',              'income',           TRUE, FALSE, 520, 'Credit Reference Bureau fee charged at disbursement.'),
  ('INC-FEE-GROUP-MAINT', 'Group Maintenance Fee Income','income',              'income',           TRUE, FALSE, 530, 'Group maintenance fee charged per loan.'),
  ('INC-FEE-ADMISSION',   'Admission Fee Income',        'income',              'income',           TRUE, FALSE, 540, 'Member admission fee.'),
  ('INC-FEE-PASSBOOK',    'Passbook Fee Income',         'income',              'income',           TRUE, FALSE, 550, 'Member passbook fee.'),
  ('INC-PENALTY',         'Penalty Income',              'income',              'income',           TRUE, FALSE, 560, 'Penalty income. Zero until penalties are enabled.'),
  ('INC-OTHER',           'Other Income',                'income',              'income',           TRUE, FALSE, 570, 'Income that fits no other category.'),
  -- Losses
  ('WRITEOFF-LOSS',       'Loan Write-off Loss',         'writeoff',            'expense',          TRUE, FALSE, 600, 'Principal and interest removed from the book on write-off.'),
  -- Legacy
  ('LEGACY-UNCLASSIFIED', 'Legacy / Unclassified Funds', 'other',               'asset_liquid',     TRUE, FALSE, 900,
   'Cash movements recorded before the ledger existed, whose physical location (cash, bank or wallet) was never captured. Closed to new postings. Resolved once at cut-over by a reconciliation adjustment against a real cash count and bank statement.')
ON CONFLICT (account_code) DO NOTHING;

-- Expense categories mirror the application's ExpenseCategory union so that
-- every existing expense has somewhere to post without anyone reclassifying it.
INSERT INTO public.financial_accounts
  (account_code, account_name, account_type, account_class, is_system, allow_manual_posting, sort_order)
SELECT 'EXP-' || upper(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')),
       name || ' Expense', 'expense', 'expense', TRUE, FALSE, 700 + (ord * 10)
FROM (VALUES
  -- The nine in the application's ExpenseCategory union come first, spelled
  -- exactly as it spells them: post_expense derives the account code from the
  -- category string, so a mismatch would quietly bucket real spending into
  -- "Other".
  ('Salaries', 1), ('Rent', 2), ('Fuel', 3), ('Utilities', 4), ('Internet', 5),
  ('Maintenance', 6), ('Transport', 7), ('Office Supplies', 8), ('Other', 9),
  -- Room to grow without another migration.
  ('Stationery', 10), ('Marketing', 11), ('Communication', 12),
  ('Professional Fees', 13), ('Bank Charges', 14), ('Training', 15),
  ('Equipment', 16), ('Insurance', 17)
) AS t(name, ord)
ON CONFLICT (account_code) DO NOTHING;

-- Real accounts. Names are placeholders on purpose — production has never
-- recorded which bank Chetu uses, and inventing one would be a fabrication.
-- Staff rename these and add their own; mobile-money and merchant accounts are
-- created when Chetu actually operates them.
INSERT INTO public.financial_accounts
  (account_code, account_name, account_type, account_class, is_system, allow_manual_posting, sort_order, description)
VALUES
  ('CASH-HO',   'Head Office Cash',  'cash_at_hand', 'asset_liquid', FALSE, TRUE, 100, 'Physical cash held at head office. Rename or add branch tills as needed.'),
  ('BANK-MAIN', 'Main Bank Account', 'bank',         'asset_liquid', FALSE, TRUE, 110, 'Primary institutional bank account. Set the institution and account number before use.')
ON CONFLICT (account_code) DO NOTHING;
