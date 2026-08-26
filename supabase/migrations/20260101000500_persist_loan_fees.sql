-- ===========================================================================
-- CHETU MICROFINANCE — persist every loan fee on the loan
-- ===========================================================================
-- The fee schedule is:
--   Processing fee     4% of principal
--   CRB fee            1% of principal
--   Security deposit  15% of principal (refundable)
--   Group maintenance  UGX 2,000 flat, per loan
--
-- Only the processing fee and the security deposit were ever written to the
-- loan. The CRB and group maintenance amounts were recomputed from the current
-- schedule every time a screen rendered them, which means no record of the
-- money existed in the database, fee income could not be reported, and
-- changing a rate would silently rewrite the charges on every historical loan.
--
-- These columns make the charge as-taken part of the loan, so a loan always
-- reports what was actually charged at approval.
-- ===========================================================================

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS crb_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_maintenance_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Cash actually handed over: principal less every upfront deduction.
  ADD COLUMN IF NOT EXISTS net_disbursed_amount NUMERIC(12,2);

-- Any loan approved before this migration has the two amounts implied by the
-- schedule in force at the time, so fill them in rather than leaving zeros
-- that would understate fee income.
UPDATE public.loans
   SET crb_fee_amount = ROUND(principal_amount * 0.01, 2)
 WHERE crb_fee_amount = 0;

UPDATE public.loans
   SET group_maintenance_fee = 2000
 WHERE group_maintenance_fee = 0;

UPDATE public.loans
   SET net_disbursed_amount = GREATEST(
         0,
         principal_amount
           - COALESCE(processing_fee_amount, 0)
           - COALESCE(crb_fee_amount, 0)
           - COALESCE(security_amount, 0)
           - COALESCE(group_maintenance_fee, 0)
       )
 WHERE net_disbursed_amount IS NULL;

-- Fee income is queried by date of disbursement across a branch, so index the
-- column the reports actually filter on.
CREATE INDEX IF NOT EXISTS idx_loans_disbursed_at ON public.loans(disbursed_at);

COMMENT ON COLUMN public.loans.processing_fee_amount IS 'Processing fee charged at approval (4% of principal under the current schedule).';
COMMENT ON COLUMN public.loans.crb_fee_amount IS 'Credit Reference Bureau fee charged at approval (1% of principal).';
COMMENT ON COLUMN public.loans.security_amount IS 'Refundable security deposit taken at approval (15% of principal).';
COMMENT ON COLUMN public.loans.group_maintenance_fee IS 'Flat group maintenance fee charged per loan (UGX 2,000).';
COMMENT ON COLUMN public.loans.net_disbursed_amount IS 'Cash handed to the member: principal less all upfront deductions.';

-- ---------------------------------------------------------------------------
-- Admission charges
-- ---------------------------------------------------------------------------
-- Admission and passbook are UGX 5,000 each and are taken once per member.
-- Defaulting them here means a fee row written without amounts still records
-- the correct charge instead of zero.
ALTER TABLE public.member_fees
  ALTER COLUMN admission_fee SET DEFAULT 5000,
  ALTER COLUMN passbook_fee SET DEFAULT 5000;

COMMENT ON COLUMN public.member_fees.admission_fee IS 'One-off admission fee charged when a member is admitted (UGX 5,000).';
COMMENT ON COLUMN public.member_fees.passbook_fee IS 'Passbook issued at admission (UGX 5,000).';
COMMENT ON COLUMN public.member_fees.crb_fee IS 'Zero at admission — CRB is charged per loan, not per member.';

-- One fee record per member: admission happens once, so a duplicate row would
-- double-count fee income.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_fees_client_unique ON public.member_fees(client_id);
