REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_auditor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_branch_ids() TO authenticated;