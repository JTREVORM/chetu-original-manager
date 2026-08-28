/**
 * Roles & Permissions — the matrix, as the database actually holds it.
 *
 * This is not a documentation page that happens to resemble the permission
 * model; it reads `permissions` and `role_permissions`, which are the same rows
 * `private.has_permission()` evaluates inside every RLS policy and the same
 * rows the staff-management server function consults before it acts. Change a
 * cell here and the change is in force at the next request, for everyone
 * holding that role.
 *
 * Only an Administrator can change one, and the policy on `role_permissions`
 * refuses anyone else — so a Loan Officer who reaches this URL sees exactly
 * what a Loan Officer may do, and cannot alter it.
 */
import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { useDatabase } from "../context/DatabaseContext";
import { sendNotification } from "../lib/notify";
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  PERMISSION_LEVELS,
  ROLE_ORDER,
  useMyPermissions,
  usePermissionMatrix,
  type PermissionLevel,
} from "../lib/permissions";
import type { UserRole } from "../types/database.types";
import { TableScroll } from "../components/common/ScrollArea";
import { RoleBadge } from "../components/staff/StaffUi";

/** The cell glyph: a tick, a scope word, or a dash for a denial. */
const LevelCell: React.FC<{ level: PermissionLevel }> = ({ level }) => {
  if (level === "none") {
    return (
      <span
        title={LEVEL_HINT.none}
        className="inline-flex items-center justify-center text-slate-300"
      >
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (level === "full") {
    return (
      <span
        title={LEVEL_HINT.full}
        className="inline-flex items-center justify-center text-emerald-600"
      >
        <Check className="h-4 w-4" />
      </span>
    );
  }
  const tone =
    level === "branch"
      ? "bg-blue-50 text-[#0B4394] ring-blue-200"
      : level === "own"
        ? "bg-slate-100 text-slate-600 ring-slate-200"
        : "bg-amber-50 text-amber-800 ring-amber-200";
  return (
    <span
      title={LEVEL_HINT[level]}
      className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${tone}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
};

export const RolesPermissions: React.FC = () => {
  const { user } = useAuth();
  const { logAudit } = useDatabase();
  const { addToast } = useNotifications();
  const { can } = useMyPermissions();
  const { permissions, categories, levelFor, setLevel, loading, error, reload } =
    usePermissionMatrix();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const canEdit = can("staff.roles");

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: permissions.filter((p) => p.category === category),
      })),
    [categories, permissions],
  );

  const changeLevel = async (role: UserRole, key: string, next: PermissionLevel) => {
    const previous = levelFor(role, key);
    if (previous === next) return;
    const cellId = `${role}:${key}`;
    setSaving(cellId);
    try {
      await setLevel(role, key, next);
      const label = permissions.find((p) => p.key === key)?.label || key;
      addToast("success", "Permission updated", `${role} — ${label} is now ${LEVEL_LABEL[next]}.`);
      await logAudit(
        "Role Permission Changed",
        "Roles & Permissions",
        `${role}: "${label}" changed from ${LEVEL_LABEL[previous]} to ${LEVEL_LABEL[next]}.`,
        key,
      );
      // A change to what a role may do affects everyone holding it, so it is
      // filed for every Administrator rather than left in one person's session.
      await sendNotification({
        title: "Role permissions changed",
        message: `${user?.full_name || "An Administrator"} set "${label}" to ${LEVEL_LABEL[next]} for the ${role} role.`,
        type: "Alert",
        audience: "admins",
        link_url: "/roles-permissions",
        excludeId: user?.id,
        includeActor: true,
      });
    } catch (err) {
      addToast(
        "error",
        "Could not change the permission",
        err instanceof Error ? err.message : "Refused.",
      );
      await reload();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <ShieldCheck className="h-5 w-5 text-[#0B4394]" />
            Roles &amp; Permissions
          </h1>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-slate-500">
            What each role is permitted to do. These are the rows the database itself evaluates on
            every request — not a description of them, and not something the interface can be talked
            out of.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Reload the matrix"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-pressed={editing}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[12px] font-bold transition ${
                editing
                  ? "bg-[#0B4394] text-white hover:bg-[#093672]"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {editing ? "Done editing" : "Edit matrix"}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            You are reading the matrix. Only an Administrator may change it, and the database
            refuses the change for anyone else — reaching this page does not confer the ability.
          </span>
        </div>
      )}

      {editing && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Each cell saves the moment you change it, for every staff member holding that role.
            Narrowing a role can stop work that is in progress; widening one hands out authority
            that the audit trail will attribute to you.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-[13px] font-bold text-red-800">Unable to load the permission model.</p>
          <p className="mt-0.5 text-[12px] text-red-700">{error}</p>
        </div>
      )}

      {/* --------------------------------------------------------- legend --- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Scope</span>
        {PERMISSION_LEVELS.map((level) => (
          <span key={level} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <LevelCell level={level} />
            <span className="font-semibold text-slate-700">{LEVEL_LABEL[level]}</span>
            <span className="hidden text-slate-400 lg:inline">— {LEVEL_HINT[level]}</span>
          </span>
        ))}
      </div>

      {/* --------------------------------------------------------- matrix --- */}
      {loading ? (
        <div className="animate-pulse space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-slate-100" />
          ))}
        </div>
      ) : (
        <TableScroll
          ariaLabel="Permission matrix"
          className="rounded-xl border border-slate-200 bg-white shadow-xs"
        >
          <table className="w-full table-auto text-left text-[12px]">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="min-w-[220px] px-3 py-2.5">Permission</th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} className="whitespace-nowrap px-3 py-2.5 text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.map((group) => (
                <React.Fragment key={group.category}>
                  <tr className="bg-slate-50/70">
                    <td
                      colSpan={ROLE_ORDER.length + 1}
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      {group.category}
                    </td>
                  </tr>
                  {group.items.map((permission) => (
                    <tr key={permission.key} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className="block font-semibold text-slate-900">
                          {permission.label}
                        </span>
                        {permission.description && (
                          <span className="block text-[11px] leading-snug text-slate-500">
                            {permission.description}
                          </span>
                        )}
                      </td>
                      {ROLE_ORDER.map((role) => {
                        const level = levelFor(role, permission.key);
                        const cellId = `${role}:${permission.key}`;
                        return (
                          <td key={role} className="px-3 py-2 text-center">
                            {editing && canEdit ? (
                              <span className="inline-flex items-center gap-1">
                                <select
                                  value={level}
                                  aria-label={`${role} — ${permission.label}`}
                                  onChange={(e) =>
                                    void changeLevel(
                                      role,
                                      permission.key,
                                      e.target.value as PermissionLevel,
                                    )
                                  }
                                  className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px] font-semibold text-slate-700"
                                >
                                  {PERMISSION_LEVELS.map((option) => (
                                    <option key={option} value={option}>
                                      {LEVEL_LABEL[option]}
                                    </option>
                                  ))}
                                </select>
                                {saving === cellId && (
                                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                )}
                              </span>
                            ) : (
                              <LevelCell level={level} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      {/* ----------------------------------------------------- role notes --- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {ROLE_ORDER.map((role) => {
          const held = permissions.filter((p) => levelFor(role, p.key) !== "none");
          return (
            <section key={role} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <RoleBadge role={role} />
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                {role === "Administrator" &&
                  "Runs the institution: every branch, every record, staff and roles, system configuration and the audit trail."}
                {role === "Branch Manager" &&
                  "Runs one or more branches: opens the business day, approves officer submissions, reviews branch work, and looks after the Loan Officers attached there."}
                {role === "Loan Officer" &&
                  "Works a portfolio inside an open business day: registers members, takes applications, receipts collections and savings — and only for the records they hold."}
                {role === "Auditor" &&
                  "Reads the institution and writes nothing. Every write policy in the database denies this role outright, independently of the matrix above."}
              </p>
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                {held.length} of {permissions.length} permissions
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
};
