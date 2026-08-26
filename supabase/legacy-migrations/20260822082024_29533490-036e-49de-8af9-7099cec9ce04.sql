DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not revoke privileges: %', SQLERRM;
END $$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;