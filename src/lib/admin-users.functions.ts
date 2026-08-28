import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Privileged staff-account management.
 *
 * Everything here runs on the server with the service role, which bypasses row
 * level security — so the first thing every action does is re-establish, from
 * the database, who is calling and what they are allowed to do with *this*
 * staff member. The browser's claim about its own role is never consulted:
 * changing a URL, replaying a request or editing a bundle reaches this code
 * with the same session token it started with, and the checks below read the
 * caller's real profile every time.
 *
 * The permission matrix in `role_permissions` is the authority for what each
 * role may do. `staff.manage = full` is an Administrator; `limited` is a Branch
 * Manager, who may look after the officers in their own branches and nothing
 * beyond that.
 */

export type AdminUsersAction =
  "create" | "update" | "resetPassword" | "setStatus" | "bulkStatus" | "bulkAssignBranch";

type AdminUsersInput = {
  action: AdminUsersAction;
  id?: string;
  ids?: string[];
  full_name?: string;
  phone_number?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
  branch_ids?: string[];
  primary_branch_id?: string | null;
  date_joined?: string | null;
  avatar_url?: string | null;
  /** Required whenever an account is suspended, and recorded on the audit row. */
  reason?: string;
  /** Force a password change at the next sign-in. */
  must_change_password?: boolean;
};

const STAFF_ROLES = ["Administrator", "Branch Manager", "Loan Officer", "Auditor"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const STAFF_STATUSES = ["Active", "Pending", "Inactive", "Suspended"] as const;
type StaffStatus = (typeof STAFF_STATUSES)[number];

const normalizeRole = (value?: string): StaffRole => {
  const role = value ?? "Loan Officer";
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    throw new Error(`Unsupported staff role: ${role}`);
  }
  return role as StaffRole;
};

const normalizeStatus = (value?: string): StaffStatus => {
  const status = value ?? "Active";
  if (!STAFF_STATUSES.includes(status as StaffStatus)) {
    throw new Error(`Unsupported account status: ${status}`);
  }
  return status as StaffStatus;
};

const requiresBranchAssignment = (role: StaffRole) =>
  role === "Branch Manager" || role === "Loan Officer";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^07\d{8}$/;

interface Caller {
  id: string;
  role: StaffRole;
  status: string;
  branch_ids: string[];
  /** 'full' for an Administrator, 'limited' for a Branch Manager. */
  level: string;
  full_name: string;
}

/** A Branch Manager may only ever act on a Loan Officer inside their branches. */
const assertMayActOn = (
  caller: Caller,
  subject: { id: string; role: string; branch_ids: string[] | null; full_name: string },
) => {
  if (caller.level === "full") return;

  if (subject.role !== "Loan Officer") {
    throw new Error("A Branch Manager may only manage Loan Officer accounts");
  }
  const overlap = (subject.branch_ids ?? []).some((b) => caller.branch_ids.includes(b));
  if (!overlap) {
    throw new Error(`${subject.full_name} is not attached to a branch you manage`);
  }
};

/** And may only ever create or move someone into a Loan Officer post there. */
const assertMayAssign = (caller: Caller, role: StaffRole, branchIds: string[]) => {
  if (caller.level === "full") return;

  if (role !== "Loan Officer") {
    throw new Error("A Branch Manager may only create or assign Loan Officer accounts");
  }
  const outside = branchIds.filter((b) => !caller.branch_ids.includes(b));
  if (outside.length > 0 || branchIds.length === 0) {
    throw new Error("You can only assign staff to the branches you manage");
  }
};

