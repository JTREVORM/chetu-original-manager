// supabase/functions/admin-users/index.ts
//
// Server-side staff-account management for the Chetu Microfinance app.
//
// Creating/editing Supabase Auth users and changing someone's role or
// status requires the `service_role` key, which must NEVER be shipped
// to the browser. This function holds that key as a server-side secret,
// double-checks that the caller is an active Administrator, and performs
// the privileged operation on their behalf.
//
// Deploy:
//   supabase functions deploy admin-users
//
// Required secrets (set automatically for you by Supabase, or via
// `supabase secrets set` if needed): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const VALID_ROLES = ['Administrator', 'Loan Officer', 'Auditor'];
const VALID_STATUSES = ['Active', 'Inactive', 'Suspended'];

function toE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  // Ugandan local format 07XXXXXXXX -> +2567XXXXXXXX
  return `+256${trimmed.replace(/^0/, '')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server misconfiguration: missing Supabase env vars' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    // Client scoped to the caller's own JWT — used only to find out who is calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    // Admin client — holds the service_role key, bypasses RLS. Never sent to the browser.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role, status')
      .eq('id', caller.id)
      .single();

    if (
      callerProfileError ||
      !callerProfile ||
      callerProfile.role !== 'Administrator' ||
      callerProfile.status !== 'Active'
    ) {
      return json({ error: 'Only active Administrators can manage staff accounts' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ---- Create a new staff user -----------------------------------------
    if (action === 'create') {
      const { full_name, phone_number, email, password, role } = body;
      if (!full_name || !phone_number || !password || !role) {
        return json({ error: 'full_name, phone_number, password and role are required' }, 400);
      }
      if (!VALID_ROLES.includes(role)) {
        return json({ error: 'Invalid role' }, 400);
      }
      if (String(password).length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400);
      }

      const e164Phone = toE164(phone_number);
      const userEmail = email && String(email).trim()
        ? String(email).trim()
        : `${e164Phone.replace('+', '')}@staff.chetumicrofinance.local`;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        phone: e164Phone,
        email: userEmail,
        password,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { full_name, role },
      });

      if (createError || !created?.user) {
        return json({ error: createError?.message || 'Failed to create user' }, 400);
      }

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .upsert(
          {
            id: created.user.id,
            email: userEmail,
            full_name,
            role,
            phone_number: e164Phone,
            status: 'Active',
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (profileError) {
        // Roll back the auth user so we don't leave an orphaned login with no profile.
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }

      return json({ profile });
    }

    // ---- Edit an existing staff user's profile ----------------------------
    if (action === 'update') {
      const { id, full_name, phone_number, email, role, status } = body;
      if (!id) return json({ error: 'id is required' }, 400);
      if (role && !VALID_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);
      if (status && !VALID_STATUSES.includes(status)) return json({ error: 'Invalid status' }, 400);
      if (id === caller.id && (role || status)) {
        return json({ error: 'You cannot change your own role or status' }, 400);
      }

      const e164Phone = phone_number ? toE164(phone_number) : undefined;

      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (full_name !== undefined) updatePayload.full_name = full_name;
      if (e164Phone !== undefined) updatePayload.phone_number = e164Phone;
      if (email !== undefined) updatePayload.email = email;
      if (role !== undefined) updatePayload.role = role;
      if (status !== undefined) updatePayload.status = status;

      const { data: profile, error: updateError } = await admin
        .from('profiles')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (updateError) return json({ error: updateError.message }, 400);

      // Keep the Auth record's phone/email in sync, and reflect Inactive/Suspended
      // as an actual sign-in ban — not just a cosmetic status label.
      const authUpdate: Record<string, unknown> = {};
      if (e164Phone) authUpdate.phone = e164Phone;
      if (email) authUpdate.email = email;
      if (status) authUpdate.ban_duration = status === 'Active' ? 'none' : '876000h';
      if (Object.keys(authUpdate).length > 0) {
        await admin.auth.admin.updateUserById(id, authUpdate);
      }

      return json({ profile });
    }

    // ---- Reset a staff user's password -------------------------------------
    if (action === 'resetPassword') {
      const { id, password } = body;
      if (!id || !password) return json({ error: 'id and password are required' }, 400);
      if (String(password).length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---- Activate / deactivate a staff user --------------------------------
    if (action === 'setStatus') {
      const { id, status } = body;
      if (!id || !status || !VALID_STATUSES.includes(status)) {
        return json({ error: 'id and a valid status are required' }, 400);
      }
      if (id === caller.id) {
        return json({ error: 'You cannot change your own status' }, 400);
      }

      const { data: profile, error } = await admin
        .from('profiles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);

      await admin.auth.admin.updateUserById(id, {
        ban_duration: status === 'Active' ? 'none' : '876000h',
      });

      return json({ profile });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
