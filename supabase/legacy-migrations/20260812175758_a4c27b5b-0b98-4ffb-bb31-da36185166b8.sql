REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_client(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_group(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_loan(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.client_groups ADD COLUMN IF NOT EXISTS loan_officer_id uuid REFERENCES public.profiles(id);

CREATE SEQUENCE IF NOT EXISTS public.client_group_code_seq;
SELECT setval('public.client_group_code_seq', GREATEST(1, (SELECT COALESCE(MAX(NULLIF(regexp_replace(group_code, '\D', '', 'g'), ''))::bigint % 10000, 0) FROM public.client_groups)));

CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

DROP POLICY IF EXISTS "groups read" ON public.client_groups;
CREATE POLICY "groups read" ON public.client_groups FOR SELECT TO authenticated
USING (is_admin_or_auditor() OR created_by = auth.uid() OR loan_officer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_see_group(_group_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_or_auditor()
      OR EXISTS (SELECT 1 FROM public.client_groups g
                 WHERE g.id = _group_id AND (g.created_by = auth.uid() OR g.loan_officer_id = auth.uid()))
$function$;

CREATE SEQUENCE IF NOT EXISTS public.client_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.savings_account_number_seq;

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

SELECT setval('public.client_number_seq', GREATEST((SELECT count(*) FROM public.clients), 1));
SELECT setval('public.savings_account_number_seq', GREATEST((SELECT count(*) FROM public.savings_accounts), 1));