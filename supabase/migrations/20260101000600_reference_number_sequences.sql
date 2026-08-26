-- ===========================================================================
-- CHETU MICROFINANCE — server-side reference numbers
-- ===========================================================================
-- Reference numbers were built in the browser as `rows.length + 1`, where
-- `rows` is what the signed-in user can see. Row level security means an
-- officer sees only their own records, so every officer counts from their own
-- total and they all generate CM-LA-2026-0001. The unique constraint then
-- rejects the second one: a second loan officer could not submit their first
-- application at all.
--
-- Group codes, member numbers and savings account numbers already avoided this
-- by using database sequences. These triggers extend the same approach to the
-- remaining six, so a number is allocated once, by the database, from a
-- counter no policy can filter.
--
-- Each trigger keeps a caller-supplied value when it is present and unique, so
-- meaningful prefixes the app chooses (a settlement receipt, say) survive.
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS public.loan_application_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.loan_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.repayment_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.expense_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.bank_transaction_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.savings_transaction_number_seq;

-- Allocates the next free "<prefix>-<year>-<nnnn>" for a column, retrying past
-- any value already taken so a partially-numbered table cannot wedge it.
CREATE OR REPLACE FUNCTION private.next_reference(
  _prefix TEXT,
  _sequence TEXT,
  _table TEXT,
  _column TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  taken BOOLEAN;
BEGIN
  LOOP
    candidate := _prefix || '-' || to_char(now(), 'YYYY') || '-'
                 || lpad(nextval(_sequence)::text, 4, '0');
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1)', _table, _column)
      INTO taken USING candidate;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION private.next_reference(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.next_reference(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_loan_application_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.application_number IS NULL OR NEW.application_number = ''
     OR EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.application_number = NEW.application_number) THEN
    NEW.application_number := private.next_reference('CM-LA', 'public.loan_application_number_seq', 'loan_applications', 'application_number');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_loan_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.loan_number IS NULL OR NEW.loan_number = ''
     OR EXISTS (SELECT 1 FROM public.loans l WHERE l.loan_number = NEW.loan_number) THEN
    NEW.loan_number := private.next_reference('CM-LN', 'public.loan_number_seq', 'loans', 'loan_number');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_repayment_numbers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.repayment_number IS NULL OR NEW.repayment_number = ''
     OR EXISTS (SELECT 1 FROM public.loan_repayments r WHERE r.repayment_number = NEW.repayment_number) THEN
    NEW.repayment_number := private.next_reference('CM-RP', 'public.repayment_number_seq', 'loan_repayments', 'repayment_number');
  END IF;
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = ''
     OR EXISTS (SELECT 1 FROM public.loan_repayments r WHERE r.receipt_number = NEW.receipt_number) THEN
    NEW.receipt_number := private.next_reference('CM-REC', 'public.receipt_number_seq', 'loan_repayments', 'receipt_number');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_expense_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.expense_number IS NULL OR NEW.expense_number = ''
     OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.expense_number = NEW.expense_number) THEN
    NEW.expense_number := private.next_reference('CM-EX', 'public.expense_number_seq', 'expenses', 'expense_number');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bank_transaction_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = ''
     OR EXISTS (SELECT 1 FROM public.bank_transactions t WHERE t.transaction_number = NEW.transaction_number) THEN
    NEW.transaction_number := private.next_reference('CM-TX', 'public.bank_transaction_number_seq', 'bank_transactions', 'transaction_number');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_savings_transaction_numbers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = ''
     OR EXISTS (SELECT 1 FROM public.savings_transactions t WHERE t.transaction_number = NEW.transaction_number) THEN
    NEW.transaction_number := private.next_reference('CM-SVT', 'public.savings_transaction_number_seq', 'savings_transactions', 'transaction_number');
  END IF;
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = ''
     OR EXISTS (SELECT 1 FROM public.savings_transactions t WHERE t.receipt_number = NEW.receipt_number) THEN
    NEW.receipt_number := private.next_reference('CM-SVR', 'public.savings_transaction_number_seq', 'savings_transactions', 'receipt_number');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_loan_application_number ON public.loan_applications;
CREATE TRIGGER trg_set_loan_application_number BEFORE INSERT ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_loan_application_number();

DROP TRIGGER IF EXISTS trg_set_loan_number ON public.loans;
CREATE TRIGGER trg_set_loan_number BEFORE INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_loan_number();

DROP TRIGGER IF EXISTS trg_set_repayment_numbers ON public.loan_repayments;
CREATE TRIGGER trg_set_repayment_numbers BEFORE INSERT ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.set_repayment_numbers();

DROP TRIGGER IF EXISTS trg_set_expense_number ON public.expenses;
CREATE TRIGGER trg_set_expense_number BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_number();

DROP TRIGGER IF EXISTS trg_set_bank_transaction_number ON public.bank_transactions;
CREATE TRIGGER trg_set_bank_transaction_number BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_bank_transaction_number();

DROP TRIGGER IF EXISTS trg_set_savings_transaction_numbers ON public.savings_transactions;
CREATE TRIGGER trg_set_savings_transaction_numbers BEFORE INSERT ON public.savings_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_savings_transaction_numbers();

REVOKE EXECUTE ON FUNCTION public.set_loan_application_number()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_loan_number()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_repayment_numbers()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_expense_number()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_bank_transaction_number()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_savings_transaction_numbers()  FROM PUBLIC, anon, authenticated;

-- Start each sequence past anything already issued, so applying this to a
-- populated database does not immediately re-issue a taken number.
DO $do$
DECLARE
  n BIGINT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(application_number, '^.*-', ''), '')::BIGINT), 0) INTO n FROM public.loan_applications;
  PERFORM setval('public.loan_application_number_seq', GREATEST(n, 1));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(loan_number, '^.*-', ''), '')::BIGINT), 0) INTO n FROM public.loans;
  PERFORM setval('public.loan_number_seq', GREATEST(n, 1));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(repayment_number, '^.*-', ''), '')::BIGINT), 0) INTO n FROM public.loan_repayments;
  PERFORM setval('public.repayment_number_seq', GREATEST(n, 1));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_number, '^.*-', ''), '')::BIGINT), 0) INTO n FROM public.loan_repayments;
  PERFORM setval('public.receipt_number_seq', GREATEST(n, 1));
EXCEPTION WHEN OTHERS THEN
  -- Non-numeric legacy suffixes are fine: the retry loop in next_reference
  -- skips anything already taken.
  NULL;
END
$do$;
