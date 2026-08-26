DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT CREATE ON SCHEMA public TO authenticated, service_role;