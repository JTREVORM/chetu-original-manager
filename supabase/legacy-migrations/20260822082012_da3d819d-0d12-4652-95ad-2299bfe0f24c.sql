REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;