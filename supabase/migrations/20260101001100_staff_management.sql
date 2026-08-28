-- ===========================================================================
-- CHETU MICROFINANCE — staff management
-- ===========================================================================
-- The Staff Management screen needs facts about a staff account that the
-- original `profiles` row never carried: a printed staff number, when they
-- joined, when they last signed in, when their password last changed, how
-- many sign-ins have failed since, and why an account was suspended.
--
-- It also needs a permission model that is worth something. A screen that
-- hides a button is a courtesy; the control has to be in the database, so this
-- migration files the role/permission matrix as data, exposes it to the UI
-- read-only, and puts the privilege changes themselves behind a trigger that
-- no direct PostgREST call, URL edit or devtools session can talk its way past.
--
-- Everything here is additive. No existing column, policy or row is dropped.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- §1  Staff account columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_code               TEXT,
  ADD COLUMN IF NOT EXISTS date_joined              DATE,
  ADD COLUMN IF NOT EXISTS primary_branch_id        TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_login_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_password_change_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Why the account is in its current state, and who put it there. A
  -- suspension without a stated reason is not an answer anyone can audit.
  ADD COLUMN IF NOT EXISTS status_reason            TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 'Pending' joins the existing three: an account that has been created but
-- whose holder has not yet signed in for the first time.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('Active', 'Pending', 'Inactive', 'Suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_staff_code_key ON public.profiles(staff_code)
  WHERE staff_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- §2  Staff numbers come from the database
-- ---------------------------------------------------------------------------
-- Same reasoning as every other reference number in this system: `rows.length
-- + 1` counts an RLS-filtered array, so two people allocate ST-00001 at the
-- same time and the unique index rejects the second one.
CREATE SEQUENCE IF NOT EXISTS public.staff_code_seq;

CREATE OR REPLACE FUNCTION public.set_staff_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE candidate TEXT; taken BOOLEAN;
BEGIN
  IF NEW.staff_code IS NOT NULL AND NEW.staff_code <> '' THEN RETURN NEW; END IF;
  LOOP
    candidate := 'ST-' || lpad(nextval('public.staff_code_seq')::text, 5, '0');
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE staff_code = candidate) INTO taken;
    EXIT WHEN NOT taken;
  END LOOP;
  NEW.staff_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_staff_code ON public.profiles;
CREATE TRIGGER trg_set_staff_code BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_staff_code();

-- Existing staff keep their place in the register: numbered oldest first, so
-- the founding Administrator is ST-00001 rather than whoever sorts first.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE staff_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.profiles
       SET staff_code = 'ST-' || lpad(nextval('public.staff_code_seq')::text, 5, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

-- A joining date nobody recorded is, at worst, the day the account was made.
UPDATE public.profiles SET date_joined = created_at::date WHERE date_joined IS NULL;

-- The first branch on the list is the primary one until someone says otherwise.
UPDATE public.profiles
   SET primary_branch_id = branch_ids[1]
 WHERE primary_branch_id IS NULL
   AND array_length(branch_ids, 1) >= 1
   AND EXISTS (SELECT 1 FROM public.branches b WHERE b.id = profiles.branch_ids[1]);

-- ---------------------------------------------------------------------------
-- §3  The permission catalogue
-- ---------------------------------------------------------------------------
-- Permissions are rows, not constants compiled into a bundle. The matrix screen
-- reads them, `private.has_permission()` evaluates them, and changing one is an
-- administrative act rather than a redeploy.
CREATE TABLE IF NOT EXISTS public.permissions (
    key         TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    category    TEXT NOT NULL,
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0
);

-- `level` is how much of the institution the permission reaches:
--   full     everything, everywhere
--   branch   only the branches on the holder's profile
--   own      only records the holder created or is assigned to
--   limited  the action, minus its privileged parts (a manager may manage
--            branch staff, but not Administrators and not roles)
--   none     denied
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role           TEXT NOT NULL CHECK (role IN ('Administrator', 'Branch Manager', 'Loan Officer', 'Auditor')),
    permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
    level          TEXT NOT NULL DEFAULT 'none'
                   CHECK (level IN ('full', 'branch', 'own', 'limited', 'none')),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role, permission_key)
);

