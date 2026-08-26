REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;