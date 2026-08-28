/**
 * One staff member, opened from the register.
 *
 * Clicking a row shows the account rather than a form: what the person holds,
 * where they work, whether they can sign in, and — for a Loan Officer — where
 * they stand in today's business day. Editing is a deliberate second step, so
 * a glance at somebody's record can never turn into an accidental change.
 *
 * The Business Day panel is the reason this drawer exists in this system
 * rather than a generic one. An officer's ability to work is the product of
 * two states, the branch's day and their own, and stating either alone is
 * misleading: an OPEN branch day with a SUBMITTED officer day means they are
 * finished, not that they may keep working.
 */
import React, { useState } from "react";
import {
  Ban,
  Building2,
  CalendarDays,
  FileClock,
  Fingerprint,
  History,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Power,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { Avatar } from "../common/Avatar";
import type { Branch } from "../../types/database.types";
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  type PermissionDefinition,
  type PermissionLevel,
} from "../../lib/permissions";
import type { StaffDirectoryRow } from "./useStaffRegister";
import { StaffActivityTimeline } from "./StaffActivityTimeline";
import {
  DayBadge,
  DetailRow,
  DrawerSection,
  NoticeBar,
  RoleBadge,
  StatusBadge,
  loginStamp,
  relativeTime,
  shortDate,
} from "./StaffUi";

type Tab = "profile" | "activity" | "audit";

/**
 * The sentence under the Business Day panel: what the two statuses together
 * actually mean for whether this officer can transact right now.
 */
