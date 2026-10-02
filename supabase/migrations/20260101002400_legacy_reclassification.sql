-- ===========================================================================
-- CHETU MICROFINANCE — clearing the legacy balance, and three gaps beside it
-- ===========================================================================
-- Management has instructed that the historical Legacy / Unclassified balance
-- should no longer sit unresolved. It cannot be cleared with anything that
-- shipped: LEGACY-UNCLASSIFIED is a control account, so
-- `assert_postable_account` refuses it as a source or destination, and
-- `post_reconciliation_adjustment`, `post_capital_injection` and
-- `post_opening_balance` all fail on it. That refusal is correct — nobody
-- should be able to adjust a control account from a screen — so the answer is
-- a controlled function that records who authorised the reclassification and
-- why, not a loosening of the rule.
--
-- Preparing the cut-over with Chetu's real figures turned up two more things
-- that had to be fixed in the same breath:
--
--   * `post_internal_transfer` never checked whether the source account held
--     the money. It drove Cash at Hand to −99,699,999 in testing and
--     `v_ledger_health` did not complain.
--   * `post_opening_balance` refuses an amount of zero, while the cut-over
--     checklist says to record a counted zero as a fact. Chetu's bank balance
--     IS zero, so the cut-over could not have recorded it.
--
-- ---------------------------------------------------------------------------
-- Where the legacy balance goes: a liability, not equity
-- ---------------------------------------------------------------------------
-- The balance measures funding that reached the business from a source the
-- records never captured. Management has asked for it to be resolved but has
-- NOT said where it came from.
--
-- Booking it to equity would assert that the owners put it in. Nobody knows
-- that. If the money turns out to have come from a director, a shareholder or
-- anyone else on terms, the business owes it, and an equity line would have
-- hidden a real obligation inside owners' funds — overstating equity and
-- understating what is owed, which is the wrong error to make.
--
-- So it goes to `HISTORICAL-FUNDING-SUSPENSE`, classified as a **liability**.
-- That is the conservative reading and the conventional one: a suspense
-- account is exactly the instrument for an amount whose proper classification
-- is not yet determined, and prudence says recognise the obligation until the
-- source is known rather than the other way round.
--
-- What this achieves:
--
--   * LEGACY-UNCLASSIFIED becomes zero — the control account is resolved;
--   * the 2,452,500 stays whole, on its own line, named for what it is;
--   * it is not counted as documented owner capital;
--   * it is not income and it is not an expense;
--   * it sits on the balance sheet where a reader will see it;
--   * and it can be moved again, by the same function with its own audit row,
--     the day Chetu says whether it was capital, a director's loan or
--     something else. Liability → equity is one controlled journal away.
--
-- `CAPITAL-INTRODUCED` is left alone at 2,090,000 throughout: documented
-- capital and unidentified funding never share a line.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Somewhere honest for it to go
-- ---------------------------------------------------------------------------
-- `account_type` is constrained to a fixed list, and 'suspense' is not on it.
-- Adding it rather than reusing 'other' is worth the two lines: the type shows
-- in the chart of accounts and in exports, and "suspense" tells a reader what
-- the account is for where "other" tells them nothing. Nothing switches
-- exhaustively on the column — the views filter on `account_class`, and
-- `defaultAccountFor` only looks for liquid types and falls through.
ALTER TABLE public.financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_type_check;
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_type_check
  CHECK (account_type = ANY (ARRAY[
    'cash_at_hand', 'cashier_till', 'branch_cash', 'bank', 'mobile_money', 'merchant',
    'loans_receivable', 'interest_receivable', 'penalty_receivable', 'security_held',
    'capital', 'income', 'expense', 'writeoff', 'suspense', 'other']));

-- A liability, and a suspense account: an obligation recognised because the
-- source is unknown, held apart until it is identified. Not asset_liquid, so
-- it is never counted as cash; not equity, so it is never counted as capital.
INSERT INTO public.financial_accounts
  (account_code, account_name, account_type, account_class,
   allow_manual_posting, is_system, sort_order, status, description)
