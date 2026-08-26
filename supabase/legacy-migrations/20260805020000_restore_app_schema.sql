-- ============================================================================
-- REPAIR MIGRATION: restore the application schema
-- ============================================================================
-- The 2026-08-05 "fresh schema" migration rebuilt public with a reduced set of
-- columns (clients lost nin/phone_number/physical_address/..., loans lost the
-- weekly-installment columns, group_members / notifications / reports were
-- dropped entirely). The application code and TypeScript types expect the
-- 2026-08-01 schema, so every insert failed with
-- "Could not find the 'nin' column of 'clients' in the schema cache".
--
-- This migration rebuilds public to the schema the app actually uses, adds the
-- base GRANTs for anon/authenticated (RLS alone is not enough) and re-applies
-- the profiles hardening. Run once in the Supabase SQL editor.
-- ============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CHETU MICROFINANCE MANAGEMENT SYSTEM - PRODUCTION DATABASE SCHEMA
-- Migration: 20260801000000_initial_schema.sql
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE (Extends Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Administrator', 'Loan Officer', 'Auditor')),
    phone_number TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ROLES TABLE
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Roles
INSERT INTO public.roles (name, description) VALUES
('Administrator', 'Full system access, approvals, settings, financial ledger and audit logs'),
('Loan Officer', 'Client onboarding, loan application submission, disbursement, and weekly repayment collection'),
('Auditor', 'Read-only administrative access for financial, audit, operational, and log reviews')
ON CONFLICT (name) DO NOTHING;

-- 3. LOAN OFFICERS TABLE
CREATE TABLE IF NOT EXISTS public.loan_officers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    officer_code TEXT UNIQUE NOT NULL,
    branch TEXT NOT NULL DEFAULT 'Kampala Central',
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    registered_clients_count INT DEFAULT 0,
    active_loans_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CLIENT GROUPS TABLE
CREATE TABLE IF NOT EXISTS public.client_groups (
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
    branch TEXT NOT NULL,
    member_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    group_savings NUMERIC(12,2) DEFAULT 0.00,
    group_loans NUMERIC(12,2) DEFAULT 0.00
);

-- 5. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    passport_photo TEXT,
    national_id_front TEXT,
    national_id_back TEXT,
    nin TEXT UNIQUE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
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
    group_id TEXT REFERENCES public.client_groups(id) ON DELETE SET NULL,
    registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Blacklisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. CLIENT DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.client_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);



-- 7. LOAN PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.loan_products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL, -- percentage
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

