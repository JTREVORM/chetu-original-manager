CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Loan Officer' CHECK (role IN ('Administrator','Loan Officer','Auditor')),
    phone_number TEXT,
    avatar_url TEXT,
    branch_ids TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Suspended')),
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
('Administrator','Full system access'),
('Loan Officer','Branch-scoped client onboarding, loans and collections'),
('Auditor','Read-only institution-wide access');

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

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_staff_role() = 'Administrator'
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_auditor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_staff_role() IN ('Administrator','Auditor')
$$;

CREATE OR REPLACE FUNCTION public.caller_branch_ids()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.role IN ('Administrator','Auditor') THEN NULL
              ELSE COALESCE(p.branch_ids,'{}') END
  FROM public.profiles p WHERE p.id = auth.uid()
$$;

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
    branch TEXT,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    member_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Suspended')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    group_savings NUMERIC(12,2) DEFAULT 0.00,
    group_loans NUMERIC(12,2) DEFAULT 0.00
);

CREATE TABLE public.clients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    passport_photo TEXT,
    national_id_front TEXT,
    national_id_back TEXT,
    nin TEXT UNIQUE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male','Female','Other')),
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
    branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
    registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Blacklisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.client_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.loan_products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL,
    interest_type TEXT NOT NULL CHECK (interest_type IN ('Flat Rate','Reducing Balance')),
    processing_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    penalty_rate NUMERIC(5,2) DEFAULT 1.00,
    grace_period_weeks INT DEFAULT 1,
    min_amount NUMERIC(12,2) NOT NULL,
    max_amount NUMERIC(12,2) NOT NULL,
    min_weeks INT NOT NULL,
    max_weeks INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
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
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Disbursed')),
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

CREATE TABLE public.loans (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    loan_number TEXT UNIQUE NOT NULL,
    application_id TEXT UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.loan_products(id) ON DELETE RESTRICT,
    principal_amount NUMERIC(12,2) NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL,
    interest_type TEXT NOT NULL CHECK (interest_type IN ('Flat Rate','Reducing Balance')),
    loan_period_weeks INT NOT NULL,
    total_interest_amount NUMERIC(12,2) NOT NULL,
    total_amount_payable NUMERIC(12,2) NOT NULL,
    weekly_installment NUMERIC(12,2) NOT NULL,
    processing_fee_amount NUMERIC(12,2) NOT NULL,
    first_repayment_date DATE NOT NULL,
    final_due_date DATE NOT NULL,
    outstanding_balance NUMERIC(12,2) NOT NULL,
    completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Active','Partially Paid','Fully Paid','Overdue','Defaulted')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disbursed_at TIMESTAMPTZ,
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
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Paid','Partially Paid','Overdue')),
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
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash','Bank Transfer','Mobile Money')),
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    expense_number TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash','Bank Transfer','Mobile Money')),
    receipt_url TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bank_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_number TEXT UNIQUE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Deposit','Withdrawal')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reference_number TEXT NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Application','Repayment','Overdue','Disbursement','Alert','System')),
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

CREATE TABLE public.savings_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_number TEXT UNIQUE NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES public.client_groups(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL DEFAULT 'Individual' CHECK (account_type IN ('Individual','Group')),
    balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Dormant','Closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.savings_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_number TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Deposit','Withdrawal','Interest')),
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash','Bank Transfer','Mobile Money')),
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.group_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    role_in_group TEXT NOT NULL DEFAULT 'Member' CHECK (role_in_group IN ('Chairperson','Secretary','Treasurer','Member')),
    joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, client_id)
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

