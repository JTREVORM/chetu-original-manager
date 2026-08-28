/**
 * Confirmations for the actions that change someone's access.
 *
 * None of these is a browser `confirm()`. Each one names the person, states in
 * plain words what will happen to them, and — where the action is a judgement
 * rather than a correction — insists on a reason, which is filed on the audit
 * row rather than left in somebody's memory.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Eye,
  EyeOff,
  KeyRound,
  Power,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Branch } from "../../types/database.types";
import type { StaffDirectoryRow } from "./useStaffRegister";
import { GhostButton, PrimaryButton, RoleBadge, StatusBadge } from "./StaffUi";

/** The shell every confirmation shares: an icon, a claim, a body, two choices. */
const ConfirmShell: React.FC<{
  open: boolean;
  onClose: () => void;
  icon: React.ElementType;
  tone: "red" | "amber" | "emerald" | "navy";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmTone: "red" | "amber" | "emerald" | "navy";
  onConfirm: () => void;
  confirmDisabled?: boolean;
  busy?: boolean;
}> = ({
  open,
  onClose,
  icon: Icon,
  tone,
  title,
  subtitle,
  children,
  confirmLabel,
  confirmTone,
  onConfirm,
  confirmDisabled,
  busy,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, busy]);

  if (!open) return null;

  const tones = {
    red: "bg-red-50 text-chetu-red",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    navy: "bg-blue-50 text-[#0B4394]",
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end">
          <GhostButton type="button" onClick={onClose} disabled={busy}>
            Cancel
          </GhostButton>
          <PrimaryButton
            type="button"
            tone={confirmTone}
            onClick={onConfirm}
            disabled={confirmDisabled || busy}
          >
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
};

/** The person the dialog is about, so nobody acts on the wrong row. */
const SubjectCard: React.FC<{ staff: StaffDirectoryRow }> = ({ staff }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
    <span className="text-[13px] font-bold text-slate-900">{staff.full_name}</span>
    <span className="text-[11px] font-semibold text-slate-400">{staff.staff_code || "—"}</span>
    <RoleBadge role={staff.role} />
    <StatusBadge status={staff.status} />
  </div>
);

export const SuspendStaffDialog: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ open, staff, busy, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  if (!staff) return null;

  return (
    <ConfirmShell
      open={open}
      onClose={onClose}
      icon={Ban}
      tone="amber"
      title="Suspend Staff Account?"
      subtitle="Access stops immediately and can be restored later"
      confirmLabel="Suspend Account"
      confirmTone="amber"
      confirmDisabled={!reason.trim()}
      busy={busy}
      onConfirm={() => {
        setTouched(true);
        if (reason.trim()) onConfirm(reason.trim());
      }}
    >
      <SubjectCard staff={staff} />
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
        <strong>{staff.full_name}</strong> will not be able to sign in while the suspension stands,
        and every permission their role carries stops applying. Work they have already recorded is
        untouched and stays in the reports.
      </p>
      {staff.role === "Loan Officer" &&
        staff.officer_day_status &&
        staff.officer_day_status !== "LOCKED" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
            Their working day is currently{" "}
            <strong>{staff.officer_day_status.replace(/_/g, " ")}</strong>. Suspending now leaves
            that day unfinished for a manager to resolve.
          </div>
        )}

      <div className="mt-4">
        <label htmlFor="suspend_reason" className="form-label">
          Why are you suspending this account? <span className="text-chetu-red">*</span>
        </label>
        <textarea
          id="suspend_reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Cash difference of UGX 240,000 under investigation at Buyende."
          className="form-field resize-none"
        />
        {touched && !reason.trim() && (
          <p className="mt-1 text-[11px] font-semibold text-chetu-red">
            A suspension must state its reason.
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500">
          This reason is written to the audit trail and cannot be edited afterwards.
        </p>
      </div>
    </ConfirmShell>
  );
};

