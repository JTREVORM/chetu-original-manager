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