GRANT SELECT ON public.permissions      TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT UPDATE ON public.role_permissions TO authenticated;
GRANT ALL    ON public.permissions      TO service_role;
GRANT ALL    ON public.role_permissions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.staff_code_seq TO authenticated, service_role;

INSERT INTO public.permissions (key, label, category, description, sort_order) VALUES
  ('clients.view',          'View Clients',             'Clients',       'Open member records and their history',        10),
  ('clients.create',        'Create Clients',           'Clients',       'Admit new members and register their details', 20),
  ('clients.approve',       'Approve Members',          'Clients',       'Admit or reject a member application',         30),
  ('groups.manage',         'Manage Groups',            'Clients',       'Form groups, move members, take attendance',   40),
  ('loans.create',          'Create Loan Applications', 'Lending',       'Take an application and submit it',            50),
  ('loans.approve',         'Approve Loans',            'Lending',       'Approve or reject a loan application',         60),
  ('loans.disburse',        'Disburse Loans',           'Lending',       'Release an approved loan to the member',       70),
  ('loans.writeoff',        'Write Off Loans',          'Lending',       'Write a loan off as a bad debt',               80),
  ('loans.rollback',        'Reverse Transactions',     'Lending',       'Undo a disbursement or a receipted payment',   90),
  ('repayments.record',     'Record Repayments',        'Collections',   'Receipt a weekly collection',                 100),
  ('savings.record',        'Record Savings',           'Collections',   'Receipt a deposit or a withdrawal',           110),
  ('businessday.open',      'Open Business Day',        'Business Day',  'Open or close the trading day for a branch',  120),
  ('businessday.approve',   'Approve Officer Day',      'Business Day',  'Approve or reject a submitted officer day',   130),
  ('businessday.special',   'Grant Special Access',     'Business Day',  'Allow work outside an open business day',     140),
  ('staff.view',            'View Staff',               'Administration','Open the staff register',                     150),
  ('staff.manage',          'Manage Staff',             'Administration','Create staff, edit them, reset passwords',    160),
  ('staff.roles',           'Manage Roles',             'Administration','Change what each role is permitted to do',    170),
  ('branches.manage',       'Manage Branches',          'Administration','Create, edit, open and close branches',       180),
  ('settings.manage',       'System Configuration',     'Administration','Change institution-wide settings',            190),
  ('reports.view',          'View Reports',             'Oversight',     'Run the reporting suite',                     200),
  ('audit.view',            'View Audit Logs',          'Oversight',     'Read the audit trail',                        210)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, category = EXCLUDED.category,
      description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- The seeded matrix. `DO NOTHING` on conflict: once an Administrator has tuned