export const DeactivateStaffDialog: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ open, staff, busy, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!staff) return null;

  return (
    <ConfirmShell
      open={open}
      onClose={onClose}
      icon={Power}
      tone="red"
      title="Deactivate Staff Account?"
      subtitle={staff.staff_code || undefined}
      confirmLabel="Deactivate Account"
      confirmTone="red"
      busy={busy}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <SubjectCard staff={staff} />
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
        <strong>{staff.full_name}</strong> will no longer be able to sign in to the system. The
        account is closed rather than deleted: their clients, groups, loans and receipts stay
        exactly as they are and remain available in every report.
      </p>
      {staff.role === "Branch Manager" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          This is a Branch Manager. Their branch will have nobody to open the business day or
          approve officer submissions until another manager is appointed.
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="deactivate_reason" className="form-label">
          Reason{" "}
          <span className="font-normal text-slate-400">
            (optional, recorded in the audit trail)
          </span>
        </label>
        <textarea
          id="deactivate_reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Resigned with effect from 31 August 2026."
          className="form-field resize-none"
        />
      </div>
    </ConfirmShell>
  );
};

export const ActivateStaffDialog: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  /** A lifted suspension and a reactivated account read differently. */
  mode: "reinstate" | "activate";
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ open, staff, mode, busy, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!staff) return null;

  return (
    <ConfirmShell
      open={open}
      onClose={onClose}
      icon={ShieldCheck}
      tone="emerald"
      title={mode === "reinstate" ? "Lift This Suspension?" : "Reactivate Staff Account?"}
      subtitle={staff.staff_code || undefined}
      confirmLabel={mode === "reinstate" ? "Lift Suspension" : "Reactivate Account"}
      confirmTone="emerald"
      busy={busy}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <SubjectCard staff={staff} />
      {staff.status_reason && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Recorded reason
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">{staff.status_reason}</p>
        </div>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
        <strong>{staff.full_name}</strong> will be able to sign in again as{" "}
        {staff.role === "Administrator" ? "an" : "a"} <strong>{staff.role}</strong>, with every
        permission that role carries.
      </p>

      <div className="mt-4">
        <label htmlFor="activate_reason" className="form-label">
          Note{" "}
          <span className="font-normal text-slate-400">
            (optional, recorded in the audit trail)
          </span>
        </label>
        <textarea
          id="activate_reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Investigation closed, no case to answer."
          className="form-field resize-none"
        />
      </div>
    </ConfirmShell>
  );
};

/** Generates a password that satisfies the rules without anyone inventing one. */
const suggestPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(12))
      : Array.from({ length: 12 }, () => Math.floor(Math.random() * 4294967296));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("") + "#1";
};

export const ResetPasswordDialog: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (password: string, mustChange: boolean) => void;
}> = ({ open, staff, busy, onClose, onConfirm }) => {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [mustChange, setMustChange] = useState(true);

  useEffect(() => {
    if (open) {
      setPassword("");
      setVisible(false);
      setMustChange(true);
    }
  }, [open]);

  if (!staff) return null;

  const tooShort = password.length > 0 && password.length < 8;

  return (
    <ConfirmShell
      open={open}
      onClose={onClose}
      icon={KeyRound}
      tone="navy"
      title="Reset Password"
      subtitle={`${staff.full_name} · ${staff.staff_code || "—"}`}
      confirmLabel="Reset Password"
      confirmTone="navy"
      confirmDisabled={password.length < 8}
      busy={busy}
      onConfirm={() => onConfirm(password, mustChange)}
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] leading-relaxed text-[#0B4394]">
        The existing password cannot be read by anyone, including an Administrator — it is stored
        only as a hash. This sets a new one, which you then hand to {staff.full_name.split(" ")[0]}{" "}
        yourself.
      </div>

      <div className="mt-4">
        <label htmlFor="reset_password" className="form-label">
          New password <span className="text-chetu-red">*</span>
        </label>
        <div className="relative">
          <input
            id="reset_password"
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="form-field pr-20"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {tooShort && (
          <p className="mt-1 text-[11px] font-semibold text-chetu-red">
            Use at least 8 characters.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setPassword(suggestPassword());
            setVisible(true);
          }}
          className="mt-2 text-[11px] font-bold text-[#0B4394] hover:underline"
        >
          Generate a strong password
        </button>
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5">
        <input
          type="checkbox"
          checked={mustChange}
          onChange={(e) => setMustChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0B4394]"
        />
        <span className="text-[12px] leading-relaxed text-slate-700">
          <strong className="block text-slate-900">
            Require a password change at next sign-in
          </strong>
          So the password you hand over is not the one they keep using.
        </span>
      </label>
    </ConfirmShell>
  );
};

