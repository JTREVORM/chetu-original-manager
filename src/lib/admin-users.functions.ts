import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminUsersInput = {
  action: "create" | "update" | "resetPassword" | "setStatus";
  id?: string;
  full_name?: string;
  phone_number?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
  branch_ids?: string[];
};


const STAFF_ROLES = ['Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const normalizeRole = (value?: string): StaffRole => {
  const role = value ?? 'Loan Officer';
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    throw new Error(`Unsupported staff role: ${role}`);
  }
  return role as StaffRole;
};

const requiresBranchAssignment = (role: StaffRole) => role === 'Branch Manager' || role === 'Loan Officer';

/**
 * Privileged staff-account management. Runs on the server with the service
 * role, but only after re-checking that the caller is an active Administrator.
 */
export const adminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AdminUsersInput) => data)
  .handler(async ({ data, context }) => {
    const { data: me, error: meError } = await context.supabase
      .from("profiles")
      .select("role, status")
      .eq("id", context.userId)
      .maybeSingle();

    if (meError) throw new Error(meError.message);
    if (!me || me.role !== "Administrator" || me.status !== "Active") {
      throw new Error("Only an active Administrator may manage staff accounts");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      const phone = (data.phone_number ?? "").trim();
      if (!/^07\d{8}$/.test(phone)) throw new Error("Phone number must be 10 digits starting with 07");
      if ((data.password ?? "").length < 8) throw new Error("Password must be at least 8 characters");

      // The staff member's own address, not one derived from their phone: it is
      // how they sign in and the only way to actually reach them.
      const authEmail = (data.email ?? "").trim().toLowerCase();
      if (!authEmail) throw new Error("An email address is required");
      if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(authEmail)) throw new Error("Enter a valid email address");
      const role = normalizeRole(data.role);
      const branchIds = data.branch_ids ?? [];
      if (requiresBranchAssignment(role) && branchIds.length === 0) {
        throw new Error(`${role} accounts must be attached to at least one branch`);
      }

      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: data.password!,
        email_confirm: true,
        user_metadata: { full_name: data.full_name, role, phone_number: phone },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: created.user.id,
          email: authEmail,
          full_name: data.full_name ?? "Staff User",
          role,
          phone_number: phone,
          status: "Active",
          branch_ids: requiresBranchAssignment(role) ? branchIds : [],
        })
        .select()
        .single();
      if (profileError) throw new Error(profileError.message);

      return { profile };
    }

    if (!data.id) throw new Error("Missing user id");

    if (data.action === "resetPassword") {
      if ((data.password ?? "").length < 8) throw new Error("Password must be at least 8 characters");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        password: data.password!,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    if (data.action === "setStatus") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ status: data.status ?? "Active" })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // update
    const phone = (data.phone_number ?? "").trim();
    if (phone && !/^07\d{8}$/.test(phone)) throw new Error("Phone number must be 10 digits starting with 07");

    const role = normalizeRole(data.role);
    const branchIds = data.branch_ids ?? [];
    if (requiresBranchAssignment(role) && branchIds.length === 0) {
      throw new Error(`${role} accounts must be attached to at least one branch`);
    }
    const patch = {
      full_name: data.full_name,
      phone_number: phone,
      role,
      status: data.status,
      branch_ids: requiresBranchAssignment(role) ? branchIds : [],
      ...(data.email ? { email: data.email.trim().toLowerCase() } : {}),
    };


    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // The email is the sign-in credential, so a change to it has to reach the
    // auth account too — the phone is only contact detail and metadata.
    const nextEmail = (data.email ?? "").trim().toLowerCase();
    if (nextEmail || phone) {
      await supabaseAdmin.auth.admin.updateUserById(data.id, {
        ...(nextEmail ? { email: nextEmail, email_confirm: true } : {}),
        user_metadata: { full_name: data.full_name, role, phone_number: phone },
      });
    }

    return { profile };
  });