-- a level, replaying this migration must not quietly undo their decision.
INSERT INTO public.role_permissions (role, permission_key, level) VALUES
  ('Administrator','clients.view','full'),          ('Administrator','clients.create','full'),
  ('Administrator','clients.approve','full'),       ('Administrator','groups.manage','full'),
  ('Administrator','loans.create','full'),          ('Administrator','loans.approve','full'),
  ('Administrator','loans.disburse','full'),        ('Administrator','loans.writeoff','full'),
  ('Administrator','loans.rollback','full'),        ('Administrator','repayments.record','full'),
  ('Administrator','savings.record','full'),        ('Administrator','businessday.open','full'),
  ('Administrator','businessday.approve','full'),   ('Administrator','businessday.special','full'),
  ('Administrator','staff.view','full'),            ('Administrator','staff.manage','full'),
  ('Administrator','staff.roles','full'),           ('Administrator','branches.manage','full'),
  ('Administrator','settings.manage','full'),       ('Administrator','reports.view','full'),
  ('Administrator','audit.view','full'),

  ('Branch Manager','clients.view','branch'),       ('Branch Manager','clients.create','branch'),
  ('Branch Manager','clients.approve','branch'),    ('Branch Manager','groups.manage','branch'),
  ('Branch Manager','loans.create','branch'),       ('Branch Manager','loans.approve','branch'),
  ('Branch Manager','loans.disburse','branch'),     ('Branch Manager','loans.writeoff','none'),
  ('Branch Manager','loans.rollback','branch'),     ('Branch Manager','repayments.record','branch'),
  ('Branch Manager','savings.record','branch'),     ('Branch Manager','businessday.open','branch'),
  ('Branch Manager','businessday.approve','branch'),('Branch Manager','businessday.special','branch'),
  ('Branch Manager','staff.view','branch'),         ('Branch Manager','staff.manage','limited'),
  ('Branch Manager','staff.roles','none'),          ('Branch Manager','branches.manage','none'),
  ('Branch Manager','settings.manage','none'),      ('Branch Manager','reports.view','branch'),
  ('Branch Manager','audit.view','branch'),

  ('Loan Officer','clients.view','own'),            ('Loan Officer','clients.create','own'),
  ('Loan Officer','clients.approve','none'),        ('Loan Officer','groups.manage','own'),
  ('Loan Officer','loans.create','own'),            ('Loan Officer','loans.approve','none'),
  ('Loan Officer','loans.disburse','none'),         ('Loan Officer','loans.writeoff','none'),
  ('Loan Officer','loans.rollback','none'),         ('Loan Officer','repayments.record','own'),
  ('Loan Officer','savings.record','own'),          ('Loan Officer','businessday.open','none'),
  ('Loan Officer','businessday.approve','none'),    ('Loan Officer','businessday.special','none'),
  ('Loan Officer','staff.view','none'),             ('Loan Officer','staff.manage','none'),
  ('Loan Officer','staff.roles','none'),            ('Loan Officer','branches.manage','none'),
  ('Loan Officer','settings.manage','none'),        ('Loan Officer','reports.view','own'),
  ('Loan Officer','audit.view','own'),

  ('Auditor','clients.view','full'),                ('Auditor','clients.create','none'),
  ('Auditor','clients.approve','none'),             ('Auditor','groups.manage','none'),
  ('Auditor','loans.create','none'),                ('Auditor','loans.approve','none'),
  ('Auditor','loans.disburse','none'),              ('Auditor','loans.writeoff','none'),
  ('Auditor','loans.rollback','none'),              ('Auditor','repayments.record','none'),
  ('Auditor','savings.record','none'),              ('Auditor','businessday.open','none'),
  ('Auditor','businessday.approve','none'),         ('Auditor','businessday.special','none'),
  ('Auditor','staff.view','full'),                  ('Auditor','staff.manage','none'),
  ('Auditor','staff.roles','none'),                 ('Auditor','branches.manage','none'),
  ('Auditor','settings.manage','none'),             ('Auditor','reports.view','full'),
  ('Auditor','audit.view','full')
ON CONFLICT (role, permission_key) DO NOTHING;

ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read permissions" ON public.permissions;
CREATE POLICY "staff read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

-- Everyone may read the matrix — what a Loan Officer is allowed to do is not a
-- secret, and the profile drawer states it. Only an Administrator holding
-- staff.roles may change one, and only by UPDATE: the catalogue itself is
-- fixed by migration, so rows cannot be invented or removed from a browser.
DROP POLICY IF EXISTS "staff read role permissions" ON public.role_permissions;
CREATE POLICY "staff read role permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins set role permissions" ON public.role_permissions;
CREATE POLICY "admins set role permissions" ON public.role_permissions FOR UPDATE TO authenticated
  USING (private.is_admin() AND NOT private.is_auditor())
  WITH CHECK (private.is_admin() AND NOT private.is_auditor());

-- ---------------------------------------------------------------------------
-- §4  Evaluating a permission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.permission_level(_key TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT rp.level FROM public.role_permissions rp
                        WHERE rp.role = private.current_staff_role()
                          AND rp.permission_key = _key), 'none') $$;

