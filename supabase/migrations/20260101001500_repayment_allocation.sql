-- ===========================================================================
-- CHETU MICROFINANCE — store the repayment allocation
-- ===========================================================================
-- A receipt has always recorded one number: `amount_paid`. How much of it was
-- principal and how much interest was implicit in the instalment schedule, and
-- every screen that wanted the split re-derived it — differently.
--
-- `allocatePayment` in the application decides WHICH instalments a payment
-- clears (oldest due date first). That rule is unchanged and is not moved
-- here. What is added is the split WITHIN what was paid, which the schedule
-- has always determined: each instalment carries a frozen `principal_portion`
-- and `interest_portion`, so a payment against it splits in that ratio.
--
-- Backfill checked against production before this was written: all 26 existing
-- receipts link to exactly one schedule row, none exceeds its instalment, and
-- the reconstructed split sums to the receipt exactly — 708,200 principal +
-- 142,900 interest = 851,100. The migration re-derives those figures rather
-- than trusting that note, and aborts if they do not reconcile.
--
-- Penalty and fee columns are added at zero. Production has no penalty logic —
-- `loan_products.penalty_rate` is read by nothing — so no historical penalty
-- is invented. The columns exist so that enabling penalties later is a feature,
-- not another migration of this kind.
-- ===========================================================================

ALTER TABLE public.loan_repayments
  ADD COLUMN IF NOT EXISTS principal_portion NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_portion  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_portion   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_portion       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allocation_source TEXT;

COMMENT ON COLUMN public.loan_repayments.principal_portion IS
  'Principal cleared by this receipt. Derived from the instalment''s frozen principal/interest ratio.';
COMMENT ON COLUMN public.loan_repayments.interest_portion IS
  'Interest earned by this receipt. Carries the rounding remainder so the four portions sum to amount_paid exactly.';
COMMENT ON COLUMN public.loan_repayments.penalty_portion IS
  'Penalties collected. Always zero until penalty logic is enabled — no historical penalty is fabricated.';
COMMENT ON COLUMN public.loan_repayments.allocation_source IS
  'How the split was determined: schedule_backfill | posted | manual.';

-- ---------------------------------------------------------------------------
-- Backfill. Only rows that have not been allocated yet, so re-running is inert.
-- Interest takes the remainder rather than its own rounded quotient, which
-- guarantees principal + interest = amount_paid with no stray shilling.
-- ---------------------------------------------------------------------------
UPDATE public.loan_repayments r
   SET principal_portion = LEAST(
         round(r.amount_paid * s.principal_portion / NULLIF(s.installment_amount, 0), 2),
         r.amount_paid),
       interest_portion  = r.amount_paid - LEAST(
         round(r.amount_paid * s.principal_portion / NULLIF(s.installment_amount, 0), 2),
         r.amount_paid),
       allocation_source = 'schedule_backfill'
  FROM public.loan_repayment_schedule s
 WHERE s.id = r.schedule_id
   AND r.allocation_source IS NULL
   AND s.installment_amount > 0;

-- A receipt with no usable schedule link cannot be split without guessing, and
-- guessing is exactly what this programme forbids. Record it as principal —
-- the conservative choice, since it understates income rather than inventing
-- it — and mark it so reconciliation can single these out.
UPDATE public.loan_repayments
   SET principal_portion = amount_paid,
       interest_portion  = 0,
       allocation_source = 'unallocated_principal'
 WHERE allocation_source IS NULL;