export type BulkAction = "Activate" | "Deactivate" | "Suspend" | "AssignBranch";

export const BulkActionDialog: React.FC<{
  open: boolean;
  action: BulkAction | null;
  staff: StaffDirectoryRow[];
  branches: Branch[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; branchIds: string[] }) => void;
}> = ({ open, action, staff, branches, busy, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setReason("");
      setBranchIds([]);
    }
  }, [open]);

  const config = useMemo(() => {
    switch (action) {
      case "Suspend":
        return {
          title: "Suspend Selected Accounts?",
          icon: Ban,
          tone: "amber" as const,
          label: "Suspend Accounts",
          requiresReason: true,
        };
      case "Deactivate":
        return {
          title: "Deactivate Selected Accounts?",
          icon: Power,
          tone: "red" as const,
          label: "Deactivate Accounts",
          requiresReason: false,
        };
      case "Activate":
        return {
          title: "Activate Selected Accounts?",
          icon: ShieldCheck,
          tone: "emerald" as const,
          label: "Activate Accounts",
          requiresReason: false,
        };
      default:
        return {
          title: "Assign Selected Staff To A Branch",
          icon: AlertTriangle,
          tone: "navy" as const,
          label: "Assign Branch",
          requiresReason: false,
        };
    }
  }, [action]);

  if (!action) return null;

  const blocked = action === "AssignBranch" && branchIds.length === 0;

  return (
    <ConfirmShell
      open={open}
      onClose={onClose}
      icon={config.icon}
      tone={config.tone}
      title={config.title}
      subtitle={`${staff.length} staff member${staff.length === 1 ? "" : "s"} selected`}
      confirmLabel={config.label}
      confirmTone={config.tone}
      confirmDisabled={(config.requiresReason && !reason.trim()) || blocked}
      busy={busy}
      onConfirm={() => onConfirm({ reason: reason.trim(), branchIds })}
    >
      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        {staff.map((person) => (
          <li key={person.id} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-semibold text-slate-800">{person.full_name}</span>
            <span className="shrink-0 text-[10px] font-semibold text-slate-400">
              {person.staff_code || "—"}
            </span>
          </li>
        ))}
      </ul>

      {action === "AssignBranch" ? (
        <div className="mt-4">
          <p className="form-label">
            Branches to attach <span className="text-chetu-red">*</span>
          </p>
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {branches.map((branch) => (
              <label
                key={branch.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-[12px]"
              >
                <input
                  type="checkbox"
                  checked={branchIds.includes(branch.id)}
                  onChange={() =>
                    setBranchIds((prev) =>
                      prev.includes(branch.id)
                        ? prev.filter((b) => b !== branch.id)
                        : [...prev, branch.id],
                    )
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B4394]"
                />
                <span className="min-w-0 truncate font-semibold text-slate-800">
                  {branch.branch_name}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            The first branch selected becomes each person's primary branch — the one whose business
            day governs them.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="bulk_reason" className="form-label">
            Reason{" "}
            {config.requiresReason ? (
              <span className="text-chetu-red">*</span>
            ) : (
              <span className="font-normal text-slate-400">(optional)</span>
            )}
          </label>
          <textarea
            id="bulk_reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded against every account in this action."
            className="form-field resize-none"
          />
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Each account is checked separately. Any the database refuses — your own account, or someone
        outside the branches you manage — is reported back and left unchanged.
      </p>
    </ConfirmShell>
  );
};
