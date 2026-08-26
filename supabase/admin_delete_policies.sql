-- RUN THIS IN THE SUPABASE SQL EDITOR (after 20260805020000_restore_app_schema.sql).
--
-- Administrator DELETE policies.
--
-- The restore migration granted SELECT/INSERT/UPDATE to authenticated users and
-- a DELETE policy only on client_groups. The app deletes from many more tables
-- (member removal, reversing transactions, "Clear all data" in System Settings),
-- and without a DELETE policy PostgREST silently returns 204 while removing zero
-- rows. These policies restrict deletes to Administrators.

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'clients',
        'group_members',
        'group_attendance',
        'loan_products',
        'loan_applications',
        'loans',
        'loan_repayments',
        'loan_repayment_schedule',
        'savings_accounts',
        'savings_transactions',
        'expenses',
        'bank_transactions',
        'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins can delete ' || tbl, tbl);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
                     EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''Administrator'')
                 )',
                'Admins can delete ' || tbl, tbl
            );
        END IF;
    END LOOP;
END;
$$;

-- client_groups is missing a SELECT policy, so groups never load for signed-in
-- staff (the Loan Application form shows "-- Choose Group --" only).
DROP POLICY IF EXISTS "Authenticated can read client groups" ON public.client_groups;
CREATE POLICY "Authenticated can read client groups"
  ON public.client_groups FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.client_groups TO authenticated;