-- 8. LOAN APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.loan_applications (
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
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Disbursed')),
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. GUARANTORS TABLE
CREATE TABLE IF NOT EXISTS public.guarantors (
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

-- 10. LOANS TABLE
CREATE TABLE IF NOT EXISTS public.loans (
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
    first_repayment_date DATE NOT NULL,
    final_due_date DATE NOT NULL,
    outstanding_balance NUMERIC(12,2) NOT NULL,
    completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Active', 'Partially Paid', 'Fully Paid', 'Overdue', 'Defaulted')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. LOAN REPAYMENT SCHEDULE TABLE
CREATE TABLE IF NOT EXISTS public.loan_repayment_schedule (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    week_number INT NOT NULL,
    due_date DATE NOT NULL,
    installment_amount NUMERIC(12,2) NOT NULL,
    principal_portion NUMERIC(12,2) NOT NULL,
    interest_portion NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Partially Paid', 'Overdue')),
    paid_at TIMESTAMPTZ
);

-- 12. LOAN REPAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.loan_repayments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    repayment_number TEXT UNIQUE NOT NULL,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    schedule_id TEXT REFERENCES public.loan_repayment_schedule(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money')),
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    expense_number TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Salaries', 'Rent', 'Fuel', 'Utilities', 'Internet', 'Maintenance', 'Transport', 'Office Supplies', 'Other')),
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money')),
    receipt_url TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. BANK TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_number TEXT UNIQUE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Deposit', 'Withdrawal')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reference_number TEXT NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Application', 'Repayment', 'Overdue', 'Disbursement', 'Alert', 'System')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    link_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    parameters JSONB,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
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

-- 18. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    id INT PRIMARY KEY DEFAULT 1,
    company_name TEXT NOT NULL DEFAULT 'Chetu Microfinance Ltd',
    company_logo_url TEXT,
    default_currency TEXT NOT NULL DEFAULT 'UGX',
    branches TEXT[] DEFAULT ARRAY['Kampala Main', 'Mukono Branch', 'Jinja Branch'],
    default_interest_rate NUMERIC(5,2) DEFAULT 15.00,
    default_processing_fee NUMERIC(5,2) DEFAULT 2.00,
    receipt_footer TEXT DEFAULT 'Thank you for choosing Chetu Microfinance Ltd. Prompt repayments build a strong credit standing.',
    report_header TEXT DEFAULT 'Chetu Microfinance Ltd - Official Financial Operations Report',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Seed Initial Settings
INSERT INTO public.settings (id, company_name) VALUES (1, 'Chetu Microfinance Ltd')
ON CONFLICT (id) DO NOTHING;

-- 19. SAVINGS ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.savings_accounts (
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

-- 20. SAVINGS TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.savings_transactions (
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

-- 21. GROUP MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.group_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    role_in_group TEXT NOT NULL DEFAULT 'Member' CHECK (role_in_group IN ('Chairperson', 'Secretary', 'Treasurer', 'Member')),
    joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, client_id)
);

-- 22. GROUP ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.group_attendance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    attendees TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_clients_client_number ON public.clients(client_number);
CREATE INDEX IF NOT EXISTS idx_clients_nin ON public.clients(nin);
CREATE INDEX IF NOT EXISTS idx_loans_loan_number ON public.loans(loan_number);
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON public.loans(client_id);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON public.loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_date ON public.loan_repayments(payment_date);
CREATE INDEX IF NOT EXISTS idx_schedule_loan_id ON public.loan_repayment_schedule(loan_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_client ON public.savings_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_group ON public.savings_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_savings_tx_account ON public.savings_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_savings_tx_date ON public.savings_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_attendance_group ON public.group_attendance(group_id);

-- AUTOMATIC PROFILE TRIGGER ON AUTH USER CREATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'System User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'Loan Officer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROW LEVEL SECURITY POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read profiles
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to read & insert clients
CREATE POLICY "Authenticated users can view clients" ON public.clients
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create clients" ON public.clients
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clients" ON public.clients
    FOR UPDATE TO authenticated USING (true);

-- Allow admins full rights on expenses, bank transactions, and settings
CREATE POLICY "Admins full access to expenses" ON public.expenses
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

CREATE POLICY "Admins full access to bank_transactions" ON public.bank_transactions
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

CREATE POLICY "Admins full access to audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

CREATE POLICY "Authenticated users view savings accounts" ON public.savings_accounts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins manage savings accounts" ON public.savings_accounts
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Authenticated users view savings transactions" ON public.savings_transactions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins manage savings transactions" ON public.savings_transactions
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Authenticated users view group members" ON public.group_members
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins manage group members" ON public.group_members
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Authenticated users view group attendance" ON public.group_attendance
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins manage group attendance" ON public.group_attendance
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

-- Client Groups RLS Policies (was missing — caused inability to create groups)
CREATE POLICY "Authenticated users can view client_groups" ON public.client_groups
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins can create client_groups" ON public.client_groups
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Officers and Admins can update client_groups" ON public.client_groups
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Admins can delete client_groups" ON public.client_groups
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

-- Loan Products RLS Policies (was missing)
CREATE POLICY "Authenticated users can view loan_products" ON public.loan_products
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loan_products" ON public.loan_products
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

-- Loan Applications RLS Policies (was missing)
CREATE POLICY "Authenticated users can view loan_applications" ON public.loan_applications
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins can create loan_applications" ON public.loan_applications
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

CREATE POLICY "Officers and Admins can update loan_applications" ON public.loan_applications
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

-- Loans RLS Policies (was missing)
CREATE POLICY "Authenticated users can view loans" ON public.loans
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loans" ON public.loans
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

-- Loan Repayment Schedule RLS Policies (was missing)
CREATE POLICY "Authenticated users can view loan_repayment_schedule" ON public.loan_repayment_schedule
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins can manage loan_repayment_schedule" ON public.loan_repayment_schedule
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

-- Loan Repayments RLS Policies (was missing)
CREATE POLICY "Authenticated users can view loan_repayments" ON public.loan_repayments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Officers and Admins can create loan_repayments" ON public.loan_repayments
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Administrator', 'Loan Officer'))
    );

-- Settings RLS Policies (was missing)
CREATE POLICY "Authenticated users can view settings" ON public.settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage settings" ON public.settings
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Administrator')
    );

-- Profiles: allow users to update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Audit logs: allow inserts from authenticated users (writes happen from app)
CREATE POLICY "Authenticated users can insert audit_logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Grant table-level privileges to service_role (used by trusted, server-side admin tooling only)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- Ensure future tables also get privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


-- === BASE GRANTS ===
-- ============================================================================
-- FIX: "permission denied for schema public"
-- ============================================================================
-- Your RLS policies (fix-rls-policies-safe.sql / migrations) are correct,
-- but Postgres also requires base GRANTs on the schema and tables BEFORE
-- RLS is ever evaluated. The fresh_schema_with_rls.sql migration only
-- granted privileges to `service_role`, never to `anon` / `authenticated`.
-- That's why every insert/select from the app (using the anon/authenticated
-- key) fails with "permission denied for schema public".
--
-- Run this whole file once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Allow the roles to even "see" the public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant table-level privileges for all EXISTING tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public
  TO anon;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  TO service_role;

-- 3. Grant sequence privileges (needed for SERIAL/IDENTITY id columns,
--    and harmless if you use gen_random_uuid()/TEXT ids instead)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, anon;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  TO service_role;

-- 4. Make sure any FUTURE tables/sequences you create automatically get
--    these same privileges (so this class of bug can't happen again)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- ============================================================================
-- DONE. Your existing RLS policies (per-table USING/WITH CHECK clauses)
-- remain in full effect on top of these grants — this only unblocks the
-- base permission check that happens before RLS is evaluated.
-- ============================================================================
SELECT 'Base schema/table permissions granted to anon and authenticated.' AS status;


-- === PROFILES HARDENING ===
-- ============================================================================
-- HARDEN PROFILES TABLE RLS
-- ============================================================================
-- The original policies on `profiles` only checked `auth.role() = 'authenticated'`,
-- which means ANY logged-in user (including a Loan Officer) could, from the
-- browser console, run something like:
--
--   supabase.from('profiles').update({ role: 'Administrator' }).eq('id', myOwnId)
--
-- ...and grant themselves admin rights, or delete/edit any other user's
-- profile. This migration:
--   1. Restricts INSERT/UPDATE to a user's own row only.
--   2. Adds a trigger that blocks role/status changes unless the request is
--      made with the service_role key (i.e. via the `admin-users` Edge
--      Function), so role/status can only change through the audited,
--      admin-checked server-side path.
--   3. Removes the ability for any authenticated user to delete profile rows.
--
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "Allow authenticated users to insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to delete profiles" ON public.profiles;

-- Users may only ever create their own profile row (id must equal their auth uid).
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Users may only ever update their own profile row.
-- (The trigger below additionally blocks role/status changes on this path.)
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- No client-side deletes at all. Only service_role (which bypasses RLS
-- entirely) can remove a profile, and only the admin-users Edge Function
-- uses that key.

CREATE OR REPLACE FUNCTION public.prevent_self_role_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Role and status changes must go through the admin-users function';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_self_role_status_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_status_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_status_change();

SELECT 'Profiles RLS hardened: role/status changes now require the admin-users function.' AS status;
