/**
 * Editing an existing staff account.
 *
 * Not the wizard: the account already exists, and stepping through five screens
 * to correct a phone number would be an obstacle rather than a safeguard. What
 * the wizard's ceremony protected — the password — is not here at all; it has
 * its own dialog, because a password reset is a different act from an edit.
 *
 * The staff number is shown and not editable. It is the printed identity of the
 * account, and the database refuses to change it even if this form tried.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Save, X } from "lucide-react";
import { Avatar } from "../common/Avatar";
import type { Branch, StaffStatus, UserRole } from "../../types/database.types";
import { GhostButton, PrimaryButton, STAFF_ROLES, isBranchScopedRole } from "./StaffUi";
import type { StaffDirectoryRow } from "./useStaffRegister";
import { readAvatarFile } from "./avatar";

export interface StaffEdit {
  full_name: string;
  phone_number: string;
  email: string;
  avatar_url: string;
  role: UserRole;
  branch_ids: string[];
  primary_branch_id: string;
  date_joined: string;
  status: StaffStatus;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^07\d{8}$/;

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, error, children }) => (
  <div>
    <label className="form-label">
      {label} {required && <span className="text-chetu-red">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-[11px] font-semibold text-chetu-red">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    ) : null}
  </div>
);

export const EditStaffModal: React.FC<{
  open: boolean;
  staff: StaffDirectoryRow | null;
  branches: Branch[];
  /** A Branch Manager cannot promote anyone, so the role select locks for them. */
  canChangeRole: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (edit: StaffEdit) => Promise<void>;
}> = ({ open, staff, branches, canChangeRole, submitting, onClose, onSubmit }) => {
  const [edit, setEdit] = useState<StaffEdit | null>(null);
  const [touched, setTouched] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    if (open && staff) {
      setEdit({
        full_name: staff.full_name,
        phone_number: staff.phone_number || "",
        email: staff.email || "",
        avatar_url: staff.avatar_url || "",
        role: staff.role,
        branch_ids: staff.branch_ids || [],
        primary_branch_id: staff.primary_branch_id || (staff.branch_ids || [])[0] || "",
        date_joined: staff.date_joined || "",
        status: staff.status,
      });
      setTouched(false);
      setAvatarError("");
    }
  }, [open, staff]);

  const errors = useMemo(() => {
    const found: Partial<Record<keyof StaffEdit, string>> = {};
    if (!edit) return found;
    if (!edit.full_name.trim()) found.full_name = "A name is required.";
    if (!PHONE_PATTERN.test(edit.phone_number.trim()))
      found.phone_number = "Ten digits starting with 07.";
    if (!EMAIL_PATTERN.test(edit.email.trim()))
      found.email = "A valid address — it is the sign-in credential.";
    if (isBranchScopedRole(edit.role) && edit.branch_ids.length === 0) {
      found.branch_ids = `A ${edit.role} must be attached to at least one branch.`;
    }
    return found;
  }, [edit]);

  if (!open || !staff || !edit) return null;

  const set = <K extends keyof StaffEdit>(key: K, value: StaffEdit[K]) =>
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));

  const branchScoped = isBranchScopedRole(edit.role);

  const toggleBranch = (id: string) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const next = prev.branch_ids.includes(id)
        ? prev.branch_ids.filter((b) => b !== id)
        : [...prev.branch_ids, id];
      return {
        ...prev,
        branch_ids: next,
        primary_branch_id: next.includes(prev.primary_branch_id)
          ? prev.primary_branch_id
          : next[0] || "",
      };
    });
  };

  const handleAvatar = async (file?: File) => {
    if (!file) return;
    setAvatarError("");
    try {
      set("avatar_url", await readAvatarFile(file));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "That image could not be read.");
    }
  };

  const valid = Object.keys(errors).length === 0;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.branch_name || "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-2 sm:p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">Edit {staff.full_name}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">{staff.staff_code || "—"}</p>
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={edit.avatar_url}
              name={edit.full_name}
              className="h-14 w-14 rounded-xl ring-2 ring-slate-100"
            />
            <div>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50">
                <Camera className="h-3.5 w-3.5" />
                {edit.avatar_url ? "Change photo" : "Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleAvatar(e.target.files?.[0])}
                />
              </label>
              {edit.avatar_url && (
                <button
                  type="button"
                  onClick={() => set("avatar_url", "")}
                  className="ml-2 text-[11px] font-bold text-slate-500 hover:text-chetu-red"
                >
                  Remove
                </button>
              )}
              {avatarError && (
                <p className="mt-1 text-[11px] font-semibold text-chetu-red">{avatarError}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full Name" required error={touched ? errors.full_name : undefined}>
              <input
                className="form-field"
                value={edit.full_name}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </Field>
            <Field
              label="Staff ID"
              hint="Allocated by the system and fixed for the life of the account."
            >
              <input className="form-field bg-slate-100" readOnly value={staff.staff_code || "—"} />
            </Field>
            <Field label="Phone Number" required error={touched ? errors.phone_number : undefined}>
              <input
                className="form-field"
                value={edit.phone_number}
                onChange={(e) => set("phone_number", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Email Address"
              required
              error={touched ? errors.email : undefined}
              hint="Changing this changes how they sign in."
            >
              <input
                className="form-field"
                type="email"
                value={edit.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field
              label="Role"
              required
              hint={
                canChangeRole
                  ? "Changes every permission this account carries."
                  : "Only an Administrator may change a role."
              }
            >
              <select
                className="form-field disabled:bg-slate-100"
                disabled={!canChangeRole}
                value={edit.role}
                onChange={(e) => {
                  const role = e.target.value as UserRole;
                  setEdit((prev) =>
                    prev
                      ? {
                          ...prev,
                          role,
                          branch_ids: isBranchScopedRole(role) ? prev.branch_ids : [],
                          primary_branch_id: isBranchScopedRole(role) ? prev.primary_branch_id : "",
                        }
                      : prev,
                  );
                }}
              >
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date Joined">
              <input
                className="form-field"
                type="date"
                value={edit.date_joined || ""}
                onChange={(e) => set("date_joined", e.target.value)}
              />
            </Field>
          </div>

          {branchScoped && (
            <>
              <Field
                label="Branch Attachment"
                required
                error={touched ? errors.branch_ids : undefined}
              >
                <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                  {branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={edit.branch_ids.includes(branch.id)}
                        onChange={() => toggleBranch(branch.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B4394]"
                      />
                      <span className="min-w-0 truncate font-semibold text-slate-800">
                        {branch.branch_name}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {branch.branch_code}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              {edit.branch_ids.length > 1 && (
                <Field
                  label="Primary Branch"
                  hint="The branch whose business day governs this account."
                >
                  <select
                    className="form-field"
                    value={edit.primary_branch_id}
                    onChange={(e) => set("primary_branch_id", e.target.value)}
                  >
                    {edit.branch_ids.map((id) => (
                      <option key={id} value={id}>
                        {branchName(id)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
            Account status is not changed here. Suspending, deactivating or reinstating someone is a
            decision that needs its own confirmation and, for a suspension, a stated reason — those
            live in the profile drawer.
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end">
          <GhostButton type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </GhostButton>
          <PrimaryButton
            type="button"
            disabled={submitting}
            onClick={() => {
              setTouched(true);
              if (valid) void onSubmit(edit);
            }}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {submitting ? "Saving…" : "Save Changes"}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
};
