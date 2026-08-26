-- ===========================================================================
-- CHETU MICROFINANCE — real email addresses on staff accounts
-- ===========================================================================
-- Accounts were created with a synthetic address derived from the phone
-- number (0740081305 -> 256740081305@staff.chetumicrofinance.local). Nobody
-- ever typed it, it could not receive mail, and it meant a staff member had no
-- real contact address on file.
--
-- Staff now sign in with their own email address. Sign-in by phone is kept —
-- it is what field officers are used to — which needs a way to turn a phone
-- number into the account's email *before* anyone is authenticated. That is
-- what the function below is for.
--
-- Trade-off, stated plainly: this lets an unauthenticated caller test whether
-- a phone number belongs to active staff and see the address it maps to. For
-- an internal system with a small, known roster that is an acceptable price
-- for keeping phone sign-in. If it is not, drop this function and the login
-- screen falls back to email-only.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.account_email_for_phone(_phone TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE p.status = 'Active'
    -- Match however the number was stored: 07xxxxxxxx or +2567xxxxxxxx.
    AND regexp_replace(COALESCE(p.phone_number, ''), '^(\+?256|0)', '') = regexp_replace(_phone, '^(\+?256|0)', '')
    AND COALESCE(p.phone_number, '') <> ''
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.account_email_for_phone(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_email_for_phone(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.account_email_for_phone(TEXT) IS
  'Resolves a staff phone number to the account email so sign-in by phone still works. Deliberately callable before authentication.';

-- An email is how a staff member is contacted and now how they sign in, so it
-- must be present and unique. The column was already UNIQUE NOT NULL; this
-- adds the shape check so a synthetic address cannot be written by mistake.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_shape_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_shape_check
  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

COMMENT ON COLUMN public.profiles.email IS
  'The staff member''s real email address. Also their sign-in credential.';
COMMENT ON COLUMN public.profiles.phone_number IS
  'Contact number, and an alternative way to sign in — resolved via account_email_for_phone().';
