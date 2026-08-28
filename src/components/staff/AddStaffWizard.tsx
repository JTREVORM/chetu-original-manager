/**
 * Creating a staff account, in five deliberate steps.
 *
 * A staff account is a set of keys to a lending institution's records, not a
 * row in a table, so it is not created from a single form of eleven fields
 * where the role select sits between the phone number and the password. Each
 * step asks one kind of question, the permissions the chosen role carries are
 * shown before the account exists rather than discovered afterwards, and the
 * last step restates the whole thing so the person creating it can see what
 * they are about to hand over.
 *
 * The staff number is not asked for: it is allocated by a database trigger, in
 * sequence, from a counter no policy filters.
 */
import React, { useMemo, useState } from "react";
import {
  Ban,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { Avatar } from "../common/Avatar";
import type { Branch, UserRole } from "../../types/database.types";
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  type PermissionDefinition,
  type PermissionLevel,
} from "../../lib/permissions";
import { GhostButton, PrimaryButton, RoleBadge, STAFF_ROLES, isBranchScopedRole } from "./StaffUi";
import { readAvatarFile } from "./avatar";

export interface NewStaffDraft {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  avatar_url: string;
  role: UserRole;
  branch_ids: string[];
  primary_branch_id: string;
  date_joined: string;
  status: "Active" | "Pending";
  password: string;
  must_change_password: boolean;
}

const EMPTY_DRAFT: NewStaffDraft = {
  first_name: "",
  last_name: "",
  phone_number: "",
  email: "",
  avatar_url: "",
  role: "Loan Officer",
  branch_ids: [],
  primary_branch_id: "",
  date_joined: new Date().toISOString().split("T")[0],
  status: "Pending",
  password: "",
  must_change_password: true,
};

const STEPS = ["Personal", "Employment", "Permissions", "Account", "Review"] as const;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^07\d{8}$/;

const generatePassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(12))
      : Array.from({ length: 12 }, () => Math.floor(Math.random() * 4294967296));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("") + "#1";
};

