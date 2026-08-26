
REVOKE EXECUTE ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_auditor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.caller_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_client(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_group(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_loan(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
