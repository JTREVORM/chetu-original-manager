-- ---------------------------------------------------------------------------
-- Repayment schedule integrity
-- ---------------------------------------------------------------------------
-- Additive and idempotent. It creates no table, drops nothing, deletes no row
-- and rewrites no amount. Safe to run more than once.
--
-- Three things:
--   1. a unique key on (loan_id, week_number), so a loan cannot hold two rows
--      for the same week and the repair can insert with ON CONFLICT DO NOTHING
--   2. indexes for the due-date reads the collection screens make
--   3. a report on client_groups.meeting_day, which is nullable free text
--
-- The unique key is NOT forced. If duplicates already exist the migration
-- reports them and leaves the constraint off — choosing which of two rows for
-- week 4 survives can discard a payment, and that is a decision for a person.
-- Resolve the duplicates, then run this file again.
--
-- ROLLBACK
--   ALTER TABLE public.loan_repayment_schedule
--     DROP CONSTRAINT IF EXISTS loan_repayment_schedule_loan_week_key;
--   DROP INDEX IF EXISTS public.idx_schedule_loan_due;
--   DROP INDEX IF EXISTS public.idx_schedule_due_date;
--   DROP INDEX IF EXISTS public.idx_repayments_schedule_id;
--   -- The meeting_day CHECK is not added by this file; nothing else to undo.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Duplicate detection. Reports, never resolves.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  duplicate_groups INT;
  duplicate_rows   INT;
  sample           TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(n), 0)
    INTO duplicate_groups, duplicate_rows
  FROM (
    SELECT loan_id, week_number, COUNT(*) AS n
    FROM public.loan_repayment_schedule
    GROUP BY loan_id, week_number
    HAVING COUNT(*) > 1
  ) d;

  IF duplicate_groups = 0 THEN
    -- Named explicitly so the rollback above can find it, and so a second run
    -- of this file is a no-op rather than an error.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'loan_repayment_schedule_loan_week_key'
        AND conrelid = 'public.loan_repayment_schedule'::regclass
    ) THEN
      ALTER TABLE public.loan_repayment_schedule
        ADD CONSTRAINT loan_repayment_schedule_loan_week_key UNIQUE (loan_id, week_number);
      RAISE NOTICE 'Added UNIQUE (loan_id, week_number) — no duplicates found.';
    ELSE
      RAISE NOTICE 'UNIQUE (loan_id, week_number) already present.';
    END IF;
  ELSE
    SELECT string_agg(format('loan %s week %s x%s', loan_id, week_number, n), E'\n  ')
      INTO sample
    FROM (
      SELECT loan_id, week_number, COUNT(*) AS n
      FROM public.loan_repayment_schedule
      GROUP BY loan_id, week_number
      HAVING COUNT(*) > 1
      ORDER BY loan_id, week_number
      LIMIT 25
    ) s;

    RAISE WARNING E'\n'
      '================================================================\n'
      'UNIQUE (loan_id, week_number) NOT APPLIED\n'
      '================================================================\n'
      '% duplicated (loan, week) pairs covering % rows.\n'
      'Nothing has been deleted or altered. Review these by hand — one of\n'
      'the rows may carry a payment — then re-run this migration:\n'
      '  %\n'
      '================================================================',
      duplicate_groups, duplicate_rows, COALESCE(sample, '(none listed)');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Indexes for the due-date reads.
-- ---------------------------------------------------------------------------
-- The collection screens and the day-collection reports select instalments by
-- loan and by due date. Both are plain b-trees; neither changes a row.
CREATE INDEX IF NOT EXISTS idx_schedule_loan_due
  ON public.loan_repayment_schedule (loan_id, due_date);

CREATE INDEX IF NOT EXISTS idx_schedule_due_date
  ON public.loan_repayment_schedule (due_date);

-- `loan_repayments.schedule_id` has existed since the first migration and was
-- never populated, so it was never worth an index. Receipts are now linked to
-- the instalment they settle, and the loan history reads them that way.
CREATE INDEX IF NOT EXISTS idx_repayments_schedule_id
  ON public.loan_repayments (schedule_id)
  WHERE schedule_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Meeting-day report. Reports only; adds no constraint.
-- ---------------------------------------------------------------------------
-- `client_groups.meeting_day` is nullable TEXT with no CHECK, so production can
-- hold NULL, '', 'Tues', 'TUESDAY' or something that is not a day at all. The
-- loan schedule now depends on it, so it needs to be clean — but normalising it
-- rewrites group records, and a value nobody recognises must not be guessed at.
-- This lists what is there. Fix the groups through the application, then add
-- the constraint with the statement at the foot of this file.
DO $$
DECLARE
  bad_count  INT;
  null_count INT;
  listing    TEXT;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.client_groups
  WHERE meeting_day IS NULL OR btrim(meeting_day) = '';

  SELECT COUNT(*) INTO bad_count
  FROM public.client_groups
  WHERE meeting_day IS NOT NULL
    AND btrim(meeting_day) <> ''
    AND initcap(btrim(meeting_day)) NOT IN
        ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday');

  SELECT string_agg(format('%s = %L (%s group(s))', 'meeting_day', value, n), E'\n  ')
    INTO listing
  FROM (
    SELECT meeting_day AS value, COUNT(*) AS n
    FROM public.client_groups
    WHERE meeting_day IS NULL
       OR btrim(meeting_day) = ''
       OR initcap(btrim(meeting_day)) NOT IN
          ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
    GROUP BY meeting_day
    ORDER BY COUNT(*) DESC
    LIMIT 25
  ) s;

  IF bad_count = 0 AND null_count = 0 THEN
    RAISE NOTICE 'Every group meeting_day is a recognised weekday.';
  ELSE
    RAISE WARNING E'\n'
      '================================================================\n'
      'GROUP MEETING DAYS NEED ATTENTION\n'
      '================================================================\n'
      '% group(s) have no meeting day; % have an unrecognised value.\n'
      'A loan for a member of one of these groups cannot be scheduled on\n'
      'the group meeting day and falls back to the disbursement weekday.\n'
      'Nothing has been changed. Values found:\n'
      '  %\n'
      '================================================================',
      null_count, bad_count, COALESCE(listing, '(none)');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Once every group has a recognised weekday, run this by hand to keep it that
-- way. It is deliberately not part of the migration: it would fail the whole
-- file on one bad legacy row, and NULL stays permitted because a group can be
-- registered before its meeting day is agreed.
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.client_groups
--     ADD CONSTRAINT client_groups_meeting_day_check
--     CHECK (meeting_day IS NULL OR meeting_day IN
--       ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));