const Stepper: React.FC<{ step: number }> = ({ step }) => (
  <ol className="flex items-center gap-1 overflow-x-auto px-4 py-2.5">
    {STEPS.map((label, index) => {
      const state = index < step ? "done" : index === step ? "current" : "todo";
      return (
        <li key={label} className="flex shrink-0 items-center gap-1">
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
              state === "done"
                ? "bg-emerald-500 text-white"
                : state === "current"
                  ? "bg-[#0B4394] text-white"
                  : "bg-slate-200 text-slate-500"
            }`}
          >
            {state === "done" ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span
            className={`text-[11px] font-bold ${state === "todo" ? "text-slate-400" : "text-slate-800"}`}
          >
            {label}
          </span>
          {index < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-slate-200 sm:w-6" />}
        </li>
      );
    })}
  </ol>
);

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, hint, error, children, className = "" }) => (
  <div className={className}>
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

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
    <span className="shrink-0 text-[11px] font-semibold text-slate-500">{label}</span>
    <span className="min-w-0 break-words text-right text-[12px] font-semibold text-slate-900">
      {value}
    </span>
  </div>
);

export const AddStaffWizard: React.FC<{
  open: boolean;
  branches: Branch[];
  permissions: PermissionDefinition[];
  levelFor: (role: UserRole, key: string) => PermissionLevel;
  /** A Branch Manager may only create Loan Officers, inside their own branches. */
  allowedRoles?: UserRole[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (draft: NewStaffDraft) => Promise<void>;
}> = ({
  open,
  branches,
  permissions,
  levelFor,
  allowedRoles = STAFF_ROLES,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<NewStaffDraft>({
    ...EMPTY_DRAFT,
    role: allowedRoles[0] || "Loan Officer",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [touched, setTouched] = useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setDraft({ ...EMPTY_DRAFT, role: allowedRoles[0] || "Loan Officer" });
      setShowPassword(false);
      setAvatarError("");
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof NewStaffDraft>(key: K, value: NewStaffDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const branchScoped = isBranchScopedRole(draft.role);
  const fullName = `${draft.first_name.trim()} ${draft.last_name.trim()}`.trim();

  const errors = useMemo(() => {
    const found: Partial<Record<keyof NewStaffDraft | "name", string>> = {};
    if (!draft.first_name.trim()) found.first_name = "A first name is required.";
    if (!draft.last_name.trim()) found.last_name = "A surname is required.";
    if (!PHONE_PATTERN.test(draft.phone_number.trim())) {
      found.phone_number = "Ten digits starting with 07, e.g. 0772123456.";
    }
    if (!EMAIL_PATTERN.test(draft.email.trim())) {
      found.email = "A valid address — it is what this person signs in with.";
    }
    if (branchScoped && draft.branch_ids.length === 0) {
      found.branch_ids = `A ${draft.role} must be attached to at least one branch.`;
    }
    if (draft.password.length < 8) found.password = "At least 8 characters.";
    return found;
  }, [draft, branchScoped]);

  const stepValid = (index: number) => {
    if (index === 0)
      return !errors.first_name && !errors.last_name && !errors.phone_number && !errors.email;
    if (index === 1) return !errors.branch_ids;
    if (index === 3) return !errors.password;
    return true;
  };

  const canSubmit = Object.keys(errors).length === 0;

  if (!open) return null;

  const toggleBranch = (id: string) => {
    setDraft((prev) => {
      const next = prev.branch_ids.includes(id)
        ? prev.branch_ids.filter((b) => b !== id)
        : [...prev.branch_ids, id];
      return {
        ...prev,
        branch_ids: next,
        // The primary branch has to stay one of the attached ones.
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

  const granted = permissions.filter((p) => levelFor(draft.role, p.key) !== "none");
  const denied = permissions.filter((p) => levelFor(draft.role, p.key) === "none");
  const branchName = (id: string) => branches.find((b) => b.id === id)?.branch_name || "—";

  const next = () => {
    setTouched(true);
    if (stepValid(step)) {
      setTouched(false);
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-2 sm:p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0B4394]">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Add Staff</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Step {step + 1} of {STEPS.length} — {STEPS[step]}
              </p>
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

        <div className="shrink-0 border-b border-slate-100 bg-slate-50">
          <Stepper step={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* --------------------------------------------------- step 1 --- */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar
                  src={draft.avatar_url}
                  name={fullName || "New staff"}
                  className="h-16 w-16 rounded-xl ring-2 ring-slate-100"
                />
                <div>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50">
                    <Camera className="h-3.5 w-3.5" />
                    {draft.avatar_url ? "Change photo" : "Add photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleAvatar(e.target.files?.[0])}
                    />
                  </label>
                  {draft.avatar_url && (
                    <button
                      type="button"
                      onClick={() => set("avatar_url", "")}
                      className="ml-2 text-[11px] font-bold text-slate-500 hover:text-chetu-red"
                    >
                      Remove
                    </button>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {avatarError || "Cropped square and reduced to 256px before it is stored."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="First Name" required error={touched ? errors.first_name : undefined}>
                  <input
                    className="form-field"
                    value={draft.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Last Name" required error={touched ? errors.last_name : undefined}>
                  <input
                    className="form-field"
                    value={draft.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Phone Number"
                  required
                  error={touched ? errors.phone_number : undefined}
                  hint="Also usable as a sign-in identifier."
                >
                  <input
                    className="form-field"
                    value={draft.phone_number}
                    onChange={(e) => set("phone_number", e.target.value)}
                    placeholder="0772123456"
                    inputMode="numeric"
                  />
                </Field>
                <Field
                  label="Email Address"
                  required
                  error={touched ? errors.email : undefined}
                  hint="Their real address — it is the sign-in credential."
                >
                  <input
                    className="form-field"
                    type="email"
                    value={draft.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="name@chetumf.co.ug"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* --------------------------------------------------- step 2 --- */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] leading-relaxed text-[#0B4394]">
                <strong>Staff ID</strong> is allocated by the system when the account is created —
                in sequence, from a counter, so two people created at the same moment cannot collide
                on one number.
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Role" required hint="Decides every permission this account carries.">
                  <select
                    className="form-field"
                    value={draft.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setDraft((prev) => ({
                        ...prev,
                        role,
                        branch_ids: isBranchScopedRole(role) ? prev.branch_ids : [],
                        primary_branch_id: isBranchScopedRole(role) ? prev.primary_branch_id : "",
                      }));
                    }}
                  >
                    {allowedRoles.map((role) => (
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
                    value={draft.date_joined}
                    onChange={(e) => set("date_joined", e.target.value)}
                  />
                </Field>
              </div>

              {branchScoped ? (
                <>
                  <Field
                    label="Branch Attachment"
                    required
                    error={touched ? errors.branch_ids : undefined}
                  >
                    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                      {branches.length === 0 && (
                        <p className="p-2 text-[12px] text-slate-500">No branches on file yet.</p>
                      )}
                      {branches.map((branch) => (
                        <label
                          key={branch.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={draft.branch_ids.includes(branch.id)}
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

                  {draft.branch_ids.length > 1 && (
                    <Field
                      label="Primary Branch"
                      hint="The branch whose business day governs this account."
                    >
                      <select
                        className="form-field"
                        value={draft.primary_branch_id}
                        onChange={(e) => set("primary_branch_id", e.target.value)}
                      >
                        {draft.branch_ids.map((id) => (
                          <option key={id} value={id}>
                            {branchName(id)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  {draft.role === "Administrator"
                    ? "An Administrator works across the whole institution, so no branch attachment applies."
                    : "An Auditor reads the whole institution and writes nothing, so no branch attachment applies."}
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------------- step 3 --- */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role={draft.role} />
                <p className="text-[12px] text-slate-600">
                  These permissions come from the role, and are enforced by the database — not by
                  hiding buttons.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                    Can
                  </h4>
                  <ul className="space-y-1.5">
                    {granted.map((permission) => {
                      const level = levelFor(draft.role, permission.key);
                      return (
                        <li
                          key={permission.key}
                          className="flex items-start justify-between gap-2 text-[12px] text-slate-700"
                        >
                          <span className="inline-flex min-w-0 items-start gap-1.5">
                            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span className="min-w-0">{permission.label}</span>
                          </span>
                          <span
                            title={LEVEL_HINT[level]}
                            className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200"
                          >
                            {LEVEL_LABEL[level]}
                          </span>
                        </li>
                      );
                    })}
                    {granted.length === 0 && (
                      <li className="text-[12px] text-slate-500">
                        Nothing is permitted for this role.
                      </li>
                    )}
                  </ul>
                </section>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Cannot
                  </h4>
                  <ul className="space-y-1.5">
                    {denied.map((permission) => (
                      <li
                        key={permission.key}
                        className="flex items-start gap-1.5 text-[12px] text-slate-500"
                      >
                        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">{permission.label}</span>
                      </li>
                    ))}
                    {denied.length === 0 && (
                      <li className="text-[12px] text-slate-500">This role is unrestricted.</li>
                    )}
                  </ul>
                </section>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                To change what a role may do, use Roles &amp; Permissions. Changing it there changes
                it for every staff member holding that role, and takes effect on their next request.
              </p>
            </div>
          )}

          {/* --------------------------------------------------- step 4 --- */}
          {step === 3 && (
            <div className="space-y-4">
              <Field
                label="Sign-in identifier"
                hint="Staff sign in with this address, or with their phone number."
              >
                <input
                  className="form-field bg-slate-100"
                  readOnly
                  value={draft.email.trim().toLowerCase() || "—"}
                />
              </Field>

              <Field
                label="Temporary password"
                required
                error={touched ? errors.password : undefined}
              >
                <div className="relative">
                  <input
                    className="form-field pr-20"
                    type={showPassword ? "text" : "password"}
                    value={draft.password}
                    onChange={(e) => set("password", e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    set("password", generatePassword());
                    setShowPassword(true);
                  }}
                  className="mt-2 text-[11px] font-bold text-[#0B4394] hover:underline"
                >
                  Generate a strong password
                </button>
              </Field>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.must_change_password}
                  onChange={(e) => set("must_change_password", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0B4394]"
                />
                <span className="text-[12px] leading-relaxed text-slate-700">
                  <strong className="block text-slate-900">
                    Require a password change at first sign-in
                  </strong>
                  So the password you hand over is not the one they keep.
                </span>
              </label>

              <Field
                label="Account status"
                hint="Pending becomes Active by itself at their first successful sign-in."
              >
                <select
                  className="form-field"
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value as NewStaffDraft["status"])}
                >
                  <option value="Pending">Pending — created, not yet signed in</option>
                  <option value="Active">Active — able to sign in now</option>
                </select>
              </Field>
            </div>
          )}

          {/* --------------------------------------------------- step 5 --- */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Avatar
                  src={draft.avatar_url}
                  name={fullName}
                  className="h-12 w-12 rounded-xl ring-2 ring-white"
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-900">{fullName || "—"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={draft.role} />
                    <span className="text-[11px] text-slate-500">{draft.status}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 px-3 py-1">
                <SummaryRow label="Phone" value={draft.phone_number || "—"} />
                <SummaryRow label="Email" value={draft.email.trim().toLowerCase() || "—"} />
                <SummaryRow
                  label="Staff ID"
                  value={<span className="text-slate-400">Allocated on creation</span>}
                />
                <SummaryRow label="Role" value={draft.role} />
                <SummaryRow
                  label="Branches"
                  value={
                    branchScoped
                      ? draft.branch_ids.map(branchName).join(", ") || "—"
                      : "Institution-wide"
                  }
                />
                {branchScoped && draft.branch_ids.length > 1 && (
                  <SummaryRow
                    label="Primary branch"
                    value={branchName(draft.primary_branch_id || draft.branch_ids[0])}
                  />
                )}
                <SummaryRow label="Date joined" value={draft.date_joined || "—"} />
                <SummaryRow label="Account status" value={draft.status} />
                <SummaryRow
                  label="Password"
                  value={draft.password ? "Set — handed over separately" : "—"}
                />
                <SummaryRow
                  label="Must change password"
                  value={draft.must_change_password ? "Yes, at first sign-in" : "No"}
                />
                <SummaryRow
                  label="Permissions granted"
                  value={`${granted.length} of ${permissions.length}`}
                />
              </div>

              {!canSubmit && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                  Something is still incomplete. Step back through the wizard — the field in
                  question is marked.
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <GhostButton
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={submitting}
          >
            {step === 0 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </>
            )}
          </GhostButton>

          {step < STEPS.length - 1 ? (
            <PrimaryButton type="button" onClick={next}>
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          ) : (
            <PrimaryButton
              type="button"
              disabled={!canSubmit || submitting}
              onClick={() => void onSubmit(draft)}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {submitting ? "Creating…" : "Create Staff Account"}
            </PrimaryButton>
          )}
        </footer>
      </div>
    </div>
  );
};