-- A permission is only held by an account that is actually in service: a
-- suspended Administrator holds the role and none of its power.
CREATE OR REPLACE FUNCTION private.has_permission(_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.permission_level(_key) <> 'none'
         AND COALESCE((SELECT status FROM public.profiles WHERE id = auth.uid()), '') = 'Active' $$;

REVOKE ALL ON FUNCTION private.permission_level(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_permission(TEXT)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.permission_level(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(TEXT)   TO authenticated, service_role;

-- What the signed-in user may do, so the UI can grey out what the database
-- would refuse anyway. A courtesy on top of the control, never the control.
--
-- A suspended or deactivated account still holds a session — Supabase auth
-- knows nothing about `profiles.status` — so it reports 'none' throughout,
-- matching `private.has_permission()`. Otherwise the screens would offer that
-- person their whole role while every write was silently refused.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE (permission_key TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT rp.permission_key,
             CASE WHEN COALESCE((SELECT p.status FROM public.profiles p WHERE p.id = auth.uid()), '') = 'Active'
                  THEN rp.level ELSE 'none' END
        FROM public.role_permissions rp
       WHERE rp.role = private.current_staff_role() $$;

GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;

-- ---------------------------------------------------------------------------
-- §5  Who may see which staff member
-- ---------------------------------------------------------------------------
-- A Branch Manager runs a branch, so they may read the staff attached to it —
-- and nobody else's. §15: another branch's staff list is not theirs to read.
DROP POLICY IF EXISTS "managers read branch staff" ON public.profiles;
CREATE POLICY "managers read branch staff" ON public.profiles FOR SELECT TO authenticated
  USING (
    private.is_branch_manager()
    AND private.has_permission('staff.view')
    AND branch_ids && COALESCE(private.caller_branch_ids(), '{}')
  );

-- ---------------------------------------------------------------------------
-- §6  The privilege guard
-- ---------------------------------------------------------------------------
-- RLS answers "may this person touch this row?". It cannot answer "may this
-- person make *this* change?" — a Loan Officer editing their own display name
-- and a Loan Officer promoting themselves to Administrator are the same UPDATE
-- as far as a policy is concerned. Only a trigger can tell them apart, and a
-- trigger runs whether the change arrived from the app, from a hand-written
-- PostgREST call or from a browser console.
CREATE OR REPLACE FUNCTION public.guard_profile_privilege_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  actor_role   TEXT;
  actor_status TEXT;
  admins_left  INT;
BEGIN
  -- Migrations, seed scripts and the vetted admin server function, which has
  -- already re-checked its caller before touching anything.
  IF auth.uid() IS NULL OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT role, status INTO actor_role, actor_status FROM public.profiles WHERE id = auth.uid();

  -- The one status change a person makes to their own account: a created
  -- account becoming a working one at its first sign-in, which is what
  -- `record_successful_login` does. Nothing is gained by it — reaching this
  -- point already required the credentials that make the account real — and
  -- every other self-transition, Suspended → Active above all, stays refused
  -- by the block below.
  IF NEW.id = auth.uid()
     AND OLD.status = 'Pending' AND NEW.status = 'Active'
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.branch_ids IS NOT DISTINCT FROM OLD.branch_ids
     AND NEW.staff_code IS NOT DISTINCT FROM OLD.staff_code
     AND NEW.primary_branch_id IS NOT DISTINCT FROM OLD.primary_branch_id THEN
    NEW.status_changed_at := NOW();
    RETURN NEW;
  END IF;

  IF NEW.role             IS DISTINCT FROM OLD.role
  OR NEW.status           IS DISTINCT FROM OLD.status
  OR NEW.branch_ids       IS DISTINCT FROM OLD.branch_ids
  OR NEW.staff_code       IS DISTINCT FROM OLD.staff_code
  OR NEW.primary_branch_id IS DISTINCT FROM OLD.primary_branch_id THEN

    IF actor_role <> 'Administrator' OR actor_status <> 'Active' THEN
      RAISE EXCEPTION 'Only an active Administrator may change a role, status or branch attachment';
    END IF;

    -- Nobody rewrites their own privileges, Administrator included. A mistake
    -- there is not recoverable from inside the app.
    IF NEW.id = auth.uid()
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'You cannot change your own role or account status';
    END IF;

    -- A staff number is the printed identity of the account and never moves.
    IF NEW.staff_code IS DISTINCT FROM OLD.staff_code THEN
      RAISE EXCEPTION 'A staff number cannot be changed once it has been allocated';
    END IF;
  END IF;

  -- The institution must keep at least one Administrator who can sign in, or
  -- Staff Management becomes unreachable and only a shell script can fix it.
  IF (OLD.role = 'Administrator' AND OLD.status = 'Active')
     AND (NEW.role <> 'Administrator' OR NEW.status <> 'Active') THEN
    SELECT count(*) INTO admins_left FROM public.profiles
      WHERE role = 'Administrator' AND status = 'Active' AND id <> OLD.id;
    IF admins_left = 0 THEN
      RAISE EXCEPTION 'This is the last active Administrator — appoint another one first';
    END IF;
  END IF;

  -- A status change always says when, and by whom.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := NOW();
    NEW.status_changed_by := COALESCE(NEW.status_changed_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privilege ON public.profiles;
CREATE TRIGGER trg_guard_profile_privilege BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privilege_change();

-- ---------------------------------------------------------------------------
-- §7  The staff audit trail
-- ---------------------------------------------------------------------------
-- `audit_logs` already records who did what. A staff account change also needs
-- to record what the value *was*, what it *became*, why, and about whom.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value      TEXT,
  ADD COLUMN IF NOT EXISTS reason         TEXT,
  ADD COLUMN IF NOT EXISTS branch_id      TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_target ON public.audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON public.audit_logs(user_id, created_at DESC);

-- An audit trail that can be tidied up afterwards is not evidence. UPDATE is
-- withdrawn from every signed-in user and refused by a trigger. DELETE keeps
-- the existing Administrator-only policy, which the data-reset tool relies on.
REVOKE UPDATE ON public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.block_audit_log_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit entries cannot be edited';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_log_update();

-- A change made straight through the API — a hand-written PATCH, a devtools
-- session — files its own entry, so a screen that forgets to call the logger
-- cannot leave a privilege change unrecorded.
--
-- Writes from the admin server function are skipped here, because it runs as
-- the service role and `auth.uid()` is null: the trigger would record the
-- change but attribute it to nobody. That function writes its own entry with
-- the real actor instead, having already established who they are.
CREATE OR REPLACE FUNCTION public.audit_profile_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  actor_name TEXT; actor_role TEXT; actor_id UUID;
BEGIN
  actor_id := auth.uid();
  IF actor_id IS NULL THEN RETURN NEW; END IF;

  SELECT full_name, role INTO actor_name, actor_role FROM public.profiles WHERE id = actor_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, user_name, user_role, action, module, record_id,
                                   details, target_user_id, new_value, branch_id)
    VALUES (actor_id, COALESCE(actor_name, 'System'), COALESCE(actor_role, 'Administrator'),
            'Staff Account Created', 'Staff Management', NEW.staff_code,
            format('%s (%s) created as %s', NEW.full_name, NEW.staff_code, NEW.role),
            NEW.id, NEW.role, NEW.primary_branch_id);
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.audit_logs (user_id, user_name, user_role, action, module, record_id,
                                   details, target_user_id, previous_value, new_value, reason, branch_id)
    VALUES (actor_id, COALESCE(actor_name, 'System'), COALESCE(actor_role, 'Administrator'),
            'Staff Role Changed', 'Staff Management', NEW.staff_code,
            format('%s moved from %s to %s', NEW.full_name, OLD.role, NEW.role),
            NEW.id, OLD.role, NEW.role, NEW.status_reason, NEW.primary_branch_id);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, user_name, user_role, action, module, record_id,
                                   details, target_user_id, previous_value, new_value, reason, branch_id)
    VALUES (actor_id, COALESCE(actor_name, 'System'), COALESCE(actor_role, 'Administrator'),
            'Staff Status Changed', 'Staff Management', NEW.staff_code,
            format('%s went from %s to %s', NEW.full_name, OLD.status, NEW.status),
            NEW.id, OLD.status, NEW.status, NEW.status_reason, NEW.primary_branch_id);
  END IF;

  IF NEW.branch_ids IS DISTINCT FROM OLD.branch_ids THEN
    INSERT INTO public.audit_logs (user_id, user_name, user_role, action, module, record_id,
                                   details, target_user_id, previous_value, new_value, branch_id)
    VALUES (actor_id, COALESCE(actor_name, 'System'), COALESCE(actor_role, 'Administrator'),
            'Staff Branch Assignment Changed', 'Staff Management', NEW.staff_code,
            format('%s reassigned', NEW.full_name),
            NEW.id, array_to_string(OLD.branch_ids, ', '), array_to_string(NEW.branch_ids, ', '),
            NEW.primary_branch_id);
  END IF;

  IF NEW.last_password_change_at IS DISTINCT FROM OLD.last_password_change_at
     AND OLD.last_password_change_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, user_name, user_role, action, module, record_id,
                                   details, target_user_id, branch_id)
    VALUES (actor_id, COALESCE(actor_name, 'System'), COALESCE(actor_role, 'Administrator'),
            'Staff Password Reset', 'Staff Management', NEW.staff_code,
            format('Password reset for %s', NEW.full_name), NEW.id, NEW.primary_branch_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_change ON public.profiles;
CREATE TRIGGER trg_audit_profile_change AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_change();

-- ---------------------------------------------------------------------------
-- §8  Sign-in telemetry
-- ---------------------------------------------------------------------------
-- Last login, failed attempts and the pending→active transition are facts the
-- database owns. The client asks it to record a sign-in; it cannot dictate the
-- timestamp, and it can only ever stamp its own row.
CREATE OR REPLACE FUNCTION public.record_successful_login()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
     SET last_login_at = NOW(),
         failed_login_attempts = 0,
         -- A created account becomes a working one the first time its holder
         -- actually signs in.
         status = CASE WHEN status = 'Pending' THEN 'Active' ELSE status END,
         last_password_change_at = COALESCE(last_password_change_at, NOW())
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_successful_login() TO authenticated;

-- Counting failures has to work before a session exists, so it is keyed by
-- whatever was typed and returns nothing at all: it must not become an oracle
-- for discovering which addresses and phone numbers are real.
CREATE OR REPLACE FUNCTION public.record_failed_login(_identifier TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
     SET failed_login_attempts = LEAST(failed_login_attempts + 1, 999)
   WHERE lower(email) = lower(trim(_identifier))
      OR phone_number = trim(_identifier);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- §9  The staff register, in one read
-- ---------------------------------------------------------------------------
-- The list screen wants each staff member alongside today's business day and
-- their own officer day. Doing that from the browser is three round trips and
-- a join in JavaScript; doing it here means the RLS on all three tables is
-- applied by the database, which is where it belongs. `security_invoker` keeps
-- it that way — the view holds no privileges of its own.
CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = true) AS
SELECT
  p.id, p.staff_code, p.full_name, p.email, p.phone_number, p.role, p.status,
  p.avatar_url, p.branch_ids, p.primary_branch_id, p.date_joined,
  p.last_login_at, p.last_password_change_at, p.failed_login_attempts,
  p.must_change_password, p.two_factor_enabled,
  p.status_reason, p.status_changed_at, p.created_at, p.updated_at,
  b.branch_name   AS primary_branch_name,
  b.branch_code   AS primary_branch_code,
  bd.status       AS business_day_status,
  bd.business_date,
  od.status       AS officer_day_status,
  od.submitted_at AS officer_day_submitted_at,
  od.rejection_reason AS officer_day_rejection_reason
FROM public.profiles p
LEFT JOIN public.branches b ON b.id = p.primary_branch_id
LEFT JOIN public.business_days bd
       ON bd.branch_id = p.primary_branch_id AND bd.business_date = CURRENT_DATE
LEFT JOIN public.officer_days od
       ON od.officer_id = p.id AND od.business_date = CURRENT_DATE;

GRANT SELECT ON public.staff_directory TO authenticated, service_role;
