-- ===========================================================================
-- CHETU MICROFINANCE — row level security for the ledger
-- ===========================================================================
-- The audit's central finding was a permission mismatch: disbursement was open
-- to Loan Officers, while the table it posted to was Administrator-only. The
-- answer is NOT to let every officer write the institution's cash ledger. It
-- is this:
--
--   * Direct INSERT / UPDATE / DELETE on the ledger is denied to everyone
--     signed in. There is no "write" policy at all.
--   * Money moves only through the SECURITY DEFINER posting functions in
--     migration 001600, each of which checks the BUSINESS permission for the
--     action it represents.
--   * Reads follow the existing visibility model, extended so that a Branch
--     Manager can finally see their own branch's finances — which they could
--     not before, since `bank_transactions` and `expenses` were readable only
--     by Administrators and Auditors.
--
-- Expense posting: Branch Managers for their own branch, Administrators
-- everywhere, Loan Officers never. Enforced here, server-side, as well as in
-- `post_expense`.
-- ===========================================================================

ALTER TABLE public.financial_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transaction_lines  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- financial_accounts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "financial accounts read"  ON public.financial_accounts;
DROP POLICY IF EXISTS "financial accounts write" ON public.financial_accounts;

-- Everyone signed in may READ the chart of accounts: a Loan Officer has to be
-- able to pick the till they are collecting into. Balances are a different
-- question and are governed by the ledger policies below.
CREATE POLICY "financial accounts read" ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (TRUE);

-- Only Administrators may create, rename or close an account.
CREATE POLICY "financial accounts write" ON public.financial_accounts
  FOR ALL TO authenticated
  USING (private.is_admin() AND NOT private.is_auditor())
  WITH CHECK (private.is_admin() AND NOT private.is_auditor());

-- ---------------------------------------------------------------------------
-- financial_transactions — READ ONLY. There is deliberately no write policy:
-- every INSERT goes through a posting function that runs as definer.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "financial transactions read" ON public.financial_transactions;

CREATE POLICY "financial transactions read" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (
    private.is_admin_or_auditor()
    OR (private.is_branch_manager()
        AND (branch_id IS NULL OR branch_id = ANY (private.caller_branch_ids())))
    -- A Loan Officer sees the postings for their own members' loans and
    -- receipts, and nothing else: no capital, no expenses, no transfers.
    OR (client_id IS NOT NULL AND private.can_see_client(client_id))
  );

-- ---------------------------------------------------------------------------
-- financial_transaction_lines — visible exactly when their header is.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "financial lines read" ON public.financial_transaction_lines;

CREATE POLICY "financial lines read" ON public.financial_transaction_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.financial_transactions t WHERE t.id = transaction_id
  ));

-- ---------------------------------------------------------------------------
-- Expenses — the permission change the audit called for.
--
-- Before: read and write were both `private.is_admin()`, so a Branch Manager
-- could not see, let alone record, their own branch's spending.
-- Now: Administrators everywhere; Branch Managers within their own branches;
-- Auditors read-only; Loan Officers not at all.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "expenses read"   ON public.expenses;
DROP POLICY IF EXISTS "expenses write"  ON public.expenses;
DROP POLICY IF EXISTS "expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses update" ON public.expenses;
DROP POLICY IF EXISTS "expenses delete" ON public.expenses;

CREATE POLICY "expenses read" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    private.is_admin_or_auditor()
    OR (private.is_branch_manager()
        AND branch_id IS NOT NULL
        AND branch_id = ANY (private.caller_branch_ids()))
  );

CREATE POLICY "expenses insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT private.is_auditor()
    AND (
      private.is_admin()
      OR (private.is_branch_manager()
          AND branch_id IS NOT NULL
          AND branch_id = ANY (private.caller_branch_ids()))
    )
  );

-- A Branch Manager may correct their own branch's expense; they may not move
-- it to another branch, which the WITH CHECK enforces on the new row.
CREATE POLICY "expenses update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    NOT private.is_auditor()
    AND (private.is_admin()
         OR (private.is_branch_manager() AND branch_id IS NOT NULL
             AND branch_id = ANY (private.caller_branch_ids())))
  )
  WITH CHECK (
    NOT private.is_auditor()
    AND (private.is_admin()
         OR (private.is_branch_manager() AND branch_id IS NOT NULL
             AND branch_id = ANY (private.caller_branch_ids())))
  );

CREATE POLICY "expenses delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (private.is_admin() AND NOT private.is_auditor());

-- ---------------------------------------------------------------------------
-- bank_transactions — now a closed legacy register.
--
-- Its 2 historical rows are preserved and backfilled into the ledger. Nothing
-- new should ever be written here: the ledger has replaced it. Reads are
-- widened to Branch Managers so the legacy register stays inspectable.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bank read"  ON public.bank_transactions;
DROP POLICY IF EXISTS "bank write" ON public.bank_transactions;

CREATE POLICY "bank read" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    private.is_admin_or_auditor()
    OR (private.is_branch_manager()
        AND (branch_id IS NULL OR branch_id = ANY (private.caller_branch_ids())))
  );

-- Deliberately no INSERT/UPDATE/DELETE policy. The table is history.
COMMENT ON TABLE public.bank_transactions IS
  'Superseded legacy register. Read-only: replaced by financial_transactions. Its rows are backfilled into the ledger.';

-- A clear error beats a silent RLS rejection — that is what cost 15
-- disbursements their ledger entry.
CREATE OR REPLACE FUNCTION public.block_legacy_bank_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);   -- service role: migrations and verification
  END IF;
  RAISE EXCEPTION
    'bank_transactions is a closed legacy register. Use post_capital_injection, post_internal_transfer or the relevant posting function.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.block_legacy_bank_write() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_block_legacy_bank_write ON public.bank_transactions;
CREATE TRIGGER trg_block_legacy_bank_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_legacy_bank_write();

-- ---------------------------------------------------------------------------
-- Table grants. RLS decides the rows; these decide the verbs.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.financial_accounts          TO authenticated;
GRANT SELECT ON public.financial_transactions      TO authenticated;
GRANT SELECT ON public.financial_transaction_lines TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.financial_accounts TO authenticated;

-- No signed-in role may write the ledger directly. Only the definer functions.
REVOKE INSERT, UPDATE, DELETE ON public.financial_transactions      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.financial_transaction_lines FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bank_transactions           FROM authenticated;

GRANT ALL ON public.financial_accounts          TO service_role;
GRANT ALL ON public.financial_transactions      TO service_role;
GRANT ALL ON public.financial_transaction_lines TO service_role;

-- ---------------------------------------------------------------------------
-- Advisor hygiene for the new surface: trigger functions must not be callable
-- as RPCs, and the two pre-existing offenders are fixed while we are here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::TEXT
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'assert_financial_transaction_balanced', 'assert_financial_transaction_has_lines',
         'set_financial_transaction_number', 'block_financial_mutation',
         'guard_financial_account_change', 'allocate_repayment_portions',
         'block_legacy_bank_write', 'block_audit_mutation', 'block_audit_log_update')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Reported by the Supabase linter before this programme began: both ran with a
-- caller-mutable search_path.
ALTER FUNCTION public.block_audit_mutation()   SET search_path = public, pg_temp;
ALTER FUNCTION public.block_audit_log_update() SET search_path = public, pg_temp;
