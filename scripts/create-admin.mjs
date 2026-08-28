/**
 * Bootstrap the first Administrator account.
 *
 * User Management inside the app can only be used by an existing
 * Administrator, so the very first one has to be created out of band. This
 * script does that with the service role key from .env, following exactly the
 * same conventions as the in-app "create staff account" server function, so
 * the resulting account is indistinguishable from one made in the UI.
 *
 * Staff sign in with a phone number, not an email. The auth email is derived
 * from the phone (07xxxxxxxx -> 256xxxxxxxxx@staff.chetumicrofinance.local)
 * and is never typed by anyone.
 *
 * Usage:
 *   node scripts/create-admin.mjs <07xxxxxxxx> "<Full Name>" "<password>"
 *
 * Re-running it for a phone number that already exists promotes that account
 * to Administrator and resets its password, rather than failing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readEnv = () => {
  const raw = readFileSync(resolve(ROOT, ".env"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [
          line.slice(0, i).trim(),
          line
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
};

const toE164 = (phone) => (phone.startsWith("+") ? phone : `+256${phone.replace(/^0/, "")}`);
const phoneToEmail = (e164) => `${e164.replace("+", "")}@staff.chetumicrofinance.local`;

const die = (message) => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

const [phone, fullName, password] = process.argv.slice(2);

if (!phone || !fullName || !password) {
  die(
    'Usage: node scripts/create-admin.mjs <07xxxxxxxx> "<Full Name>" "<password>"\n' +
      '  e.g. node scripts/create-admin.mjs 0700123456 "Trevor Mwesigwa" "ChangeMe123!"',
  );
}
if (!/^07\d{8}$/.test(phone))
  die("Phone number must be 10 digits starting with 07, e.g. 0700123456");
if (password.length < 8) die("Password must be at least 8 characters");

const env = readEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) die("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");

// The service role bypasses row level security, which is what lets this script
// write a profile before any Administrator exists to authorise it.
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authEmail = phoneToEmail(toE164(phone));

const findExistingUser = async () => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) die(`Could not list users: ${error.message}`);
  return data.users.find((u) => u.email === authEmail);
};

let userId;
const existing = await findExistingUser();

if (existing) {
  console.log(`  Account for ${phone} already exists — promoting it to Administrator.`);
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    user_metadata: { full_name: fullName, role: "Administrator", phone_number: phone },
  });
  if (error) die(`Could not update the account: ${error.message}`);
  userId = existing.id;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "Administrator", phone_number: phone },
  });
  if (error || !data.user)
    die(`Could not create the account: ${error?.message ?? "unknown error"}`);
  userId = data.user.id;
}

// The handle_new_user trigger already inserted a profile row from the metadata
// above; upsert so the script is safe to re-run and so a promoted account gets
// its role corrected. Administrators are not branch-scoped.
const { data: profile, error: profileError } = await admin
  .from("profiles")
  .upsert({
    id: userId,
    email: authEmail,
    full_name: fullName,
    role: "Administrator",
    phone_number: phone,
    status: "Active",
    branch_ids: [],
  })
  .select()
  .single();

if (profileError) die(`Account created but the profile failed: ${profileError.message}`);

console.log(`
  Administrator ready.

    Sign in with phone   ${profile.phone_number}
    Password             the one you just set
    Name                 ${profile.full_name}
    Role                 ${profile.role}

  Start the app with "npm run dev" and log in at /login.
  Create the rest of your staff from System Settings -> User Management.
`);
