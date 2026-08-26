-- MEMBERS
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS voter_id text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'Member',
  ADD COLUMN IF NOT EXISTS loan_officer_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS inactive_reason text,
  ADD COLUMN IF NOT EXISTS inactive_date date,
  ADD COLUMN IF NOT EXISTS death_date date,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS readmitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'Approved';

-- LOANS
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS security_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS security_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cycle_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_bad_debt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bad_debt_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS bad_debt_comment text,
  ADD COLUMN IF NOT EXISTS writeoff_status text;

-- REPAYMENTS
ALTER TABLE public.loan_repayments
  ADD COLUMN IF NOT EXISTS collection_type text NOT NULL DEFAULT 'Regular',
  ADD COLUMN IF NOT EXISTS security_amount numeric NOT NULL DEFAULT 0;

-- DOCUMENTS
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date;

-- LOAN SECURITY RETURNS
CREATE TABLE IF NOT EXISTS public.loan_security_returns (
  id text PRIMARY KEY DEFAULT ('LSR-' || substr(md5(random()::text), 1, 10)),
  loan_id text NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.branches(id),
  return_date date NOT NULL DEFAULT current_date,
  return_amount numeric NOT NULL DEFAULT 0,
  previous_amount numeric NOT NULL DEFAULT 0,
  present_amount numeric NOT NULL DEFAULT 0,
  duration_weeks integer NOT NULL DEFAULT 0,
  principal numeric NOT NULL DEFAULT 0,
  interest numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  processed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_security_returns TO authenticated;
GRANT ALL ON public.loan_security_returns TO service_role;
ALTER TABLE public.loan_security_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read loan security returns" ON public.loan_security_returns
  FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));
CREATE POLICY "staff write loan security returns" ON public.loan_security_returns
  FOR INSERT TO authenticated WITH CHECK (private.can_see_loan(loan_id));
CREATE POLICY "staff update loan security returns" ON public.loan_security_returns
  FOR UPDATE TO authenticated USING (private.can_see_loan(loan_id)) WITH CHECK (private.can_see_loan(loan_id));
CREATE POLICY "admins delete loan security returns" ON public.loan_security_returns
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE TRIGGER trg_lsr_updated_at BEFORE UPDATE ON public.loan_security_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- BAD LOAN COMMENTS
CREATE TABLE IF NOT EXISTS public.bad_loan_comments (
  id text PRIMARY KEY DEFAULT ('BLC-' || substr(md5(random()::text), 1, 10)),
  loan_id text NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bad_loan_comments TO authenticated;
GRANT ALL ON public.bad_loan_comments TO service_role;
ALTER TABLE public.bad_loan_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read bad loan comments" ON public.bad_loan_comments
  FOR SELECT TO authenticated USING (private.can_see_loan(loan_id));
CREATE POLICY "staff write bad loan comments" ON public.bad_loan_comments
  FOR INSERT TO authenticated WITH CHECK (private.can_see_loan(loan_id));
CREATE POLICY "admins delete bad loan comments" ON public.bad_loan_comments
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE INDEX IF NOT EXISTS idx_lsr_loan ON public.loan_security_returns(loan_id);
CREATE INDEX IF NOT EXISTS idx_blc_loan ON public.bad_loan_comments(loan_id);
CREATE INDEX IF NOT EXISTS idx_clients_officer ON public.clients(loan_officer_id);
