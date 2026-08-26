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