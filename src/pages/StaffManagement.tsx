/**
 * Staff Management — the staff register and everything done to it.
 *
 * This screen is a view over records the database owns, not a place where
 * authority lives. Every mutation goes through `adminUsers`, a server function
 * holding the service-role key that re-reads the caller's real profile and the
 * `role_permissions` matrix before it touches anything; behind that sit the RLS
 * policies and the `guard_profile_privilege_change` trigger. So the controls
 * below are greyed out as a courtesy — changing a URL, replaying the request or
 * editing the bundle reaches exactly the same refusal.
 *
 * The counts are the filters. A tile that says "3 Suspended" and a list that
 * shows something else would be two answers to one question, so clicking the
 * tile sets the filter that produced the number.
 */
import React, { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, UserCog, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { adminUsers } from "../lib/admin-users.functions";
import { sendNotification } from "../lib/notify";
import { useMyPermissions, usePermissionMatrix } from "../lib/permissions";
import type { StaffStatus, UserRole } from "../types/database.types";

import { StaffStatsStrip } from "../components/staff/StaffStats";
import { StaffToolbar } from "../components/staff/StaffToolbar";
import { StaffTable, sortStaff, type StaffSortKey } from "../components/staff/StaffTable";
import { StaffProfileDrawer } from "../components/staff/StaffProfileDrawer";
import { AddStaffWizard, type NewStaffDraft } from "../components/staff/AddStaffWizard";
import { EditStaffModal, type StaffEdit } from "../components/staff/EditStaffModal";
import {
  ActivateStaffDialog,
  BulkActionDialog,
  DeactivateStaffDialog,
  ResetPasswordDialog,
  SuspendStaffDialog,
  type BulkAction,
} from "../components/staff/StaffDialogs";
import {
  EmptyState,
  PrimaryButton,
  SkeletonStats,
  SkeletonTable,
} from "../components/staff/StaffUi";
import {
  EMPTY_STAFF_FILTERS,
  computeStaffStats,
  useFilteredStaff,
  useStaffRegister,
  type StaffDirectoryRow,
  type StaffFilters,
} from "../components/staff/useStaffRegister";
import { exportStaff } from "../components/staff/staffExport";

type DrawerTab = "profile" | "activity" | "audit";

export const StaffManagement: React.FC = () => {
  const { user } = useAuth();
  const { branches, dataVersion, refetch } = useDatabase();
  const { addToast } = useNotifications();
  const { can, level } = useMyPermissions();
  const { permissions, levelFor } = usePermissionMatrix();

  const { rows, loading, refreshing, error, reload } = useStaffRegister(dataVersion);

  const [filters, setFilters] = useState<StaffFilters>(EMPTY_STAFF_FILTERS);
  const [sortKey, setSortKey] = useState<StaffSortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [drawerStaff, setDrawerStaff] = useState<StaffDirectoryRow | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("profile");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffDirectoryRow | null>(null);
  const [resetStaff, setResetStaff] = useState<StaffDirectoryRow | null>(null);
  const [suspendStaff, setSuspendStaff] = useState<StaffDirectoryRow | null>(null);
  const [deactivateStaff, setDeactivateStaff] = useState<StaffDirectoryRow | null>(null);
  const [activateStaff, setActivateStaff] = useState<{
    staff: StaffDirectoryRow;
    mode: "reinstate" | "activate";
  } | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  const manageLevel = level("staff.manage");
  const canManageStaff = can("staff.manage");
  const isLimited = manageLevel === "limited";

  const filtered = useFilteredStaff(rows, filters);
  const sorted = useMemo(
    () => sortStaff(filtered, sortKey, sortDirection),
    [filtered, sortKey, sortDirection],
  );
  const stats = useMemo(() => computeStaffStats(rows), [rows]);

  // A Branch Manager may only look after Loan Officers in their own branches.
  // The database enforces this; the menu simply stops offering what it will
  // refuse, so nobody discovers the boundary by hitting an error.
  const canManageRow = (row: StaffDirectoryRow) => {
    if (!canManageStaff) return false;
    if (row.id === user?.id) return false;
    if (manageLevel === "full") return true;
    if (row.role !== "Loan Officer") return false;
    return (row.branch_ids || []).some((b) => (user?.branch_ids || []).includes(b));
  };

  const visibleBranches = useMemo(() => {
    const active = branches.filter((b) => b.status === "Active");
    if (manageLevel === "full" || !user?.branch_ids?.length) return active;
    return active.filter((b) => (user.branch_ids || []).includes(b.id));
  }, [branches, manageLevel, user?.branch_ids]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.branch_name || id;

  const selectedRows = useMemo(
    () => sorted.filter((r) => selected.includes(r.id)),
    [sorted, selected],
  );

  const onSort = (key: StaffSortKey) => {
    if (key === sortKey) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const applyFilterPatch = (patch: Partial<StaffFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setSelected([]);
  };

  const refreshAll = async () => {
    await Promise.all([reload({ silent: true }), refetch({ silent: true })]);
  };

  /**
   * Every completed action tells someone. Administrators get the record, and
   * the staff member themselves is told when it is their own access that
   * changed — that is not news they should first learn at a locked login.
   */
  const announce = async (input: {
    title: string;
    message: string;
    type: "System" | "Alert";
    recipientIds?: string[];
  }) => {
    await sendNotification({
      title: input.title,
      message: input.message,
      type: input.type,
      audience: "admins",
      recipientIds: input.recipientIds,
      link_url: "/users",
      excludeId: user?.id,
      includeActor: true,
    });
  };

  const call = async (payload: Record<string, unknown>) =>
    (await adminUsers({ data: payload as never })) as {
      profile?: { id: string };
      results?: { id: string; ok: boolean; message?: string }[];
      applied?: number;
      total?: number;
    };

  const failed = (err: unknown) =>
    err instanceof Error ? err.message : "The change was not applied.";

  // ------------------------------------------------------------- create ---
  const createStaff = async (draft: NewStaffDraft) => {
    setBusy(true);
    try {
      const fullName = `${draft.first_name.trim()} ${draft.last_name.trim()}`.trim();
      await call({
        action: "create",
        full_name: fullName,
        phone_number: draft.phone_number.trim(),
        email: draft.email.trim().toLowerCase(),
        password: draft.password,
        role: draft.role,
        status: draft.status,
        branch_ids: draft.branch_ids,
        primary_branch_id: draft.primary_branch_id || draft.branch_ids[0] || null,
        date_joined: draft.date_joined || null,
        avatar_url: draft.avatar_url || null,
        must_change_password: draft.must_change_password,
      });

      addToast("success", "Staff account created", `${fullName} was added as a ${draft.role}.`);
      await announce({
        title: "Staff account created",
        message: `${fullName} was added as a ${draft.role}${draft.branch_ids.length ? ` at ${branchName(draft.branch_ids[0])}` : ""}.`,
        type: "System",
      });
      setWizardOpen(false);
      await refreshAll();
    } catch (err) {
      addToast("error", "Could not create the account", failed(err));
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------------------- edit ---
  const saveEdit = async (edit: StaffEdit) => {
    if (!editStaff) return;
    setBusy(true);
    try {
      await call({
        action: "update",
        id: editStaff.id,
        full_name: edit.full_name.trim(),
        phone_number: edit.phone_number.trim(),
        email: edit.email.trim().toLowerCase(),
        role: edit.role,
        status: edit.status,
        branch_ids: edit.branch_ids,
        primary_branch_id: edit.primary_branch_id || edit.branch_ids[0] || null,
        date_joined: edit.date_joined || null,
        avatar_url: edit.avatar_url || null,
      });

      addToast("success", "Staff account updated", `Saved the changes to ${edit.full_name}.`);
      const roleChanged = edit.role !== editStaff.role;
      await announce({
        title: roleChanged ? "Staff role changed" : "Staff account updated",
        message: roleChanged
          ? `${edit.full_name} moved from ${editStaff.role} to ${edit.role}.`
          : `${edit.full_name}'s account details were updated.`,
        type: roleChanged ? "Alert" : "System",
        recipientIds: [editStaff.id],
      });
      setEditStaff(null);
      setDrawerStaff(null);
      await refreshAll();
    } catch (err) {
      addToast("error", "Could not save the changes", failed(err));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ password ---
  const resetPassword = async (password: string, mustChange: boolean) => {
    if (!resetStaff) return;
    setBusy(true);
    try {
      await call({
        action: "resetPassword",
        id: resetStaff.id,
        password,
        must_change_password: mustChange,
      });

      addToast("success", "Password reset", `A new password was set for ${resetStaff.full_name}.`);
      await announce({
        title: "Password reset",
        message: `An Administrator reset the password for ${resetStaff.full_name} (${resetStaff.staff_code || "—"}).`,
        type: "Alert",
        recipientIds: [resetStaff.id],
      });
      setResetStaff(null);
      await refreshAll();
    } catch (err) {
      addToast("error", "Could not reset the password", failed(err));
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------- status ---
  const setStatus = async (staff: StaffDirectoryRow, status: StaffStatus, reason: string) => {
    setBusy(true);
    try {
      await call({ action: "setStatus", id: staff.id, status, reason });

      const wording: Record<
        string,
        { toast: string; title: string; message: string; type: "System" | "Alert" }
      > = {
        Suspended: {
          toast: `${staff.full_name} is suspended.`,
          title: "Staff account suspended",
          message: `${staff.full_name} (${staff.role}) cannot sign in. Reason: ${reason}`,
          type: "Alert",
        },
        Inactive: {
          toast: `${staff.full_name} is deactivated.`,
          title: "Staff account deactivated",
          message: `${staff.full_name} (${staff.role}) can no longer sign in.${reason ? ` Reason: ${reason}` : ""}`,
          type: "Alert",
        },
        Active: {
          toast: `${staff.full_name} can sign in again.`,
          title: "Staff account reinstated",
          message: `${staff.full_name} (${staff.role}) can sign in again.${reason ? ` Note: ${reason}` : ""}`,
          type: "System",
        },
      };
      const words = wording[status] || wording.Active;

      addToast(status === "Active" ? "success" : "info", "Account status changed", words.toast);
      await announce({
        title: words.title,
        message: words.message,
        type: words.type,
        recipientIds: [staff.id],
      });

      setSuspendStaff(null);
      setDeactivateStaff(null);
      setActivateStaff(null);
      setDrawerStaff(null);
      await refreshAll();
    } catch (err) {
      addToast("error", "Could not change the status", failed(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- bulk ---
  const runBulk = async ({ reason, branchIds }: { reason: string; branchIds: string[] }) => {
    if (!bulkAction) return;
    setBusy(true);
    try {
      const statusFor: Record<string, StaffStatus> = {
        Activate: "Active",
        Deactivate: "Inactive",
        Suspend: "Suspended",
      };

      const result =
        bulkAction === "AssignBranch"
          ? await call({ action: "bulkAssignBranch", ids: selected, branch_ids: branchIds, reason })
          : await call({
              action: "bulkStatus",
              ids: selected,
              status: statusFor[bulkAction],
              reason,
            });

      const applied = result.applied ?? 0;
      const total = result.total ?? selected.length;
      const refused = (result.results || []).filter((r) => !r.ok);

      if (applied === total) {
        addToast(
          "success",
          "Bulk action applied",
          `${applied} account${applied === 1 ? "" : "s"} updated.`,
        );
      } else {
        // Naming the first refusal is more use than "some failed": the reason
        // is usually the same for all of them.
        addToast(
          "info",
          "Bulk action partly applied",
          `${applied} of ${total} updated. ${refused[0]?.message || "The rest were refused."}`,
        );
      }

      await announce({
        title:
          bulkAction === "AssignBranch"
            ? "Staff reassigned in bulk"
            : "Staff status changed in bulk",
        message:
          bulkAction === "AssignBranch"
            ? `${applied} of ${total} staff accounts were attached to ${branchIds.map(branchName).join(", ")}.`
            : `${applied} of ${total} staff accounts were set to ${statusFor[bulkAction]}.${reason ? ` Reason: ${reason}` : ""}`,
        type: bulkAction === "Activate" ? "System" : "Alert",
      });

      setBulkAction(null);
      setSelected([]);
      await refreshAll();
    } catch (err) {
      addToast("error", "Bulk action failed", failed(err));
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------- export ---
  const runExport = async (format: "excel" | "csv" | "pdf") => {
    try {
      await exportStaff(format, sorted, filters, branchName, user?.full_name || "Staff Management");
      addToast(
        "success",
        "Export ready",
        `${sorted.length} record${sorted.length === 1 ? "" : "s"} exported.`,
      );
    } catch (err) {
      addToast("error", "Export failed", failed(err));
    }
  };

  const openDrawer = (staff: StaffDirectoryRow, tab: DrawerTab = "profile") => {
    setDrawerStaff(staff);
    setDrawerTab(tab);
  };

  const handlers = (row: StaffDirectoryRow) => ({
    onView: () => openDrawer(row, "profile"),
    onEdit: () => setEditStaff(row),
    onResetPassword: () => setResetStaff(row),
    onSuspend: () => setSuspendStaff(row),
    onReinstate: () => setActivateStaff({ staff: row, mode: "reinstate" }),
    onDeactivate: () => setDeactivateStaff(row),
    onActivate: () => setActivateStaff({ staff: row, mode: "activate" }),
    onViewActivity: () => openDrawer(row, "activity"),
    onViewAudit: () => openDrawer(row, "audit"),
  });

  const allowedRoles: UserRole[] =
    manageLevel === "full"
      ? ["Loan Officer", "Branch Manager", "Administrator", "Auditor"]
      : ["Loan Officer"];

  return (
    <div className="space-y-4 pb-12">
      {/* ------------------------------------------------------- header --- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <UserCog className="h-5 w-5 text-[#0B4394]" />
            Staff Management
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-slate-500">
            Manage staff accounts, roles, branch assignments, permissions, and system access.
          </p>
        </div>

        {canManageStaff && (
          <PrimaryButton type="button" onClick={() => setWizardOpen(true)} className="shrink-0">
            <UserPlus className="h-4 w-4" />
            Add Staff
          </PrimaryButton>
        )}
      </div>

      {isLimited && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] leading-relaxed text-[#0B4394]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            You are managing staff as a Branch Manager. You can look after the Loan Officers
            attached to your branches; roles, other branches and management accounts are an
            Administrator's decision.
          </span>
        </div>
      )}

      {/* -------------------------------------------------------- states --- */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-chetu-red" />
          <p className="mt-2 text-[13px] font-bold text-red-800">Unable to load staff accounts.</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-chetu-red px-4 text-[12px] font-bold text-white hover:bg-chetu-darkred"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : loading ? (
        <>
          <SkeletonStats />
          <SkeletonTable />
        </>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff accounts yet"
          message="Nothing has been filed under your access. The first Administrator is created with the bootstrap script; everyone else is added here."
          action={
            canManageStaff ? (
              <PrimaryButton type="button" onClick={() => setWizardOpen(true)}>
                <UserPlus className="h-4 w-4" /> Add Staff
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <StaffStatsStrip stats={stats} filters={filters} onApply={applyFilterPatch} />

          <StaffToolbar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setSelected([]);
            }}
            branches={visibleBranches}
            branchLocked={manageLevel !== "full"}
            onRefresh={() => void refreshAll()}
            refreshing={refreshing}
            resultCount={sorted.length}
            totalCount={rows.length}
            onExport={(format) => void runExport(format)}
          />

          {/* --------------------------------------------- bulk actions --- */}
          {canManageStaff && selected.length > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-[#0B4394]/30 bg-[#0B4394] px-3 py-2.5 text-white shadow-lg">
              <span className="text-[12px] font-bold">{selected.length} selected</span>
              <span className="hidden text-[11px] text-blue-200 sm:inline">
                Each account is checked separately
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBulkAction("Activate")}
                  className="h-8 rounded-lg bg-white/15 px-3 text-[11px] font-bold hover:bg-white/25"
                >
                  Activate
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAction("Suspend")}
                  className="h-8 rounded-lg bg-white/15 px-3 text-[11px] font-bold hover:bg-white/25"
                >
                  Suspend
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAction("Deactivate")}
                  className="h-8 rounded-lg bg-white/15 px-3 text-[11px] font-bold hover:bg-white/25"
                >
                  Deactivate
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAction("AssignBranch")}
                  className="h-8 rounded-lg bg-white/15 px-3 text-[11px] font-bold hover:bg-white/25"
                >
                  Assign Branch
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  aria-label="Clear selection"
                  className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 hover:bg-white/25"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <StaffTable
            rows={sorted}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={onSort}
            selectable={canManageStaff}
            selected={selected}
            onToggleRow={(id) =>
              setSelected((prev) =>
                prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
              )
            }
            onToggleAll={() => {
              const eligible = sorted.filter((r) => canManageRow(r)).map((r) => r.id);
              setSelected((prev) => (eligible.every((id) => prev.includes(id)) ? [] : eligible));
            }}
            currentUserId={user?.id}
            canManage={canManageRow}
            onOpen={(row) => openDrawer(row, "profile")}
            handlers={handlers}
          />
        </>
      )}

      {/* --------------------------------------------------------- panes --- */}
      <StaffProfileDrawer
        open={!!drawerStaff}
        staff={drawerStaff}
        branches={branches}
        permissions={permissions}
        levelFor={(key) => (drawerStaff ? levelFor(drawerStaff.role, key) : "none")}
        canManage={drawerStaff ? canManageRow(drawerStaff) : false}
        isSelf={drawerStaff?.id === user?.id}
        initialTab={drawerTab}
        onClose={() => setDrawerStaff(null)}
        onEdit={() => drawerStaff && setEditStaff(drawerStaff)}
        onResetPassword={() => drawerStaff && setResetStaff(drawerStaff)}
        onSuspend={() => drawerStaff && setSuspendStaff(drawerStaff)}
        onReinstate={() =>
          drawerStaff && setActivateStaff({ staff: drawerStaff, mode: "reinstate" })
        }
        onDeactivate={() => drawerStaff && setDeactivateStaff(drawerStaff)}
        onActivate={() => drawerStaff && setActivateStaff({ staff: drawerStaff, mode: "activate" })}
      />

      <AddStaffWizard
        open={wizardOpen}
        branches={visibleBranches}
        permissions={permissions}
        levelFor={levelFor}
        allowedRoles={allowedRoles}
        submitting={busy}
        onClose={() => setWizardOpen(false)}
        onSubmit={createStaff}
      />

      <EditStaffModal
        open={!!editStaff}
        staff={editStaff}
        branches={
          manageLevel === "full" ? branches.filter((b) => b.status === "Active") : visibleBranches
        }
        canChangeRole={manageLevel === "full"}
        submitting={busy}
        onClose={() => setEditStaff(null)}
        onSubmit={saveEdit}
      />

      <ResetPasswordDialog
        open={!!resetStaff}
        staff={resetStaff}
        busy={busy}
        onClose={() => setResetStaff(null)}
        onConfirm={(password, mustChange) => void resetPassword(password, mustChange)}
      />

      <SuspendStaffDialog
        open={!!suspendStaff}
        staff={suspendStaff}
        busy={busy}
        onClose={() => setSuspendStaff(null)}
        onConfirm={(reason) => suspendStaff && void setStatus(suspendStaff, "Suspended", reason)}
      />

      <DeactivateStaffDialog
        open={!!deactivateStaff}
        staff={deactivateStaff}
        busy={busy}
        onClose={() => setDeactivateStaff(null)}
        onConfirm={(reason) =>
          deactivateStaff && void setStatus(deactivateStaff, "Inactive", reason)
        }
      />

      <ActivateStaffDialog
        open={!!activateStaff}
        staff={activateStaff?.staff || null}
        mode={activateStaff?.mode || "activate"}
        busy={busy}
        onClose={() => setActivateStaff(null)}
        onConfirm={(reason) =>
          activateStaff && void setStatus(activateStaff.staff, "Active", reason)
        }
      />

      <BulkActionDialog
        open={!!bulkAction}
        action={bulkAction}
        staff={selectedRows}
        branches={visibleBranches}
        busy={busy}
        onClose={() => setBulkAction(null)}
        onConfirm={(payload) => void runBulk(payload)}
      />
    </div>
  );
};