const dayNarrative = (
  staff: StaffDirectoryRow,
): { tone: "amber" | "blue" | "red" | "slate"; text: string } => {
  const day = staff.business_day_status;
  const officer = staff.officer_day_status;

  if (!day || day === "NOT_OPENED") {
    return {
      tone: "amber",
      text: "Business day has not been opened by the Branch Manager or an Administrator, so no work can be recorded at this branch today.",
    };
  }
  if (day === "CLOSED" || day === "APPROVED" || day === "LOCKED") {
    return {
      tone: "slate",
      text: `The branch day is ${day.toLowerCase()}. Nothing further can be posted against today.`,
    };
  }
  if (officer === "SUBMITTED" || officer === "PENDING_APPROVAL") {
    return {
      tone: "amber",
      text: "This Loan Officer has submitted their day and is awaiting manager approval. They cannot record further transactions until it is decided.",
    };
  }
  if (officer === "REJECTED") {
    return {
      tone: "red",
      text: `Their submission was returned${staff.officer_day_rejection_reason ? `: ${staff.officer_day_rejection_reason}` : ""}. They must correct it and submit again.`,
    };
  }
  if (officer === "APPROVED") {
    return {
      tone: "blue",
      text: "Their day has been approved and closed. Today's work is settled.",
    };
  }
  if (officer === "SPECIAL_ACCESS") {
    return {
      tone: "amber",
      text: "Working under a time-boxed special access grant, outside the normal business day.",
    };
  }
  if (officer === "ACTIVE") {
    return {
      tone: "blue",
      text: "The branch day is open and their working day is running — they may transact now.",
    };
  }
  return {
    tone: "slate",
    text: "The branch day is open but this officer has not started their working day yet.",
  };
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ active, onClick, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-bold transition ${
      active ? "bg-white text-[#0B4394] shadow-xs" : "text-slate-600 hover:text-slate-900"
    }`}
  >
    <Icon className="h-3.5 w-3.5" />
    {children}
  </button>
);

export const StaffProfileDrawer: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  branches: Branch[];
  permissions: PermissionDefinition[];
  /** The permission level this staff member's role holds, per permission key. */
  levelFor: (key: string) => PermissionLevel;
  canManage: boolean;
  isSelf: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onEdit: () => void;
  onResetPassword: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}> = ({
  open,
  staff,
  branches,
  permissions,
  levelFor,
  canManage,
  isSelf,
  initialTab = "profile",
  onClose,
  onEdit,
  onResetPassword,
  onSuspend,
  onReinstate,
  onDeactivate,
  onActivate,
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);

  // A newly opened drawer always answers the question that opened it.
  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, staff?.id]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !staff) return null;

  const login = loginStamp(staff.last_login_at);
  const attached = branches.filter((b) => (staff.branch_ids || []).includes(b.id));
  const narrative = dayNarrative(staff);
  const granted = permissions.filter((p) => levelFor(p.key) !== "none");
  const denied = permissions.filter((p) => levelFor(p.key) === "none");

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 lg:bg-slate-900/20"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Staff profile for ${staff.full_name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-slate-50 shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Staff Profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* ------------------------------------------------- identity --- */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <Avatar
                src={staff.avatar_url}
                name={staff.full_name}
                className="h-14 w-14 shrink-0 rounded-xl ring-2 ring-slate-100"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-slate-900">{staff.full_name}</h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  {staff.staff_code || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={staff.status} />
                  <RoleBadge role={staff.role} />
                  {isSelf && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
                      Current session
                    </span>
                  )}
                </div>
              </div>
            </div>

            {staff.status_reason && staff.status !== "Active" && (
              <div className="mt-3">
                <NoticeBar tone={staff.status === "Suspended" ? "red" : "slate"}>
                  <strong className="block">{staff.status} — recorded reason</strong>
                  {staff.status_reason}
                  {staff.status_changed_at && (
                    <span className="mt-0.5 block text-[11px] opacity-80">
                      {shortDate(staff.status_changed_at)}
                    </span>
                  )}
                </NoticeBar>
              </div>
            )}
          </section>

          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <TabButton active={tab === "profile"} onClick={() => setTab("profile")} icon={UserCog}>
              Profile
            </TabButton>
            <TabButton
              active={tab === "activity"}
              onClick={() => setTab("activity")}
              icon={History}
            >
              Activity
            </TabButton>
            <TabButton active={tab === "audit"} onClick={() => setTab("audit")} icon={FileClock}>
              Audit
            </TabButton>
          </div>

          {tab === "profile" && (
            <>
              <DrawerSection title="Personal Information">
                <DetailRow icon={Phone} label="Phone" value={staff.phone_number || "—"} />
                <DetailRow icon={Mail} label="Email" value={staff.email || "—"} />
              </DrawerSection>

              <DrawerSection title="Employment">
                <DetailRow icon={UserCog} label="Role" value={<RoleBadge role={staff.role} />} />
                <DetailRow
                  icon={Building2}
                  label="Primary Branch"
                  value={
                    staff.primary_branch_name
                      ? `${staff.primary_branch_name}${staff.primary_branch_code ? ` (${staff.primary_branch_code})` : ""}`
                      : "Institution-wide"
                  }
                />
                <DetailRow
                  icon={Building2}
                  label="Assigned Branches"
                  value={
                    attached.length === 0
                      ? staff.role === "Administrator" || staff.role === "Auditor"
                        ? "Every branch"
                        : "None attached"
                      : attached.map((b) => b.branch_name).join(", ")
                  }
                />
                <DetailRow
                  icon={CalendarDays}
                  label="Date Joined"
                  value={shortDate(staff.date_joined)}
                />
              </DrawerSection>

              <DrawerSection title="Security">
                <DetailRow
                  icon={ShieldCheck}
                  label="Account Status"
                  value={<StatusBadge status={staff.status} />}
                />
                <DetailRow
                  icon={Fingerprint}
                  label="Last Login"
                  value={
                    <span>
                      {login.primary}
                      {login.secondary && (
                        <span className="ml-1 font-normal text-slate-400">({login.secondary})</span>
                      )}
                    </span>
                  }
                />
                <DetailRow
                  icon={KeyRound}
                  label="Last Password Change"
                  value={
                    staff.last_password_change_at
                      ? `${shortDate(staff.last_password_change_at)} (${relativeTime(staff.last_password_change_at)})`
                      : "Never recorded"
                  }
                />
                <DetailRow
                  icon={ShieldAlert}
                  label="Failed Login Attempts"
                  value={
                    <span
                      className={(staff.failed_login_attempts || 0) >= 3 ? "text-chetu-red" : ""}
                    >
                      {staff.failed_login_attempts || 0}
                      {(staff.failed_login_attempts || 0) >= 3 && " — review"}
                    </span>
                  }
                />
                <DetailRow
                  icon={ShieldCheck}
                  label="Two-Factor"
                  value={
                    staff.two_factor_enabled ? (
                      "Enabled"
                    ) : (
                      <span className="text-slate-400">Not enabled</span>
                    )
                  }
                />
                <DetailRow
                  icon={KeyRound}
                  label="Password Change Required"
                  value={
                    staff.must_change_password ? (
                      "Yes — at next sign-in"
                    ) : (
                      <span className="text-slate-400">No</span>
                    )
                  }
                />
              </DrawerSection>

              {/* --------------------------------------- business day --- */}
              {staff.role === "Loan Officer" ? (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <header className="border-b border-emerald-200/70 px-3.5 py-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                      Business Day Access
                    </h3>
                  </header>
                  <div className="px-3.5 py-1.5">
                    <DetailRow
                      label="Business Day"
                      value={shortDate(staff.business_date || new Date().toISOString())}
                    />
                    <DetailRow label="Branch" value={staff.primary_branch_name || "Not attached"} />
                    <DetailRow
                      label="Business Day Status"
                      value={<DayBadge status={staff.business_day_status || "NOT_OPENED"} />}
                    />
                    <DetailRow
                      label="Officer Day Status"
                      value={<DayBadge status={staff.officer_day_status || "LOCKED"} />}
                    />
                    <DetailRow
                      label="Day Submission"
                      value={
                        staff.officer_day_submitted_at ? (
                          <DayBadge status={staff.officer_day_status || "SUBMITTED"} />
                        ) : (
                          <span className="text-slate-400">Not submitted</span>
                        )
                      }
                    />
                  </div>
                  <div className="px-3.5 pb-3">
                    <NoticeBar tone={narrative.tone}>{narrative.text}</NoticeBar>
                  </div>
                </section>
              ) : (
                <DrawerSection title="Business Day Access">
                  <p className="py-2 text-[12px] leading-relaxed text-slate-500">
                    {staff.role === "Branch Manager"
                      ? "A Branch Manager opens and closes the business day rather than working inside one, so no officer day is kept for this account."
                      : `${staff.role}s work across the institution and are not governed by a branch business day.`}
                  </p>
                </DrawerSection>
              )}

              {/* ---------------------------------------- permissions --- */}
              <DrawerSection
                title="Permissions"
                right={
                  <span className="text-[10px] font-semibold text-slate-400">
                    From the {staff.role} role
                  </span>
                }
              >
                <div className="space-y-1 py-2">
                  {granted.map((permission) => {
                    const level = levelFor(permission.key);
                    return (
                      <div key={permission.key} className="flex items-start justify-between gap-2">
                        <span className="inline-flex min-w-0 items-start gap-1.5 text-[12px] text-slate-700">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="min-w-0">{permission.label}</span>
                        </span>
                        <span
                          title={LEVEL_HINT[level]}
                          className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600"
                        >
                          {LEVEL_LABEL[level]}
                        </span>
                      </div>
                    );
                  })}
                  {denied.length > 0 && (
                    <details className="mt-2 border-t border-slate-100 pt-2">
                      <summary className="cursor-pointer text-[11px] font-bold text-slate-500">
                        Cannot do ({denied.length})
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {denied.map((permission) => (
                          <p
                            key={permission.key}
                            className="inline-flex w-full items-start gap-1.5 text-[12px] text-slate-400"
                          >
                            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {permission.label}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </DrawerSection>
            </>
          )}

          {tab === "activity" && (
            <section className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                Every action {staff.full_name.split(" ")[0]} has filed, newest first, drawn from the
                system's own records.
              </p>
              <StaffActivityTimeline
                staffId={staff.id}
                mode="activity"
                staffName={staff.full_name}
              />
            </section>
          )}

          {tab === "audit" && (
            <section className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                Changes made to this account — role, status, branch and password — with the previous
                and new value, the reason given, and who performed it. These entries cannot be
                edited by anyone.
              </p>
              <StaffActivityTimeline staffId={staff.id} mode="audit" staffName={staff.full_name} />
            </section>
          )}
        </div>

        {/* ------------------------------------------------------ actions --- */}
        {canManage && !isSelf && (
          <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#0B4394] px-3 text-[12px] font-bold text-[#0B4394] transition hover:bg-blue-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Staff
              </button>
              <button
                type="button"
                onClick={onResetPassword}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <KeyRound className="h-3.5 w-3.5" /> Reset Password
              </button>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50/50 p-2">
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-chetu-red">
                Danger zone
              </p>
              <div className="grid grid-cols-2 gap-2">
                {staff.status === "Suspended" ? (
                  <button
                    type="button"
                    onClick={onReinstate}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Lift Suspension
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSuspend}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-[12px] font-bold text-amber-700 transition hover:bg-amber-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </button>
                )}
                {staff.status === "Inactive" ? (
                  <button
                    type="button"
                    onClick={onActivate}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <Power className="h-3.5 w-3.5" /> Reactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onDeactivate}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-[12px] font-bold text-chetu-red transition hover:bg-red-50"
                  >
                    <Power className="h-3.5 w-3.5" /> Deactivate
                  </button>
                )}
              </div>
            </div>
          </footer>
        )}

        {isSelf && (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              This is your own account. Its role and status can only be changed by another
              Administrator — the database refuses the change even if it is attempted directly.
            </p>
          </footer>
        )}
      </aside>
    </>
  );
};
