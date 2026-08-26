-- ===========================================================================
-- CHETU MICROFINANCE — full database rebuild
-- ===========================================================================
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- It DROPS the public and private schemas and rebuilds them from scratch.
-- Everything currently in the database is destroyed. That is intended here:
-- the project holds no real data yet, only seed rows.
--
-- The content below is exactly the four files in supabase/migrations/,
-- concatenated in order, preceded by the reset. Regenerate with:
--   cat supabase/migrations/*.sql
-- ===========================================================================

DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;



-- >>> 20260101000000_core_schema.sql <<<

-- ===========================================================================
-- CHETU MICROFINANCE — core schema
-- ===========================================================================
-- Tables, sequences, indexes and seed rows for the whole system. Security
-- helpers, row level security and business rules follow in the next three
-- migrations, in that order, because each depends on the one before it.
--
-- Conventions used throughout:
--   * Primary keys are TEXT holding a UUID (or a human-readable prefix), which
--     is what the application layer expects. `profiles.id` is the exception —
--     it is a real UUID because it mirrors `auth.users.id`.
--   * Money is NUMERIC(12,2). Never floating point.
--   * Records that a member of staff submits for review carry an
--     `approval_status` axis that is independent of the operational `status`.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Staff, roles and branches
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Loan Officer'
        CHECK (role IN ('Administrator', 'Branch Manager', 'Loan Officer', 'Auditor')),
    phone_number TEXT,
    avatar_url TEXT,
    -- A Branch Manager or Loan Officer is scoped to these branches.
    -- Administrators and Auditors ignore the list and see the institution.
    branch_ids TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.roles (name, description) VALUES
  ('Administrator',  'Full system access'),
  ('Branch Manager', 'Branch-scoped operations, group and member approvals, loan approvals and branch reporting'),
  ('Loan Officer',   'Field officer: group formation, member admission, loan origination and collections'),
  ('Auditor',        'Read-only institution-wide access');

CREATE TABLE public.branches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    branch_name TEXT NOT NULL UNIQUE,
    branch_code TEXT NOT NULL UNIQUE,
    location TEXT,
    phone TEXT,
    manager_name TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE public.loan_officers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    officer_code TEXT UNIQUE NOT NULL,
    branch TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    registered_clients_count INT DEFAULT 0,
    active_loans_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Groups and members
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_groups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_name TEXT NOT NULL,
    group_code TEXT UNIQUE NOT NULL,
    chairperson TEXT,
    secretary TEXT,
    treasurer TEXT,
    village TEXT,
    meeting_day TEXT,
    meeting_time TEXT,
    meeting_location TEXT,
    meeting_frequency TEXT NOT NULL DEFAULT 'Weekly'
        CHECK (meeting_frequency IN ('Daily', 'Weekly', 'Monthly')),
    formation_date DATE,
    branch TEXT,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    loan_officer_id UUID REFERENCES public.profiles(id),
    loan_officer_name TEXT,
    member_count INT NOT NULL DEFAULT 0,
    group_savings NUMERIC(12,2) DEFAULT 0.00,
    group_loans NUMERIC(12,2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    -- Approval axis: a group an officer creates must be passed by a Branch
    -- Manager before it can take members or loans.
    approval_status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.clients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    passport_photo TEXT,
    national_id_front TEXT,
    national_id_back TEXT,
    nin TEXT UNIQUE NOT NULL,
    voter_id TEXT,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    marital_status TEXT,
    date_of_birth DATE NOT NULL,
    occupation TEXT NOT NULL,
    employer TEXT,
    phone_number TEXT NOT NULL,
    alt_phone_number TEXT,
    email TEXT,
    physical_address TEXT NOT NULL,
    village TEXT NOT NULL,
    parish TEXT NOT NULL,
    sub_county TEXT NOT NULL,
    district TEXT NOT NULL,
    member_type TEXT NOT NULL DEFAULT 'Member',
    group_id TEXT REFERENCES public.client_groups(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    loan_officer_id UUID REFERENCES public.profiles(id),
    registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Blacklisted')),
    -- A deceased member stays 'Inactive' and is identified by `death_date`,
    -- which is what separates the Death List from the Inactive List.
    inactive_reason TEXT,
    inactive_date DATE,
    death_date DATE,
    readmitted_at TIMESTAMPTZ,
    approval_status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.client_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    period_from DATE,
    period_to DATE,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.group_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    role_in_group TEXT NOT NULL DEFAULT 'Member'
        CHECK (role_in_group IN ('Chairperson', 'Secretary', 'Treasurer', 'Member')),
    joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, client_id)
);

CREATE TABLE public.group_attendance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    attendees TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admission and passbook charges taken when a member joins.
CREATE TABLE public.member_fees (
    id TEXT PRIMARY KEY DEFAULT ('CM-FEE-' || to_char(now(), 'YYYY') || '-' || substr(gen_random_uuid()::text, 1, 8)),
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    admission_fee NUMERIC NOT NULL DEFAULT 0,
    passbook_fee NUMERIC NOT NULL DEFAULT 0,
    crb_fee NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    receipt_number TEXT,
    branch_id TEXT REFERENCES public.branches(id),
    collected_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Loan origination
-- ---------------------------------------------------------------------------
CREATE TABLE public.loan_products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL,
    interest_type TEXT NOT NULL CHECK (interest_type IN ('Flat Rate', 'Reducing Balance')),
    processing_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    penalty_rate NUMERIC(5,2) DEFAULT 1.00,
    grace_period_weeks INT DEFAULT 1,
    min_amount NUMERIC(12,2) NOT NULL,
    max_amount NUMERIC(12,2) NOT NULL,
    min_weeks INT NOT NULL,
    max_weeks INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.loan_applications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    application_number TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.loan_products(id) ON DELETE RESTRICT,
    requested_amount NUMERIC(12,2) NOT NULL,
    requested_weeks INT NOT NULL,
    loan_purpose TEXT NOT NULL,
    guarantor_name TEXT NOT NULL,
    guarantor_phone TEXT NOT NULL,
    guarantor_relationship TEXT NOT NULL,
    guarantor_nin TEXT NOT NULL,
    guarantor_address TEXT NOT NULL,
    guarantor2_name TEXT,
    guarantor2_phone TEXT,
    guarantor2_relationship TEXT,
    guarantor2_nin TEXT,
    guarantor2_address TEXT,
    client_photo TEXT,
    supporting_docs TEXT[],
    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Disbursed')),
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.guarantors (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    application_id TEXT NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    relationship TEXT NOT NULL,
    nin TEXT NOT NULL,
    physical_address TEXT NOT NULL,
    id_copy_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Loans and their lifecycle
-- ---------------------------------------------------------------------------
-- `status` covers the whole life of a loan. 'Fully Paid', 'Settled' and
-- 'Written Off' are terminal: nothing more can be collected on them and they
-- drop out of every collection screen and outstanding report.
CREATE TABLE public.loans (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    loan_number TEXT UNIQUE NOT NULL,
    application_id TEXT UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.loan_products(id) ON DELETE RESTRICT,
    principal_amount NUMERIC(12,2) NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL,
    interest_type TEXT NOT NULL CHECK (interest_type IN ('Flat Rate', 'Reducing Balance')),
    loan_period_weeks INT NOT NULL,
    total_interest_amount NUMERIC(12,2) NOT NULL,
    total_amount_payable NUMERIC(12,2) NOT NULL,
    weekly_installment NUMERIC(12,2) NOT NULL,
    processing_fee_amount NUMERIC(12,2) NOT NULL,
    security_amount NUMERIC NOT NULL DEFAULT 0,
    security_balance NUMERIC NOT NULL DEFAULT 0,
    cycle_number INT NOT NULL DEFAULT 1,
    first_repayment_date DATE NOT NULL,
    final_due_date DATE NOT NULL,
    outstanding_balance NUMERIC(12,2) NOT NULL,
    completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending' CONSTRAINT loans_status_check
        CHECK (status IN ('Pending', 'Active', 'Partially Paid', 'Fully Paid',
                          'Overdue', 'Defaulted', 'Settled', 'Written Off')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_at TIMESTAMPTZ,
    -- Bad debt declaration (Bad Loans List) precedes any write-off.
    is_bad_debt BOOLEAN NOT NULL DEFAULT FALSE,
    bad_debt_declared_at TIMESTAMPTZ,
    bad_debt_comment TEXT,
    writeoff_status TEXT,
    -- Early settlement.
    settled_at TIMESTAMPTZ,
    settlement_amount NUMERIC(12,2),
    settled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Write-off. The balance moves to `writeoff_amount` and
    -- `outstanding_balance` is zeroed so the portfolio stops counting it.
    writeoff_at TIMESTAMPTZ,
    writeoff_amount NUMERIC(12,2),
    writeoff_reason TEXT,
    writeoff_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.loan_repayment_schedule (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    week_number INT NOT NULL,
    due_date DATE NOT NULL,
    installment_amount NUMERIC(12,2) NOT NULL,
    principal_portion NUMERIC(12,2) NOT NULL,
    interest_portion NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Paid', 'Partially Paid', 'Overdue')),
    paid_at TIMESTAMPTZ
);

CREATE TABLE public.loan_repayments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    repayment_number TEXT UNIQUE NOT NULL,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    schedule_id TEXT REFERENCES public.loan_repayment_schedule(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money')),
    -- Which collection screen raised the receipt: Regular, Overdue, Advance,
    -- BadDebt or Settlement. Free text so new screens do not need a migration.
    collection_type TEXT NOT NULL DEFAULT 'Regular',
    -- Security deposit released against this receipt (settlements only).
    security_amount NUMERIC NOT NULL DEFAULT 0,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.loan_security_returns (
    id TEXT PRIMARY KEY DEFAULT ('LSR-' || substr(md5(random()::text), 1, 10)),
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES public.branches(id),
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    return_amount NUMERIC NOT NULL DEFAULT 0,
    previous_amount NUMERIC NOT NULL DEFAULT 0,
    present_amount NUMERIC NOT NULL DEFAULT 0,
    duration_weeks INT NOT NULL DEFAULT 0,
    principal NUMERIC NOT NULL DEFAULT 0,
    interest NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending',
    processed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bad_loan_comments (
    id TEXT PRIMARY KEY DEFAULT ('BLC-' || substr(md5(random()::text), 1, 10)),
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rollback ledger. The source receipt is deleted as part of a reversal, so the
-- reference number is kept here as free text rather than a foreign key.
CREATE TABLE public.loan_reversals (
    id TEXT PRIMARY KEY DEFAULT ('LRV-' || substr(md5(random()::text), 1, 10)),
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    reversal_type TEXT NOT NULL
        CHECK (reversal_type IN ('Disbursement', 'Repayment', 'Settlement', 'Write Off')),
    reference_number TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    reversed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Savings
-- ---------------------------------------------------------------------------
CREATE TABLE public.savings_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_number TEXT UNIQUE NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES public.client_groups(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL DEFAULT 'Individual' CHECK (account_type IN ('Individual', 'Group')),
    balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Dormant', 'Closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.savings_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_number TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Deposit', 'Withdrawal', 'Interest')),
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money')),
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Ledger, reporting and system tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    expense_number TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money')),
    receipt_url TEXT,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bank_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_number TEXT UNIQUE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Deposit', 'Withdrawal')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reference_number TEXT NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('Application', 'Repayment', 'Overdue', 'Disbursement', 'Alert', 'System')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    link_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    parameters JSONB,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    record_id TEXT,
    details TEXT NOT NULL,
    ip_address TEXT DEFAULT '127.0.0.1',
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.settings (
    id INT PRIMARY KEY DEFAULT 1,
    company_name TEXT NOT NULL DEFAULT 'Chetu Microfinance Ltd',
    company_logo_url TEXT,
    default_currency TEXT NOT NULL DEFAULT 'UGX',
    branches TEXT[] DEFAULT '{}',
    default_interest_rate NUMERIC(5,2) DEFAULT 15.00,
    default_processing_fee NUMERIC(5,2) DEFAULT 2.00,
    receipt_footer TEXT DEFAULT 'Thank you for choosing Chetu Microfinance Ltd.',
    report_header TEXT DEFAULT 'Chetu Microfinance Ltd - Official Financial Operations Report',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Sequences backing the human-readable reference numbers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.client_group_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.savings_account_number_seq;

-- ---------------------------------------------------------------------------
-- Indexes for the lookups the application actually performs
-- ---------------------------------------------------------------------------
CREATE INDEX idx_clients_registered_by      ON public.clients(registered_by);
CREATE INDEX idx_clients_branch             ON public.clients(branch_id);
CREATE INDEX idx_clients_officer            ON public.clients(loan_officer_id);
CREATE INDEX idx_clients_approval_status    ON public.clients(approval_status);
CREATE INDEX idx_groups_created_by          ON public.client_groups(created_by);
CREATE INDEX idx_groups_branch              ON public.client_groups(branch_id);
CREATE INDEX idx_groups_approval_status     ON public.client_groups(approval_status);
CREATE INDEX idx_loans_client_id            ON public.loans(client_id);
CREATE INDEX idx_loans_status               ON public.loans(status);
CREATE INDEX idx_loans_writeoff_status      ON public.loans(writeoff_status);
CREATE INDEX idx_repayments_loan_id         ON public.loan_repayments(loan_id);
CREATE INDEX idx_schedule_loan_id           ON public.loan_repayment_schedule(loan_id);
CREATE INDEX idx_lsr_loan                   ON public.loan_security_returns(loan_id);
CREATE INDEX idx_blc_loan                   ON public.bad_loan_comments(loan_id);
CREATE INDEX idx_loan_reversals_loan        ON public.loan_reversals(loan_id);
CREATE INDEX idx_audit_logs_user_id         ON public.audit_logs(user_id);
CREATE INDEX idx_savings_accounts_client    ON public.savings_accounts(client_id);
CREATE INDEX idx_savings_tx_account         ON public.savings_transactions(account_id);
CREATE INDEX idx_expenses_branch_id         ON public.expenses(branch_id);
CREATE INDEX idx_bank_transactions_branch_id ON public.bank_transactions(branch_id);

-- ---------------------------------------------------------------------------
-- Base grants. Row level security (next migrations) does the real gatekeeping.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- >>> 20260101000100_security_helpers.sql <<<

-- ===========================================================================
-- CHETU MICROFINANCE — security helper functions
-- ===========================================================================
-- Every row level security policy is expressed in terms of these functions.
-- They live in a `private` schema that is deliberately not exposed through
-- PostgREST, so a signed-in client cannot call them directly to probe the
-- permission model — only the policy engine evaluates them.
--
-- All are SECURITY DEFINER with a pinned search_path: they read
-- `public.profiles`, which is itself protected by RLS, and would otherwise
-- recurse into their own policies.
--
-- The visibility model, in one place:
--   Administrator  institution-wide, read and write
--   Auditor        institution-wide, read only (every write policy denies)
--   Branch Manager everything in the branches on their profile
--   Loan Officer   only the records they registered or are assigned to
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_staff_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Administrator' $$;

CREATE OR REPLACE FUNCTION private.is_auditor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Auditor' $$;

CREATE OR REPLACE FUNCTION private.is_branch_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() = 'Branch Manager' $$;

CREATE OR REPLACE FUNCTION private.is_admin_or_auditor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator', 'Auditor') $$;

-- The two roles that may approve or reject a submission.
CREATE OR REPLACE FUNCTION private.is_management()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.current_staff_role() IN ('Administrator', 'Branch Manager') $$;

-- NULL means "not branch-scoped at all" (Administrator, Auditor). Policies
-- test `IS NULL OR <id> = ANY (...)`, so NULL reads as institution-wide.
CREATE OR REPLACE FUNCTION private.caller_branch_ids()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT CASE WHEN p.role IN ('Administrator', 'Auditor') THEN NULL
                  ELSE COALESCE(p.branch_ids, '{}') END
      FROM public.profiles p WHERE p.id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Record reachability
-- ---------------------------------------------------------------------------
-- A Branch Manager reaches every record in their branches — without this they
-- could not approve the group and member submissions their officers raise, nor
-- see the loans behind them, which is the entire point of the role.
CREATE OR REPLACE FUNCTION private.can_see_client(_client_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.clients c
                   WHERE c.id = _client_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_group(_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.client_groups g
                   WHERE g.id = _group_id
                     AND (g.created_by = auth.uid()
                          OR g.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND g.branch_id = ANY (private.caller_branch_ids())))) $$;

CREATE OR REPLACE FUNCTION private.can_see_loan(_loan_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_admin_or_auditor()
        OR EXISTS (SELECT 1 FROM public.loans l
                   JOIN public.clients c ON c.id = l.client_id
                   WHERE l.id = _loan_id
                     AND (c.registered_by = auth.uid()
                          OR c.loan_officer_id = auth.uid()
                          OR (private.is_branch_manager()
                              AND c.branch_id = ANY (private.caller_branch_ids())))) $$;

-- ---------------------------------------------------------------------------
-- Lock the helpers down: reachable by the policy engine, not by clients.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'current_staff_role()', 'is_admin()', 'is_auditor()', 'is_branch_manager()',
    'is_admin_or_auditor()', 'is_management()', 'caller_branch_ids()',
    'can_see_client(text)', 'can_see_group(text)', 'can_see_loan(text)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION private.' || f || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.' || f || ' TO authenticated, service_role';
  END LOOP;
END
$do$;


-- >>> 20260101000200_row_level_security.sql <<<

-- ===========================================================================
-- CHETU MICROFINANCE — row level security
-- ===========================================================================
-- Every table is deny-by-default: RLS is enabled and only the policies below
-- open anything up. Two rules run through all of it:
--
--   1. An Auditor never writes. Every write policy carries
--      `NOT private.is_auditor()`, so the read-only role holds even if an
--      Auditor is somehow also reachable through another branch of the
--      predicate.
--   2. Reads and writes are separated. A Branch Manager can read everything in
--      their branches but only writes where a policy says so.
-- ===========================================================================

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_officers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_fees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_security_returns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bad_loan_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_reversals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Staff, roles, branches, reference data
-- ---------------------------------------------------------------------------
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_admin_or_auditor());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "staff read roles" ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write settings" ON public.settings FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "branch scoped branch reads" ON public.branches FOR SELECT TO authenticated
  USING (private.caller_branch_ids() IS NULL OR id = ANY (private.caller_branch_ids()));
CREATE POLICY "admins manage branches" ON public.branches FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "loan officers read" ON public.loan_officers FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_admin_or_auditor());
CREATE POLICY "loan officers write" ON public.loan_officers FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "products read" ON public.loan_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products write" ON public.loan_products FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
CREATE POLICY "groups read" ON public.client_groups FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR created_by = auth.uid()
      OR loan_officer_id = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));

CREATE POLICY "groups insert" ON public.client_groups FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (created_by = auth.uid()
          AND (private.caller_branch_ids() IS NULL
               OR (branch_id IS NOT NULL AND branch_id = ANY (private.caller_branch_ids()))))));

-- A Branch Manager must be able to update groups they did not create, because
-- approving or rejecting one is an update.
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR created_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR created_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))));

CREATE POLICY "groups delete" ON public.client_groups FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "group members read" ON public.group_members FOR SELECT TO authenticated
  USING (private.can_see_group(group_id));
CREATE POLICY "group members write" ON public.group_members FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_group(group_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

CREATE POLICY "attendance read" ON public.group_attendance FOR SELECT TO authenticated
  USING (private.can_see_group(group_id));
CREATE POLICY "attendance write" ON public.group_attendance FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_group(group_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_group(group_id));

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR registered_by = auth.uid()
      OR loan_officer_id = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));

CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (registered_by = auth.uid()
          AND (private.caller_branch_ids() IS NULL
               OR (branch_id IS NOT NULL AND branch_id = ANY (private.caller_branch_ids()))))));

-- Same reasoning as groups: approving, rejecting and recording a death are all
-- updates a Branch Manager performs on rows an officer created.
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR registered_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR registered_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids()))));

CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "client docs read" ON public.client_documents FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "client docs write" ON public.client_documents FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_client(client_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));

CREATE POLICY "member fees read" ON public.member_fees FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR collected_by = auth.uid()
      OR (private.is_branch_manager() AND branch_id = ANY (private.caller_branch_ids())));
CREATE POLICY "member fees insert" ON public.member_fees FOR INSERT TO authenticated
  WITH CHECK (private.current_staff_role() IN ('Administrator', 'Branch Manager', 'Loan Officer'));
CREATE POLICY "member fees update" ON public.member_fees FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "member fees delete" ON public.member_fees FOR DELETE TO authenticated
  USING (private.is_admin());

-- ---------------------------------------------------------------------------
-- Loan applications and guarantors
-- ---------------------------------------------------------------------------
CREATE POLICY "applications read" ON public.loan_applications FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "applications insert" ON public.loan_applications FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "applications update" ON public.loan_applications FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
CREATE POLICY "applications delete" ON public.loan_applications FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "guarantors read" ON public.guarantors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications a
                 WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));
CREATE POLICY "guarantors write" ON public.guarantors FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.loan_applications a
                WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)))
  WITH CHECK (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.loan_applications a
                WHERE a.id = guarantors.application_id AND private.can_see_client(a.client_id)));

-- ---------------------------------------------------------------------------
-- Loans, schedules and receipts
-- ---------------------------------------------------------------------------
CREATE POLICY "loans read" ON public.loans FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "loans insert" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "loans update" ON public.loans FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
CREATE POLICY "loans delete" ON public.loans FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "schedule read" ON public.loan_repayment_schedule FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "schedule write" ON public.loan_repayment_schedule FOR ALL TO authenticated
  USING (NOT private.is_auditor() AND private.can_see_loan(loan_id))
  WITH CHECK (NOT private.is_auditor() AND private.can_see_loan(loan_id));

CREATE POLICY "repayments read" ON public.loan_repayments FOR SELECT TO authenticated
  USING (private.can_see_client(client_id));
CREATE POLICY "repayments insert" ON public.loan_repayments FOR INSERT TO authenticated
  WITH CHECK (NOT private.is_auditor() AND private.can_see_client(client_id));
CREATE POLICY "repayments update" ON public.loan_repayments FOR UPDATE TO authenticated
  USING (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)))
  WITH CHECK (NOT private.is_auditor() AND (private.is_admin() OR private.can_see_client(client_id)));
-- Deleting a receipt is how a repayment is reversed, so it is Administrator-only.
CREATE POLICY "repayments delete" ON public.loan_repayments FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "staff read loan security returns" ON public.loan_security_returns FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "management write loan security returns" ON public.loan_security_returns FOR INSERT TO authenticated
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "management update loan security returns" ON public.loan_security_returns FOR UPDATE TO authenticated
  USING (private.is_management() AND private.can_see_loan(loan_id))
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "admins delete loan security returns" ON public.loan_security_returns FOR DELETE TO authenticated
  USING (private.is_admin());

CREATE POLICY "staff read bad loan comments" ON public.bad_loan_comments FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "management write bad loan comments" ON public.bad_loan_comments FOR INSERT TO authenticated
  WITH CHECK (private.is_management() AND private.can_see_loan(loan_id));
CREATE POLICY "admins delete bad loan comments" ON public.bad_loan_comments FOR DELETE TO authenticated
  USING (private.is_admin());

-- Anyone who can see the loan can read what was rolled back on it; only an
-- Administrator can record a rollback, and nobody can edit or erase one.
CREATE POLICY "staff read loan reversals" ON public.loan_reversals FOR SELECT TO authenticated
  USING (private.can_see_loan(loan_id));
CREATE POLICY "admins write loan reversals" ON public.loan_reversals FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

-- ---------------------------------------------------------------------------
-- Savings
-- ---------------------------------------------------------------------------
CREATE POLICY "savings accounts read" ON public.savings_accounts FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id)));
CREATE POLICY "savings accounts write" ON public.savings_accounts FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND (private.is_admin()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id))))
  WITH CHECK (NOT private.is_auditor()
    AND (private.is_admin()
      OR (client_id IS NOT NULL AND private.can_see_client(client_id))
      OR (group_id IS NOT NULL AND private.can_see_group(group_id))));

CREATE POLICY "savings tx read" ON public.savings_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_accounts s
                 WHERE s.id = savings_transactions.account_id
                   AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));
CREATE POLICY "savings tx write" ON public.savings_transactions FOR ALL TO authenticated
  USING (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.savings_accounts s
                WHERE s.id = savings_transactions.account_id
                  AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))))
  WITH CHECK (NOT private.is_auditor()
    AND EXISTS (SELECT 1 FROM public.savings_accounts s
                WHERE s.id = savings_transactions.account_id
                  AND (private.can_see_client(s.client_id) OR private.can_see_group(s.group_id))));

-- ---------------------------------------------------------------------------
-- Ledger, notifications, reporting, audit
-- ---------------------------------------------------------------------------
CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor());
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "bank read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor());
CREATE POLICY "bank write" ON public.bank_transactions FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR recipient_id IS NULL OR private.is_admin_or_auditor());
-- Staff fan alerts out to each other, so any signed-in user may insert; a user
-- may only modify or clear notifications addressed to them.
CREATE POLICY "notifications write" ON public.notifications FOR ALL TO authenticated
  USING (recipient_id = auth.uid() OR private.is_admin())
  WITH CHECK (recipient_id = auth.uid() OR private.is_admin() OR NOT private.is_auditor());

CREATE POLICY "reports all" ON public.reports FOR ALL TO authenticated
  USING (generated_by = auth.uid() OR private.is_admin_or_auditor())
  WITH CHECK (generated_by = auth.uid() OR private.is_admin());

-- The audit trail is append-only for everyone; an entry is always filed
-- against the person who caused it.
CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated
  USING (private.is_admin_or_auditor() OR user_id = auth.uid());
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit delete" ON public.audit_logs FOR DELETE TO authenticated
  USING (private.is_admin());


-- >>> 20260101000300_business_rules.sql <<<

-- ===========================================================================
-- CHETU MICROFINANCE — business rules
-- ===========================================================================
-- Reference-number generation, `updated_at` maintenance, and the transition
-- guards that enforce the approval chain at the database level.
--
-- The guards matter because row level security answers "may this person touch
-- this row?" but not "may this person make *this particular* change?".
-- Approving a group, writing a loan off and reversing a posted receipt are all
-- ordinary UPDATEs to RLS; only a trigger can tell them apart.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
-- ---------------------------------------------------------------------------
-- Supabase Auth owns `auth.users`; this mirrors each new account into
-- `public.profiles` so the rest of the schema has a staff record to key on.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'System User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'Loan Officer'),
    NEW.raw_user_meta_data->>'phone_number'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_groups_updated_at BEFORE UPDATE ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_member_fees_updated_at BEFORE UPDATE ON public.member_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loan_applications_updated_at BEFORE UPDATE ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_savings_accounts_updated_at BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lsr_updated_at BEFORE UPDATE ON public.loan_security_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reference numbers
-- ---------------------------------------------------------------------------
-- The client sends a best-effort number; these triggers replace it whenever it
-- is blank or already taken, so two officers registering at the same moment
-- cannot collide.
CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_code IS NULL OR NEW.group_code = ''
     OR EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code) THEN
    LOOP
      NEW.group_code := 'CM-GRP-' || to_char(now(), 'YYYY') || '-'
                        || lpad(nextval('public.client_group_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_number IS NULL OR NEW.client_number = ''
     OR EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number) THEN
    LOOP
      NEW.client_number := 'CM-CL-' || to_char(now(), 'YYYY') || '-'
                           || lpad(nextval('public.client_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_savings_account_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = ''
     OR EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number) THEN
    LOOP
      NEW.account_number := 'CM-SAV-' || to_char(now(), 'YYYY') || '-'
                            || lpad(nextval('public.savings_account_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_group_code BEFORE INSERT ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_group_code();
CREATE TRIGGER trg_set_client_number BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_client_number();
CREATE TRIGGER trg_set_savings_account_number BEFORE INSERT ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_savings_account_number();

-- ---------------------------------------------------------------------------
-- Approval chain: groups and members
-- ---------------------------------------------------------------------------
-- A Loan Officer submits; a Branch Manager or Administrator decides. The
-- officer may push their own rejected submission back to 'Pending' after
-- fixing it, but may never approve anything — including their own work.
CREATE OR REPLACE FUNCTION public.guard_group_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_management() OR OLD.created_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this group';
      END IF;
    ELSE
      IF NOT private.is_management() THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a group';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_client_approval_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'Pending' THEN
      IF NOT (private.is_management() OR OLD.registered_by = auth.uid()) THEN
        RAISE EXCEPTION 'Not allowed to resubmit this member';
      END IF;
    ELSE
      IF NOT private.is_management() THEN
        RAISE EXCEPTION 'Only a Branch Manager or Administrator can approve or reject a member';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_group_approval BEFORE UPDATE ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_approval_transition();
CREATE TRIGGER trg_guard_client_approval BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_approval_transition();

-- ---------------------------------------------------------------------------
-- Loan lifecycle
-- ---------------------------------------------------------------------------
-- Settlement is an ordinary collection action, so any non-auditor who can
-- reach the loan may record one. Destroying a receivable, reopening a closed
-- loan and rolling a disbursement back are all Administrator-only.
CREATE OR REPLACE FUNCTION public.guard_loan_lifecycle_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Written Off' AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can write off a loan';
    END IF;

    IF OLD.status IN ('Settled', 'Written Off', 'Fully Paid')
       AND NEW.status NOT IN ('Settled', 'Written Off', 'Fully Paid')
       AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can reopen a closed loan';
    END IF;

    -- Undoing a disbursement pushes an Active loan back to Pending.
    IF OLD.status = 'Active' AND NEW.status = 'Pending' AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Only an Administrator can undo a disbursement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_loan_lifecycle BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.guard_loan_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- Trigger functions are invoked by the engine, never called directly.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_group_code()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_client_number()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_savings_account_number()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_group_approval_transition()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_client_approval_transition()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loan_lifecycle_transition()    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the notification bell listens on this table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime'
                   AND schemaname = 'public'
                   AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