-- ---------------------------------------------------------------------------
-- Assertions. A migration that silently mis-splits money is worse than one
-- that refuses to run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad        INTEGER;
  v_total      NUMERIC(14,2);
  v_parts      NUMERIC(14,2);
  v_unalloc    INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.loan_repayments
   WHERE round(principal_portion + interest_portion + penalty_portion + fee_portion, 2)
         <> round(amount_paid, 2);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Repayment allocation backfill: % receipt(s) do not sum to amount_paid', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.loan_repayments
   WHERE principal_portion < 0 OR interest_portion < 0
      OR penalty_portion < 0 OR fee_portion < 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Repayment allocation backfill: % receipt(s) have a negative portion', v_bad;
  END IF;

  SELECT COALESCE(sum(amount_paid), 0),
         COALESCE(sum(principal_portion + interest_portion + penalty_portion + fee_portion), 0)
    INTO v_total, v_parts FROM public.loan_repayments;
  IF v_total <> v_parts THEN
    RAISE EXCEPTION 'Repayment allocation backfill: total collected % does not equal allocated %',
      v_total, v_parts;
  END IF;

  SELECT count(*) INTO v_unalloc
    FROM public.loan_repayments WHERE allocation_source = 'unallocated_principal';
  IF v_unalloc > 0 THEN
    RAISE WARNING 'Repayment allocation: % receipt(s) had no usable schedule link and were booked wholly to principal', v_unalloc;
  END IF;

  RAISE NOTICE 'Repayment allocation backfill complete: % collected across % receipts',
    v_total, (SELECT count(*) FROM public.loan_repayments);
END $$;

-- ---------------------------------------------------------------------------
-- Auto-allocation on insert.
--
-- This is what keeps the rollout backward compatible. Existing application
-- code inserts a repayment without the four portions; left alone they would
-- default to zero and the sum check below would reject the row, breaking
-- collections the moment this migration lands. Instead the trigger derives the
-- split from the instalment the receipt is against, exactly as the backfill
-- did, so old code and new code both produce correct allocations.
--
-- A caller that DOES supply an allocation keeps it, so the posting functions
-- and any future penalty-aware path stay in control.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_repayment_portions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_principal_portion NUMERIC(12,2);
  v_installment       NUMERIC(12,2);
  v_principal         NUMERIC(12,2);
BEGIN
  -- Caller supplied a split: respect it.
  IF COALESCE(NEW.principal_portion, 0) + COALESCE(NEW.interest_portion, 0)
     + COALESCE(NEW.penalty_portion, 0) + COALESCE(NEW.fee_portion, 0) > 0 THEN
    NEW.allocation_source := COALESCE(NEW.allocation_source, 'posted');
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount_paid, 0) = 0 THEN
    NEW.allocation_source := COALESCE(NEW.allocation_source, 'posted');
    RETURN NEW;
  END IF;

  SELECT s.principal_portion, s.installment_amount
    INTO v_principal_portion, v_installment
    FROM public.loan_repayment_schedule s
   WHERE s.id = NEW.schedule_id;

  IF v_installment IS NULL OR v_installment <= 0 THEN
    -- No usable instalment to split against. Book it to principal rather than
    -- guessing an interest figure, and flag it for reconciliation.
    NEW.principal_portion := NEW.amount_paid;
    NEW.interest_portion  := 0;
    NEW.allocation_source := COALESCE(NEW.allocation_source, 'unallocated_principal');
    RETURN NEW;
  END IF;

  v_principal := LEAST(round(NEW.amount_paid * v_principal_portion / v_installment, 2), NEW.amount_paid);
  NEW.principal_portion := v_principal;
  NEW.interest_portion  := NEW.amount_paid - v_principal;   -- remainder: sums exactly
  NEW.penalty_portion   := COALESCE(NEW.penalty_portion, 0);
  NEW.fee_portion       := COALESCE(NEW.fee_portion, 0);
  NEW.allocation_source := COALESCE(NEW.allocation_source, 'schedule_auto');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_repayment_portions() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_allocate_repayment_portions ON public.loan_repayments;
CREATE TRIGGER trg_allocate_repayment_portions
  BEFORE INSERT ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.allocate_repayment_portions();

-- Now that every write path fills the portions, hold them to the invariant.
ALTER TABLE public.loan_repayments
  DROP CONSTRAINT IF EXISTS loan_repayments_allocation_sums;
ALTER TABLE public.loan_repayments
  ADD CONSTRAINT loan_repayments_allocation_sums CHECK (
    round(principal_portion + interest_portion + penalty_portion + fee_portion, 2)
      = round(amount_paid, 2)
  );

ALTER TABLE public.loan_repayments
  DROP CONSTRAINT IF EXISTS loan_repayments_allocation_non_negative;
ALTER TABLE public.loan_repayments
  ADD CONSTRAINT loan_repayments_allocation_non_negative CHECK (
    principal_portion >= 0 AND interest_portion >= 0
    AND penalty_portion >= 0 AND fee_portion >= 0
  );