export const adminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AdminUsersInput) => data)
  .handler(async ({ data, context }) => {
    // The caller's real profile, read through their own session (so RLS still
    // applies), not whatever the request body would like us to believe.
    const { data: me, error: meError } = await context.supabase
      .from("profiles")
      .select("id, role, status, branch_ids, full_name")
      .eq("id", context.userId)
      .maybeSingle();

    if (meError) throw new Error(meError.message);
    if (!me) throw new Error("Your staff profile could not be read");
    if (me.status !== "Active") throw new Error("Your account is not active");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // What this role is permitted to do comes from the database, so tightening
    // the matrix takes effect immediately rather than at the next deploy.
    const { data: grant } = await supabaseAdmin
      .from("role_permissions")
      .select("level")
      .eq("role", me.role)
      .eq("permission_key", "staff.manage")
      .maybeSingle();

    const level = (grant as { level?: string } | null)?.level ?? "none";
    if (level === "none") {
      throw new Error("Your role is not permitted to manage staff accounts");
    }

    const caller: Caller = {
      id: me.id as string,
      role: me.role as StaffRole,
      status: me.status as string,
      branch_ids: (me.branch_ids as string[] | null) ?? [],
      level,
      full_name: (me.full_name as string) ?? "Staff",
    };

    const loadSubject = async (id: string) => {
      const { data: subject, error } = await supabaseAdmin
        .from("profiles")
        .select("id, role, status, branch_ids, full_name, staff_code, primary_branch_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!subject) throw new Error("That staff member no longer exists");
      return subject as {
        id: string;
        role: string;
        status: string;
        branch_ids: string[] | null;
        full_name: string;
        staff_code: string | null;
        primary_branch_id: string | null;
      };
    };

    /**
     * Files an audit entry.
     *
     * This function runs as the service role, so `auth.uid()` is null inside
     * the database and `audit_profile_change` deliberately stands aside — it
     * would otherwise record the change and attribute it to nobody. Having
     * already established who the caller is, we write the entry ourselves with
     * their name against it. The trigger still catches anything that reaches
     * `profiles` by another route.
     */
    const writeAudit = async (input: {
      action: string;
      details: string;
      targetId?: string;
      recordId?: string | null;
      previous?: string | null;
      next?: string | null;
      reason?: string | null;
      branchId?: string | null;
    }) => {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: caller.id,
        user_name: caller.full_name,
        user_role: caller.role,
        action: input.action,
        module: "Staff Management",
        record_id: input.recordId ?? null,
        details: input.details,
        target_user_id: input.targetId ?? null,
        previous_value: input.previous ?? null,
        new_value: input.next ?? null,
        reason: input.reason ?? null,
        branch_id: input.branchId ?? null,
        ip_address: "server",
        device_info: "Staff management server function",
      });
    };

    // -----------------------------------------------------------------------
    if (data.action === "create") {
      const phone = (data.phone_number ?? "").trim();
      if (!PHONE_PATTERN.test(phone))
        throw new Error("Phone number must be 10 digits starting with 07");
      if ((data.password ?? "").length < 8)
        throw new Error("Password must be at least 8 characters");

      // The staff member's own address, not one derived from their phone: it is
      // how they sign in and the only way to actually reach them.
      const authEmail = (data.email ?? "").trim().toLowerCase();
      if (!authEmail) throw new Error("An email address is required");
      if (!EMAIL_PATTERN.test(authEmail)) throw new Error("Enter a valid email address");

      const role = normalizeRole(data.role);
      const branchIds = requiresBranchAssignment(role) ? (data.branch_ids ?? []) : [];
      if (requiresBranchAssignment(role) && branchIds.length === 0) {
        throw new Error(`${role} accounts must be attached to at least one branch`);
      }
      assertMayAssign(caller, role, branchIds);

      const primaryBranch = requiresBranchAssignment(role)
        ? data.primary_branch_id && branchIds.includes(data.primary_branch_id)
          ? data.primary_branch_id
          : branchIds[0]
        : null;

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
          // An account nobody has signed into yet is Pending, not Active. It
          // becomes Active by itself at the holder's first sign-in.
          status: normalizeStatus(data.status ?? "Pending"),
          branch_ids: branchIds,
          primary_branch_id: primaryBranch,
          date_joined: data.date_joined || new Date().toISOString().split("T")[0],
          avatar_url: data.avatar_url ?? null,
          must_change_password: data.must_change_password ?? true,
          last_password_change_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (profileError) throw new Error(profileError.message);

      const created_code = (profile as { staff_code?: string | null } | null)?.staff_code ?? null;
      await writeAudit({
        action: "Staff Account Created",
        details: `${data.full_name ?? "Staff User"} (${created_code ?? "—"}) created as ${role}`,
        targetId: created.user.id,
        recordId: created_code,
        next: role,
        branchId: primaryBranch,
      });

      return { profile };
    }

    // -----------------------------------------------------------------------
    if (data.action === "bulkStatus" || data.action === "bulkAssignBranch") {
      const ids = (data.ids ?? []).filter(Boolean);
      if (ids.length === 0) throw new Error("Select at least one staff member");
      if (ids.includes(caller.id))
        throw new Error("You cannot include your own account in a bulk action");

      const results: { id: string; ok: boolean; message?: string }[] = [];

      for (const id of ids) {
        try {
          const subject = await loadSubject(id);
          assertMayActOn(caller, subject);

          if (data.action === "bulkStatus") {
            const status = normalizeStatus(data.status);
            if (status === "Suspended" && !(data.reason ?? "").trim()) {
              throw new Error("A suspension needs a stated reason");
            }
            const { error } = await supabaseAdmin
              .from("profiles")
              .update({
                status,
                status_reason: (data.reason ?? "").trim() || null,
                status_changed_at: new Date().toISOString(),
                status_changed_by: caller.id,
              })
              .eq("id", id);
            if (error) throw new Error(error.message);
            await writeAudit({
              action: "Staff Status Changed",
              details: `${subject.full_name} went from ${subject.status} to ${status}`,
              targetId: id,
              recordId: subject.staff_code,
              previous: subject.status,
              next: status,
              reason: (data.reason ?? "").trim() || null,
              branchId: subject.primary_branch_id,
            });
          } else {
            const branchIds = data.branch_ids ?? [];
            if (branchIds.length === 0) throw new Error("Choose at least one branch");
            assertMayAssign(caller, normalizeRole(subject.role), branchIds);
            const { error } = await supabaseAdmin
              .from("profiles")
              .update({ branch_ids: branchIds, primary_branch_id: branchIds[0] })
              .eq("id", id);
            if (error) throw new Error(error.message);
            await writeAudit({
              action: "Staff Branch Assignment Changed",
              details: `${subject.full_name} reassigned`,
              targetId: id,
              recordId: subject.staff_code,
              previous: (subject.branch_ids ?? []).join(", "),
              next: branchIds.join(", "),
              reason: (data.reason ?? "").trim() || null,
              branchId: branchIds[0],
            });
          }
          results.push({ id, ok: true });
        } catch (err) {
          results.push({ id, ok: false, message: err instanceof Error ? err.message : "Failed" });
        }
      }

      const applied = results.filter((r) => r.ok).length;
      await writeAudit({
        action:
          data.action === "bulkStatus" ? "Bulk Staff Status Change" : "Bulk Branch Assignment",
        details:
          data.action === "bulkStatus"
            ? `${applied} of ${ids.length} accounts set to ${normalizeStatus(data.status)}`
            : `${applied} of ${ids.length} accounts reassigned`,
        next:
          data.action === "bulkStatus"
            ? normalizeStatus(data.status)
            : (data.branch_ids ?? []).join(", "),
        reason: (data.reason ?? "").trim() || null,
      });

      return { results, applied, total: ids.length };
    }

    if (!data.id) throw new Error("Missing user id");

    const subject = await loadSubject(data.id);

    // -----------------------------------------------------------------------
    if (data.action === "resetPassword") {
      assertMayActOn(caller, subject);
      if ((data.password ?? "").length < 8)
        throw new Error("Password must be at least 8 characters");

      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        password: data.password!,
      });
      if (error) throw new Error(error.message);

      // The password itself is never stored, returned or logged — only the
      // fact that it changed, when, and who forced it.
      await supabaseAdmin
        .from("profiles")
        .update({
          last_password_change_at: new Date().toISOString(),
          must_change_password: data.must_change_password ?? true,
          failed_login_attempts: 0,
        })
        .eq("id", data.id);

      await writeAudit({
        action: "Staff Password Reset",
        details: `Password reset for ${subject.full_name} (${subject.staff_code ?? "—"})`,
        targetId: data.id,
        recordId: subject.staff_code,
        reason: (data.reason ?? "").trim() || null,
        branchId: subject.primary_branch_id,
      });

      return { ok: true };
    }

    // -----------------------------------------------------------------------
    if (data.action === "setStatus") {
      assertMayActOn(caller, subject);
      if (data.id === caller.id) throw new Error("You cannot change your own account status");

      const status = normalizeStatus(data.status);
      const reason = (data.reason ?? "").trim();
      if (status === "Suspended" && !reason) throw new Error("A suspension needs a stated reason");

      // The last Administrator who can still sign in has to remain: the
      // database refuses this too, but saying so here gives a usable message.
      if (subject.role === "Administrator" && subject.status === "Active" && status !== "Active") {
        const { count } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "Administrator")
          .eq("status", "Active")
          .neq("id", data.id);
        if ((count ?? 0) === 0) {
          throw new Error("This is the last active Administrator — appoint another one first");
        }
      }

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          status,
          status_reason: reason || null,
          status_changed_at: new Date().toISOString(),
          status_changed_by: caller.id,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);

      await writeAudit({
        action: "Staff Status Changed",
        details: `${subject.full_name} went from ${subject.status} to ${status}`,
        targetId: data.id,
        recordId: subject.staff_code,
        previous: subject.status,
        next: status,
        reason: reason || null,
        branchId: subject.primary_branch_id,
      });

      return { ok: true };
    }

    // ------------------------------------------------------------- update ---
    assertMayActOn(caller, subject);

    const phone = (data.phone_number ?? "").trim();
    if (phone && !PHONE_PATTERN.test(phone)) {
      throw new Error("Phone number must be 10 digits starting with 07");
    }

    const role = normalizeRole(data.role);
    const branchIds = requiresBranchAssignment(role) ? (data.branch_ids ?? []) : [];
    if (requiresBranchAssignment(role) && branchIds.length === 0) {
      throw new Error(`${role} accounts must be attached to at least one branch`);
    }
    assertMayAssign(caller, role, branchIds);

    // Promoting somebody is an Administrator's decision, never a manager's.
    if (caller.level !== "full" && role !== subject.role) {
      throw new Error("Only an Administrator may change a staff member's role");
    }
    if (data.id === caller.id && role !== subject.role) {
      throw new Error("You cannot change your own role");
    }

    const nextStatus = data.status ? normalizeStatus(data.status) : (subject.status as StaffStatus);
    if (data.id === caller.id && nextStatus !== subject.status) {
      throw new Error("You cannot change your own account status");
    }

    const primaryBranch = requiresBranchAssignment(role)
      ? data.primary_branch_id && branchIds.includes(data.primary_branch_id)
        ? data.primary_branch_id
        : branchIds[0]
      : null;

    const patch = {
      full_name: data.full_name,
      phone_number: phone,
      role,
      status: nextStatus,
      branch_ids: branchIds,
      primary_branch_id: primaryBranch,
      ...(data.date_joined ? { date_joined: data.date_joined } : {}),
      ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
      ...(data.email ? { email: data.email.trim().toLowerCase() } : {}),
      ...((data.reason ?? "").trim() ? { status_reason: data.reason!.trim() } : {}),
    };

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // One entry per thing that actually moved, each carrying what it was and
    // what it became — an edit that changed nothing files nothing.
    if (role !== subject.role) {
      await writeAudit({
        action: "Staff Role Changed",
        details: `${data.full_name ?? subject.full_name} moved from ${subject.role} to ${role}`,
        targetId: data.id,
        recordId: subject.staff_code,
        previous: subject.role,
        next: role,
        reason: (data.reason ?? "").trim() || null,
        branchId: primaryBranch,
      });
    }
    if (nextStatus !== subject.status) {
      await writeAudit({
        action: "Staff Status Changed",
        details: `${data.full_name ?? subject.full_name} went from ${subject.status} to ${nextStatus}`,
        targetId: data.id,
        recordId: subject.staff_code,
        previous: subject.status,
        next: nextStatus,
        reason: (data.reason ?? "").trim() || null,
        branchId: primaryBranch,
      });
    }
    const previousBranches = (subject.branch_ids ?? []).join(", ");
    if (previousBranches !== branchIds.join(", ")) {
      await writeAudit({
        action: "Staff Branch Assignment Changed",
        details: `${data.full_name ?? subject.full_name} reassigned`,
        targetId: data.id,
        recordId: subject.staff_code,
        previous: previousBranches,
        next: branchIds.join(", "),
        branchId: primaryBranch,
      });
    }

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