CREATE INDEX idx_clients_registered_by ON public.clients(registered_by);
CREATE INDEX idx_clients_branch ON public.clients(branch_id);
CREATE INDEX idx_groups_created_by ON public.client_groups(created_by);
CREATE INDEX idx_groups_branch ON public.client_groups(branch_id);
CREATE INDEX idx_loans_client_id ON public.loans(client_id);
CREATE INDEX idx_repayments_loan_id ON public.loan_repayments(loan_id);
CREATE INDEX idx_schedule_loan_id ON public.loan_repayment_schedule(loan_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_savings_accounts_client ON public.savings_accounts(client_id);
CREATE INDEX idx_savings_tx_account ON public.savings_transactions(account_id);

CREATE OR REPLACE FUNCTION public.can_see_client(_client_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = _client_id AND c.registered_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_see_group(_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.client_groups g
                 WHERE g.id = _group_id AND g.created_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_see_loan(_loan_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.loans l JOIN public.clients c ON c.id = l.client_id
                 WHERE l.id = _loan_id AND c.registered_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, phone_number)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name','System User'),
        COALESCE(NEW.raw_user_meta_data->>'role','Loan Officer'),
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_auditor());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "staff read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write settings" ON public.settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "branch scoped branch reads" ON public.branches FOR SELECT TO authenticated
  USING (public.caller_branch_ids() IS NULL OR id = ANY (public.caller_branch_ids()));
CREATE POLICY "admins manage branches" ON public.branches FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "groups insert" ON public.client_groups FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (created_by = auth.uid()
        AND (public.caller_branch_ids() IS NULL
             OR (branch_id IS NOT NULL AND branch_id = ANY (public.caller_branch_ids()))))
  );
CREATE POLICY "groups update" ON public.client_groups FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "groups delete" ON public.client_groups FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "clients insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (registered_by = auth.uid()
        AND (public.caller_branch_ids() IS NULL
             OR (branch_id IS NOT NULL AND branch_id = ANY (public.caller_branch_ids()))))
  );
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated
  USING (public.is_admin() OR registered_by = auth.uid())
  WITH CHECK (public.is_admin() OR registered_by = auth.uid());
CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "client docs read" ON public.client_documents FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "client docs write" ON public.client_documents FOR ALL TO authenticated
  USING (public.can_see_client(client_id)) WITH CHECK (public.can_see_client(client_id));

CREATE POLICY "products read" ON public.loan_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products write" ON public.loan_products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "applications read" ON public.loan_applications FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "applications insert" ON public.loan_applications FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "applications update" ON public.loan_applications FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "applications delete" ON public.loan_applications FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "guarantors all" ON public.guarantors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = application_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.loan_applications a WHERE a.id = application_id));

CREATE POLICY "loans read" ON public.loans FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "loans insert" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "loans update" ON public.loans FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "loans delete" ON public.loans FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "schedule read" ON public.loan_repayment_schedule FOR SELECT TO authenticated
  USING (public.can_see_loan(loan_id));
CREATE POLICY "schedule write" ON public.loan_repayment_schedule FOR ALL TO authenticated
  USING (public.can_see_loan(loan_id)) WITH CHECK (public.can_see_loan(loan_id));

CREATE POLICY "repayments read" ON public.loan_repayments FOR SELECT TO authenticated
  USING (public.can_see_client(client_id));
CREATE POLICY "repayments insert" ON public.loan_repayments FOR INSERT TO authenticated
  WITH CHECK (public.can_see_client(client_id));
CREATE POLICY "repayments update" ON public.loan_repayments FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_see_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_see_client(client_id));
CREATE POLICY "repayments delete" ON public.loan_repayments FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor());
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bank read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor());
CREATE POLICY "bank write" ON public.bank_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR recipient_id IS NULL OR public.is_admin_or_auditor());
CREATE POLICY "notifications write" ON public.notifications FOR ALL TO authenticated
  USING (recipient_id = auth.uid() OR public.is_admin())
  WITH CHECK (true);

CREATE POLICY "reports all" ON public.reports FOR ALL TO authenticated
  USING (generated_by = auth.uid() OR public.is_admin_or_auditor())
  WITH CHECK (generated_by = auth.uid() OR public.is_admin());

CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin_or_auditor() OR user_id = auth.uid());
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit delete" ON public.audit_logs FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "savings accounts read" ON public.savings_accounts FOR SELECT TO authenticated
  USING ((client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)));
CREATE POLICY "savings accounts write" ON public.savings_accounts FOR ALL TO authenticated
  USING (public.is_admin()
      OR (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)))
  WITH CHECK (public.is_admin()
      OR (client_id IS NOT NULL AND public.can_see_client(client_id))
      OR (group_id IS NOT NULL AND public.can_see_group(group_id)));

CREATE POLICY "savings tx all" ON public.savings_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = account_id));

CREATE POLICY "group members all" ON public.group_members FOR ALL TO authenticated
  USING (public.can_see_group(group_id)) WITH CHECK (public.can_see_group(group_id));
CREATE POLICY "attendance all" ON public.group_attendance FOR ALL TO authenticated
  USING (public.can_see_group(group_id)) WITH CHECK (public.can_see_group(group_id));

