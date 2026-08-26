REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM anon;