VALUES
  ('HISTORICAL-FUNDING-SUSPENSE', 'Unidentified Historical Funding', 'suspense', 'liability',
   FALSE, TRUE, 615, 'Active',
   'Funding that reached the business before the ledger existed and whose source the records never captured. Held as a liability because the source is unidentified: until Chetu confirms whether it was capital, a director or shareholder loan, or something else, the prudent assumption is that the business may owe it. Reclassified out of Legacy / Unclassified under management authority, and reclassifiable again through reclassify_legacy_funds once the source is known. Never merged with Capital Introduced.')
ON CONFLICT (account_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The audit record
-- ---------------------------------------------------------------------------
-- A reclassification of a control account is a judgement, not a transaction,
-- and the judgement is the part that needs to survive. The journal says what
-- moved; this says who decided, on whose authority and on what grounds.
CREATE TABLE IF NOT EXISTS public.legacy_reclassifications (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  reclassification_ref    TEXT UNIQUE NOT NULL,
  source_account_id       TEXT NOT NULL REFERENCES public.financial_accounts(id),
  source_code             TEXT NOT NULL,
  original_legacy_balance NUMERIC(14,2) NOT NULL,
  amount                  NUMERIC(14,2) NOT NULL,
  residual_after          NUMERIC(14,2) NOT NULL,
  destination_account_id  TEXT NOT NULL REFERENCES public.financial_accounts(id),
  destination_code        TEXT NOT NULL,
  reason                  TEXT NOT NULL,
  authorised_by           TEXT NOT NULL,
  authorisation_reference TEXT,
  transaction_id          TEXT NOT NULL REFERENCES public.financial_transactions(id),
  performed_by            UUID REFERENCES auth.users(id),
  performed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legacy_reclassifications_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT legacy_reclassifications_reason_given   CHECK (btrim(reason) <> ''),
  CONSTRAINT legacy_reclassifications_authorised     CHECK (btrim(authorised_by) <> '')
);

COMMENT ON TABLE public.legacy_reclassifications IS
  'One row per reclassification of unidentified historical funding: which account it came out of, the balance before, the amount moved, where it went, why, on whose authority, by whom and when. Covers the move out of Legacy / Unclassified and any later move out of suspense once the source is identified. Append-only.';

CREATE SEQUENCE IF NOT EXISTS public.legacy_reclassification_seq START 1;

ALTER TABLE public.legacy_reclassifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legacy reclassifications read" ON public.legacy_reclassifications;
CREATE POLICY "legacy reclassifications read" ON public.legacy_reclassifications
  FOR SELECT TO authenticated USING (private.is_management() OR private.is_auditor());

GRANT SELECT ON public.legacy_reclassifications TO authenticated;
GRANT ALL    ON public.legacy_reclassifications TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.legacy_reclassification_seq TO authenticated, service_role;

-- Append-only, and only from the function. Same discriminator as 002200.
CREATE OR REPLACE FUNCTION public.guard_legacy_reclassification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF private.is_api_write() THEN
    RAISE EXCEPTION
      'A reclassification record cannot be written directly. Use reclassify_legacy_funds, which writes it with its journal.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'A reclassification record is permanent and cannot be % once written', lower(TG_OP)
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_legacy_reclassification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_legacy_reclassification() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_legacy_reclassification ON public.legacy_reclassifications;
CREATE TRIGGER trg_guard_legacy_reclassification
  BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_reclassifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_reclassification();

-- ---------------------------------------------------------------------------
-- 3. The reclassification itself
-- ---------------------------------------------------------------------------
-- Administrator only. The journal and the audit row are written together, and
-- the destination must be an equity or liability control account — never a
-- cash account, because this moves a classification, not money. Nothing leaves
-- the building and nothing arrives.
--
-- `_source_code` exists so the same mechanism, the same audit table and the
-- same reference series carry the second move too: out of Legacy /
-- Unclassified now, and out of suspense into capital or a director's loan on
-- the day Chetu identifies the source. The source is restricted by name to the
-- two accounts that hold unidentified funding, so this can never be used to
-- shuffle anything else.
CREATE OR REPLACE FUNCTION public.reclassify_legacy_funds(
  _destination_code        TEXT,
  _reason                  TEXT,
  _authorised_by           TEXT,
  _amount                  NUMERIC DEFAULT NULL,
  _authorisation_reference TEXT DEFAULT NULL,
  _transaction_date        DATE DEFAULT CURRENT_DATE,
  _source_code             TEXT DEFAULT 'LEGACY-UNCLASSIFIED'
)
RETURNS TABLE (reclassification_ref TEXT, transaction_id TEXT, transaction_number TEXT,
               source_code TEXT, original_legacy_balance NUMERIC, amount_reclassified NUMERIC,
               residual_after NUMERIC, destination_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_src        public.financial_accounts%ROWTYPE;
  v_balance    NUMERIC(14,2);
  v_dest       public.financial_accounts%ROWTYPE;
  v_amount     NUMERIC(14,2);
  v_residual   NUMERIC(14,2);
  v_tx         TEXT;
  v_ref        TEXT;
  v_lines      JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator may reclassify unidentified historical funding'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reclassification must record why it was made' USING ERRCODE = 'check_violation';
  END IF;
  IF _authorised_by IS NULL OR btrim(_authorised_by) = '' THEN
    RAISE EXCEPTION 'A reclassification must record who authorised it' USING ERRCODE = 'check_violation';
  END IF;

  IF _source_code NOT IN ('LEGACY-UNCLASSIFIED', 'HISTORICAL-FUNDING-SUSPENSE') THEN
    RAISE EXCEPTION
      '% is not an account holding unidentified historical funding. Only Legacy / Unclassified and the historical funding suspense account can be reclassified this way.',
      _source_code USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_src FROM public.financial_accounts WHERE account_code = _source_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source account % does not exist', _source_code USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(current_balance, 0) INTO v_balance
    FROM public.v_account_balances WHERE account_id = v_src.id;

  IF round(COALESCE(v_balance, 0), 2) = 0 THEN
    RAISE EXCEPTION '% is already zero. There is nothing to reclassify.', v_src.account_name
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_dest FROM public.financial_accounts WHERE account_code = _destination_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination account % does not exist', _destination_code USING ERRCODE = 'check_violation';
  END IF;
  IF _destination_code = _source_code THEN
    RAISE EXCEPTION 'Source and destination must differ' USING ERRCODE = 'check_violation';
  END IF;
  IF v_dest.account_class NOT IN ('equity', 'liability') THEN
    RAISE EXCEPTION
      'Destination % is a % account. Unidentified funding is reclassified to equity or to a liability, never to cash — this moves a classification, not money.',
      v_dest.account_name, v_dest.account_class
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_dest.status <> 'Active' THEN
    RAISE EXCEPTION 'Destination % is %', v_dest.account_name, v_dest.status USING ERRCODE = 'check_violation';
  END IF;

  -- Default: the whole balance. Otherwise a part of it, in the same direction.
  v_amount := COALESCE(_amount, abs(v_balance));
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'The amount reclassified must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  IF round(v_amount, 2) > round(abs(v_balance), 2) THEN
    RAISE EXCEPTION '% holds % — cannot reclassify %', v_src.account_name, abs(v_balance), v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  v_ref := 'CM-RECLASS-' || to_char(now(), 'YYYY') || '-' ||
           lpad(nextval('public.legacy_reclassification_seq')::TEXT, 4, '0');

  -- The source is cleared towards zero whichever side it sits on, and the
  -- destination takes the other leg. A credit balance on the legacy asset
  -- account — the usual case, more cash out than the records explain — is
  -- cleared by debiting it and crediting the liability.
  IF v_balance < 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_src.id,  'direction', 'debit',  'amount', v_amount,
                         'memo', format('%s cleared', v_src.account_name)),
      jsonb_build_object('account_id', v_dest.id, 'direction', 'credit', 'amount', v_amount,
                         'memo', _reason));
    v_residual := v_balance + v_amount;
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_dest.id, 'direction', 'debit',  'amount', v_amount,
                         'memo', _reason),
      jsonb_build_object('account_id', v_src.id,  'direction', 'credit', 'amount', v_amount,
                         'memo', format('%s cleared', v_src.account_name)));
    v_residual := v_balance - v_amount;
  END IF;

  v_tx := private.write_journal(
    'reconciliation_adjustment',
    format('Reclassification %s: %s to %s — %s',
           v_ref, v_src.account_name, v_dest.account_name, _reason),
    v_lines, _transaction_date, NULL, v_ref);

  INSERT INTO public.legacy_reclassifications
    (reclassification_ref, source_account_id, source_code, original_legacy_balance, amount,
     residual_after, destination_account_id, destination_code, reason, authorised_by,
     authorisation_reference, transaction_id, performed_by)
  VALUES
    (v_ref, v_src.id, _source_code, v_balance, v_amount, v_residual, v_dest.id,
     _destination_code, _reason, _authorised_by, _authorisation_reference, v_tx, auth.uid());

  RETURN QUERY
    SELECT v_ref, v_tx, t.transaction_number, _source_code, v_balance, v_amount,
           v_residual, _destination_code
      FROM public.financial_transactions t WHERE t.id = v_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.reclassify_legacy_funds(TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclassify_legacy_funds(TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reclassify_legacy_funds(TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT) IS
  'Moves unidentified historical funding out of Legacy / Unclassified, or later out of the suspense account, to an equity or liability account under recorded authority. Administrator only. Writes the journal and the audit row together; reversed through reverse_financial_transaction, never deleted.';

-- ---------------------------------------------------------------------------
-- 4. A transfer cannot spend money the account does not hold
-- ---------------------------------------------------------------------------
-- The only change is the balance check. Everything else is migration 001600's
-- function, unchanged: one balanced journal, two liquid accounts, no income and
-- no expense, the user on the journal, reversible like any other.
--
-- Deliberately scoped to transfers. A blanket rule that no liquid account may
-- go negative would also block disbursement and expense, and with Chetu's bank
-- balance at zero that would stop most lending on day one. Overdrafts arriving
-- by any other path are reported by `v_ledger_health` below instead, where
-- management can see them and decide.
CREATE OR REPLACE FUNCTION public.post_internal_transfer(
  _from_account_id TEXT, _to_account_id TEXT, _amount NUMERIC,
  _transaction_date DATE DEFAULT CURRENT_DATE,
  _reference TEXT DEFAULT NULL, _note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_from TEXT; v_to TEXT; v_branch TEXT; v_available NUMERIC(14,2);
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

  SELECT COALESCE(current_balance, 0) INTO v_available
    FROM public.v_account_balances WHERE account_id = _from_account_id;
  IF round(_amount, 2) > round(COALESCE(v_available, 0), 2) THEN
    RAISE EXCEPTION '% holds only %, so % cannot be transferred out of it',
      v_from, to_char(COALESCE(v_available, 0), 'FM999,999,999,990.00'),
      to_char(_amount, 'FM999,999,999,990.00')
      USING ERRCODE = 'check_violation',
            HINT = 'Move money in from another account first, or transfer a smaller amount.';
  END IF;

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

-- ---------------------------------------------------------------------------
-- 5. A counted zero is a fact worth recording
-- ---------------------------------------------------------------------------
-- The cut-over records an opening balance for every real account, including
-- ones holding nothing — Chetu's bank balance is zero on the cut-over date.
-- The old function refused it. A zero balance gets its date stamped and no
-- journal, because `write_journal` drops zero lines and would otherwise leave a
-- journal with no lines at all, which `v_ledger_health` rightly reports.
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
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'An opening balance cannot be negative' USING ERRCODE = 'check_violation';
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

  -- Counted, and empty. The date is the record; there is nothing to post.
  IF _amount = 0 THEN
    RETURN NULL;
  END IF;

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
-- 6. Two more things the standing check should have been watching
-- ---------------------------------------------------------------------------
--   * a real cash, bank or wallet account in overdraft — money spent that was
--     never there. `LEGACY-UNCLASSIFIED` and the other system accounts are
--     excluded: a negative balance there is the measurement, not a fault.
--   * the legacy balance still sitting unresolved after cut-over is complete,
--     so it cannot quietly drift back after management has cleared it.
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
  SELECT 'liquid_account_overdrawn', v.account_id, v.account_code,
         format('%s is overdrawn by UGX %s', v.account_name, abs(v.current_balance))
    FROM public.v_account_balances v
    JOIN public.financial_accounts a ON a.id = v.account_id
   WHERE v.account_class = 'asset_liquid'
     AND NOT a.is_system
     AND v.current_balance < 0

  UNION ALL
  SELECT 'legacy_unresolved_after_cutover', v.account_id, v.account_code,
         format('Legacy / Unclassified still holds UGX %s after cut-over completion', v.current_balance)
    FROM public.v_account_balances v
   WHERE v.account_code = 'LEGACY-UNCLASSIFIED'
     AND round(COALESCE(v.current_balance, 0), 2) <> 0
     AND COALESCE((SELECT financial_cutover_completed FROM public.settings WHERE id = 1), FALSE)

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
-- 7. `security_held` has to stop meaning "every liability"
-- ---------------------------------------------------------------------------
-- `v_money_position` exposed `sum(liability)` under the alias `security_held`.
-- That was harmless while SECURITY-HELD was the only liability on the books,
-- and it becomes a lie the moment a second one exists: with the suspense
-- account holding 2,452,500, three reports would have told staff Chetu holds
-- 3,442,500 of members' deposits when it holds 990,000.
--
-- So the member security figure now comes from the member security account,
-- the unidentified funding gets its own line, and the total is published
-- alongside them. `net_worth_ledger` and `total_financial_position` still
-- subtract the TOTAL liabilities — they were right all along, and must not
-- change.
CREATE OR REPLACE VIEW public.v_money_position
WITH (security_invoker = on) AS
WITH liquid AS (
  SELECT account_type, current_balance FROM public.v_account_balances
   WHERE account_class = 'asset_liquid' AND status <> 'Closed'
),
book AS (
  SELECT
    COALESCE(sum(total_outstanding - interest_outstanding), 0) AS principal_outstanding,
    COALESCE(sum(interest_outstanding), 0)                    AS interest_outstanding,
    COALESCE(sum(total_outstanding) FILTER (WHERE days_past_due > 0), 0)   AS overdue_portfolio,
    COALESCE(sum(total_outstanding - interest_outstanding)
             FILTER (WHERE days_past_due > 0), 0)                          AS overdue_principal,
    COALESCE(sum(total_outstanding) FILTER (WHERE days_past_due > 30), 0)  AS par30_value,
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
    COALESCE(sum(natural_balance) FILTER (WHERE account_type  = 'security_held'), 0) AS member_security,
    COALESCE(sum(natural_balance) FILTER (WHERE account_type  = 'suspense'), 0)      AS unidentified_funding,
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
  0::NUMERIC                      AS penalties_receivable,
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
  -- Members' money, and only members' money. This column kept its name and its
  -- position; what changed is that it no longer quietly means "every liability".
  equity.member_security                                 AS security_held,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + equity.ledger_receivable                                             AS total_assets_ledger,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + equity.ledger_receivable - equity.total_liabilities                  AS net_worth_ledger,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + book.principal_outstanding + book.interest_outstanding               AS total_assets,
  COALESCE((SELECT sum(current_balance) FROM liquid), 0)
    + book.principal_outstanding + book.interest_outstanding
    - equity.total_liabilities                                             AS total_financial_position,
  -- Appended, not inserted: CREATE OR REPLACE VIEW can add columns at the end
  -- but cannot reorder or rename the ones already there.
  --
  -- Funding on the books whose source nobody has identified. Its own line, so
  -- it is never read as members' deposits and never as capital.
  equity.unidentified_funding                            AS unidentified_funding,
  equity.total_liabilities                               AS total_liabilities
FROM book, equity;

COMMENT ON VIEW public.v_money_position IS
  'One row: where the money is, what the loan book holds, and what Chetu owes and is worth. security_held is member deposits alone; unidentified_funding is historical funding whose source is unknown; total_liabilities is both together, and is what the net-worth figures subtract.';

GRANT SELECT ON public.v_money_position TO authenticated, service_role;