CREATE POLICY "loan officers read" ON public.loan_officers FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin_or_auditor());
CREATE POLICY "loan officers write" ON public.loan_officers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'));

INSERT INTO public.roles (name, description)
VALUES ('Branch Manager', 'Branch-scoped operations, loan approvals, portfolio monitoring and branch reporting')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_branch_id ON public.bank_transactions(branch_id);

CREATE OR REPLACE FUNCTION public.is_branch_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_staff_role() = 'Branch Manager'
$$;

ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS loan_officer_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS loan_officer_name text;
ALTER TABLE public.client_groups
  ADD COLUMN IF NOT EXISTS meeting_frequency text NOT NULL DEFAULT 'Weekly',
  ADD COLUMN IF NOT EXISTS formation_date date;
ALTER TABLE public.client_groups DROP CONSTRAINT IF EXISTS client_groups_meeting_frequency_check;
ALTER TABLE public.client_groups ADD CONSTRAINT client_groups_meeting_frequency_check
  CHECK (meeting_frequency IN ('Daily','Weekly','Monthly'));

CREATE POLICY "clients read" ON public.clients
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR registered_by = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);

CREATE POLICY "groups read" ON public.client_groups
FOR SELECT TO authenticated
USING (
  public.is_admin_or_auditor()
  OR created_by = auth.uid()
  OR loan_officer_id = auth.uid()
  OR (public.is_branch_manager() AND branch_id = ANY (public.caller_branch_ids()))
);

CREATE OR REPLACE FUNCTION public.can_see_group(_group_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.client_groups g
                 WHERE g.id = _group_id AND (g.created_by = auth.uid() OR g.loan_officer_id = auth.uid()))
$$;

CREATE SEQUENCE IF NOT EXISTS public.client_group_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.savings_account_number_seq;

CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_code IS NULL OR NEW.group_code = '' OR EXISTS (SELECT 1 FROM public.client_groups g WHERE g.group_code = NEW.group_code) THEN
    NEW.group_code := 'CM-GRP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.client_group_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_group_code ON public.client_groups;
CREATE TRIGGER trg_set_group_code BEFORE INSERT ON public.client_groups
FOR EACH ROW EXECUTE FUNCTION public.set_group_code();

CREATE OR REPLACE FUNCTION public.set_client_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_number IS NULL OR NEW.client_number = '' OR EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number) THEN
    LOOP
      NEW.client_number := 'CM-CL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.client_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.client_number = NEW.client_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_savings_account_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = '' OR EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number) THEN
    LOOP
      NEW.account_number := 'CM-SAV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.savings_account_number_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.account_number = NEW.account_number);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_client_number ON public.clients;
CREATE TRIGGER trg_set_client_number BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_client_number();

DROP TRIGGER IF EXISTS trg_set_savings_account_number ON public.savings_accounts;
CREATE TRIGGER trg_set_savings_account_number BEFORE INSERT ON public.savings_accounts FOR EACH ROW EXECUTE FUNCTION public.set_savings_account_number();

CREATE TABLE public.member_fees (
  id text NOT NULL DEFAULT ('CM-FEE-' || to_char(now(),'YYYY') || '-' || substr(gen_random_uuid()::text,1,8)) PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  admission_fee numeric NOT NULL DEFAULT 0,
  passbook_fee numeric NOT NULL DEFAULT 0,
  crb_fee numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  receipt_number text,
  branch_id text REFERENCES public.branches(id),
  collected_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_fees TO authenticated;
GRANT ALL ON public.member_fees TO service_role;

ALTER TABLE public.member_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view member fees" ON public.member_fees
FOR SELECT TO authenticated
USING (public.is_admin_or_auditor() OR collected_by = auth.uid() OR (public.is_branch_manager() AND branch_id = ANY(public.caller_branch_ids())));

CREATE POLICY "Staff can record member fees" ON public.member_fees
FOR INSERT TO authenticated
WITH CHECK (public.current_staff_role() IN ('Administrator','Branch Manager','Loan Officer'));

CREATE POLICY "Admins can update member fees" ON public.member_fees
FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete member fees" ON public.member_fees
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_member_fees_updated_at
BEFORE UPDATE ON public.member_fees
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_branch_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_client(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_group(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_loan(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_client_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_savings_account_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;