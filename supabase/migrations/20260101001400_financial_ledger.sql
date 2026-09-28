-- ===========================================================================
-- CHETU MICROFINANCE — the balanced ledger
-- ===========================================================================
-- One transaction per business event; two or more lines that must sum to zero.
--
-- The rule that makes this worth the extra table: every financial event has to
-- explain both where the money came from and where it went. A disbursement is
-- not "cash went down". It is:
--
--   Dr  Loans Receivable            300,000
--     Cr  Cash / Bank                         238,000
--     Cr  Processing Fee Income                12,000
--     Cr  CRB Fee Income                        3,000
--     Cr  Group Maintenance Fee Income          2,000
--     Cr  Member Security Deposits             45,000
--
-- Liquidity falls by what actually left the branch, the member owes the full
-- principal, the fees are recognised as income, and the refundable security
-- becomes the liability it always was. Every one of those numbers already
-- exists on the `loans` row — they simply had nowhere to be posted.
--
-- The same shape means an internal transfer (Dr destination, Cr source) cannot
-- touch an income or expense account, so transfers can never inflate either.
-- That is structural, not a convention someone has to remember.
--
-- Posted rows are immutable. A mistake is corrected by a reversal transaction
-- that references the original, never by editing or deleting history.
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS public.financial_transaction_number_seq;

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  transaction_number  TEXT NOT NULL UNIQUE,
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'posted',
  branch_id           TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  reference_number    TEXT,
  business_day_id     TEXT REFERENCES public.business_days(id) ON DELETE SET NULL,

  -- Links back to the record this posting represents. Nullable because not
  -- every entry has one (capital, transfers), indexed because reconciliation
  -- and the backfill's idempotency both walk them.
  loan_id             TEXT REFERENCES public.loans(id) ON DELETE RESTRICT,
  repayment_id        TEXT REFERENCES public.loan_repayments(id) ON DELETE RESTRICT,
  expense_id          TEXT REFERENCES public.expenses(id) ON DELETE RESTRICT,
  member_fee_id       TEXT REFERENCES public.member_fees(id) ON DELETE RESTRICT,
  security_return_id  TEXT REFERENCES public.loan_security_returns(id) ON DELETE RESTRICT,
  client_id           TEXT REFERENCES public.clients(id) ON DELETE RESTRICT,

  -- Generic provenance, used by the backfill so every migrated journal can be
  -- traced to the row it was reconstructed from, and so re-running it is a no-op.
  source_table        TEXT,
  source_id           TEXT,

  -- Reversal chain. `reversal_of_id` points at the transaction being undone.
  reversal_of_id      TEXT REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  reversal_reason     TEXT,

  approval_status     TEXT NOT NULL DEFAULT 'Not Required',
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,

  is_legacy           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT financial_transactions_entry_type_check CHECK (entry_type IN (
    'capital_injection', 'capital_withdrawal', 'disbursement', 'repayment',
    'fee_collection', 'expense', 'internal_transfer', 'security_refund',
    'writeoff', 'other_income', 'reconciliation_adjustment', 'opening_balance',
    'legacy_backfill', 'reversal'
  )),
  CONSTRAINT financial_transactions_status_check CHECK (status IN ('posted', 'reversed', 'reversal')),
  CONSTRAINT financial_transactions_approval_check CHECK (approval_status IN
    ('Not Required', 'Pending', 'Approved', 'Rejected')),
  CONSTRAINT financial_transactions_reversal_shape CHECK (
    (status = 'reversal') = (reversal_of_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.financial_transactions IS
  'Journal header. One row per financial event. Immutable once posted; corrected only by a referencing reversal.';
COMMENT ON COLUMN public.financial_transactions.source_table IS
  'Provenance for backfilled journals: the table the entry was reconstructed from.';
COMMENT ON COLUMN public.financial_transactions.is_legacy IS
  'TRUE for journals reconstructed from pre-ledger history, whose cash leg sits in LEGACY-UNCLASSIFIED.';

CREATE INDEX IF NOT EXISTS idx_fin_tx_date        ON public.financial_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_fin_tx_type        ON public.financial_transactions(entry_type);
CREATE INDEX IF NOT EXISTS idx_fin_tx_branch      ON public.financial_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_loan        ON public.financial_transactions(loan_id)       WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_tx_repayment   ON public.financial_transactions(repayment_id)  WHERE repayment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_tx_expense     ON public.financial_transactions(expense_id)    WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_tx_member_fee  ON public.financial_transactions(member_fee_id) WHERE member_fee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_tx_reversal_of ON public.financial_transactions(reversal_of_id) WHERE reversal_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_tx_business_day ON public.financial_transactions(business_day_id);

-- Idempotency for the backfill and for every post_* function: one LIVE posting
-- per source record, enforced by the database rather than by a careful caller.
--
-- Reversed journals are excluded on purpose. A loan disbursed in error is
-- reversed and then disbursed again properly; if the reversed journal still
-- held the source slot, the second attempt would be refused as a duplicate and
-- the loan could never leave the building.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_tx_source
  ON public.financial_transactions(source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL AND status <> 'reversed';

-- A rollback deletes the receipt or expense it reversed (the behaviour
-- `loan_reversals` has always existed to record). The journal must survive
-- that: the posting is the evidence, and `source_table` / `source_id` keep the
-- provenance even once the row they name is gone.
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_repayment_id_fkey,
  DROP CONSTRAINT IF EXISTS financial_transactions_expense_id_fkey,
  DROP CONSTRAINT IF EXISTS financial_transactions_member_fee_id_fkey,
  DROP CONSTRAINT IF EXISTS financial_transactions_security_return_id_fkey;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_repayment_id_fkey
    FOREIGN KEY (repayment_id) REFERENCES public.loan_repayments(id) ON DELETE SET NULL,
  ADD CONSTRAINT financial_transactions_expense_id_fkey
    FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD CONSTRAINT financial_transactions_member_fee_id_fkey
    FOREIGN KEY (member_fee_id) REFERENCES public.member_fees(id) ON DELETE SET NULL,
  ADD CONSTRAINT financial_transactions_security_return_id_fkey
    FOREIGN KEY (security_return_id) REFERENCES public.loan_security_returns(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_transaction_lines (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  transaction_id  TEXT NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  line_no         INTEGER NOT NULL,
  account_id      TEXT NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  direction       TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  memo            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fin_line_direction_check CHECK (direction IN ('debit', 'credit')),
  CONSTRAINT fin_line_amount_positive CHECK (amount > 0),
  CONSTRAINT fin_line_unique_no UNIQUE (transaction_id, line_no)
);

-- Signed value in one place, so no view has to remember the sign convention.
-- Debit is positive: an asset account's balance is the sum of its signed lines.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'financial_transaction_lines'
       AND column_name = 'signed_amount'
  ) THEN
    ALTER TABLE public.financial_transaction_lines
      ADD COLUMN signed_amount NUMERIC(14,2)
      GENERATED ALWAYS AS (CASE WHEN direction = 'debit' THEN amount ELSE -amount END) STORED;
  END IF;
END $$;

COMMENT ON TABLE public.financial_transaction_lines IS
  'Journal lines. Debits and credits of a transaction must sum to zero — enforced by trg_fin_tx_balanced.';
COMMENT ON COLUMN public.financial_transaction_lines.signed_amount IS
  'Debit positive, credit negative. Account balance = opening_balance + SUM(signed_amount).';

CREATE INDEX IF NOT EXISTS idx_fin_line_tx      ON public.financial_transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fin_line_account ON public.financial_transaction_lines(account_id);

-- ---------------------------------------------------------------------------
-- The invariant. Deferred to the end of the transaction so a posting function
-- can insert its header and its lines in any order, but no unbalanced journal
-- can ever be committed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_financial_transaction_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx     TEXT := COALESCE(NEW.transaction_id, OLD.transaction_id);
  v_lines  INTEGER;
  v_net    NUMERIC(14,2);
BEGIN
  SELECT count(*), COALESCE(sum(signed_amount), 0)
    INTO v_lines, v_net
    FROM public.financial_transaction_lines
   WHERE transaction_id = v_tx;

  -- The header's own deletion cascades its lines away; nothing to check.
  IF v_lines = 0 THEN
    IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE id = v_tx) THEN
      RAISE EXCEPTION 'Journal % has no lines', v_tx USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;

  IF v_lines < 2 THEN
    RAISE EXCEPTION 'Journal % has only % line(s): a financial event must say where money came from and where it went',
      v_tx, v_lines USING ERRCODE = 'check_violation';
  END IF;

  IF v_net <> 0 THEN
    RAISE EXCEPTION 'Journal % does not balance: debits minus credits = %', v_tx, v_net
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_financial_transaction_balanced() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_fin_tx_balanced ON public.financial_transaction_lines;
CREATE CONSTRAINT TRIGGER trg_fin_tx_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_transaction_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_financial_transaction_balanced();

-- A header with no lines at all would slip past a line-level trigger.
CREATE OR REPLACE FUNCTION public.assert_financial_transaction_has_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_transaction_lines WHERE transaction_id = NEW.id) THEN
    RAISE EXCEPTION 'Journal % was posted with no lines', NEW.transaction_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_financial_transaction_has_lines() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_fin_tx_has_lines ON public.financial_transactions;
CREATE CONSTRAINT TRIGGER trg_fin_tx_has_lines
  AFTER INSERT ON public.financial_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_financial_transaction_has_lines();

-- ---------------------------------------------------------------------------
-- Numbering, by the database. The client must never compute `rows.length + 1`:
-- the array is RLS-filtered, so every user counts from their own total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_financial_transaction_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = ''
     OR EXISTS (SELECT 1 FROM public.financial_transactions t
                 WHERE t.transaction_number = NEW.transaction_number) THEN
    NEW.transaction_number := private.next_reference(
      'CM-FT', 'public.financial_transaction_number_seq',
      'financial_transactions', 'transaction_number');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_financial_transaction_number() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_set_financial_transaction_number ON public.financial_transactions;
CREATE TRIGGER trg_set_financial_transaction_number
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_transaction_number();

-- ---------------------------------------------------------------------------
-- Immutability. Posted financial history is evidence; it is not editable.
-- The only field that may change after posting is `status`, and only on the
-- 'posted' -> 'reversed' path that `reverse_financial_transaction` drives.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_financial_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Posted financial records cannot be deleted. Reverse the transaction instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'financial_transaction_lines' THEN
    RAISE EXCEPTION 'Journal lines cannot be altered once posted. Reverse the transaction instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.transaction_number IS DISTINCT FROM OLD.transaction_number
     OR NEW.description        IS DISTINCT FROM OLD.description
     OR NEW.reference_number   IS DISTINCT FROM OLD.reference_number
     OR NEW.reversal_reason    IS DISTINCT FROM OLD.reversal_reason
     OR NEW.transaction_date   IS DISTINCT FROM OLD.transaction_date
     OR NEW.entry_type         IS DISTINCT FROM OLD.entry_type
     OR NEW.branch_id          IS DISTINCT FROM OLD.branch_id
     OR NEW.loan_id            IS DISTINCT FROM OLD.loan_id
     -- These four may only ever be cleared, never repointed: a rollback
     -- deletes the row they name and the foreign key nulls them.
     OR (NEW.repayment_id       IS DISTINCT FROM OLD.repayment_id       AND NEW.repayment_id IS NOT NULL)
     OR (NEW.expense_id         IS DISTINCT FROM OLD.expense_id         AND NEW.expense_id IS NOT NULL)
     OR (NEW.member_fee_id      IS DISTINCT FROM OLD.member_fee_id      AND NEW.member_fee_id IS NOT NULL)
     OR (NEW.security_return_id IS DISTINCT FROM OLD.security_return_id AND NEW.security_return_id IS NOT NULL)
     OR NEW.source_table       IS DISTINCT FROM OLD.source_table
     OR NEW.source_id          IS DISTINCT FROM OLD.source_id
     OR NEW.reversal_of_id     IS DISTINCT FROM OLD.reversal_of_id
     OR NEW.is_legacy          IS DISTINCT FROM OLD.is_legacy
     OR NEW.created_by         IS DISTINCT FROM OLD.created_by
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Posted journal % is immutable. Reverse it and post a correction.', OLD.transaction_number
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
    RAISE EXCEPTION 'Journal % is already reversed and cannot be reinstated', OLD.transaction_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_financial_mutation() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_fin_tx_immutable ON public.financial_transactions;
CREATE TRIGGER trg_fin_tx_immutable
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_financial_mutation();

DROP TRIGGER IF EXISTS trg_fin_line_immutable ON public.financial_transaction_lines;
CREATE TRIGGER trg_fin_line_immutable
  BEFORE UPDATE OR DELETE ON public.financial_transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_financial_mutation();
