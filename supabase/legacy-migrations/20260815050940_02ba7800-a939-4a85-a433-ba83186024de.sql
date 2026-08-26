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