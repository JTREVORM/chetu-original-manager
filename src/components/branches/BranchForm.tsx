/**
 * Create and edit a branch.
 *
 * Creation runs as a five-step wizard because a branch record carries far more
 * than a name and a code, and asking for all of it on one screen invites blank
 * fields. Editing shows the same fields as labelled sections, since someone
 * changing a phone number should not have to walk through five steps to reach
 * it.
 *
 * Status is deliberately not editable here. Closing a branch requires a reason
 * and is checked against the branch's live operations, so it goes through the
 * deactivation dialog instead.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ScrollArea } from "../common/ScrollArea";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import type { Branch, BranchApprovalLevel, BranchType } from "../../types/database.types";
import {
  APPROVAL_LEVELS,
  BRANCH_TYPES,
  NoticeBar,
  REGIONS,
  StatusPill,
  WORKING_DAYS,
} from "./BranchUi";
import { StaffSelect } from "./StaffSelect";
import { useStaffDirectory } from "./useStaffDirectory";
import { money } from "../mis/MisKit";

interface FormValues {
  branch_name: string;
  branch_code: string;
  branch_type: BranchType;
  region: string;
  district: string;
  town: string;
  physical_address: string;
  latitude: string;
  longitude: string;
  phone: string;
  alt_phone: string;
  email: string;
  manager_id: string | null;
  assistant_manager_id: string | null;
  opening_time: string;
  closing_time: string;
  working_days: string[];
  currency: string;
  max_cash_holding: string;
  approval_level: "" | BranchApprovalLevel;
}

type Errors = Partial<Record<keyof FormValues, string>>;

const STEPS = [
  "Basic Information",
  "Location & Contact",
  "Management",
  "Operations",
  "Review",
] as const;

const blankValues = (): FormValues => ({
  branch_name: "",
  branch_code: "",
  branch_type: "Main Branch",
  region: "",
  district: "",
  town: "",
  physical_address: "",
  latitude: "",
  longitude: "",
  phone: "",
  alt_phone: "",
  email: "",
  manager_id: null,
  assistant_manager_id: null,
  opening_time: "08:00",
  closing_time: "17:00",
  working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  currency: "UGX",
  max_cash_holding: "",
  approval_level: "Branch",
});

const fromBranch = (branch: Branch): FormValues => ({
  branch_name: branch.branch_name || "",
  branch_code: branch.branch_code || "",
  branch_type: branch.branch_type || "Main Branch",
  region: branch.region || "",
  district: branch.district || "",
  town: branch.town || branch.location || "",
  physical_address: branch.physical_address || "",
  latitude: branch.latitude != null ? String(branch.latitude) : "",
  longitude: branch.longitude != null ? String(branch.longitude) : "",
  phone: branch.phone || "",
  alt_phone: branch.alt_phone || "",
  email: branch.email || "",
  manager_id: branch.manager_id || null,
  assistant_manager_id: branch.assistant_manager_id || null,
  opening_time: (branch.opening_time || "08:00").slice(0, 5),
  closing_time: (branch.closing_time || "17:00").slice(0, 5),
  working_days: branch.working_days?.length
    ? branch.working_days
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  currency: branch.currency || "UGX",
  max_cash_holding: branch.max_cash_holding != null ? String(branch.max_cash_holding) : "",
  approval_level: branch.approval_level || "Branch",
});

/** Ugandan land and mobile numbers alike are ten digits starting with a zero. */
const PHONE_PATTERN = /^0\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(
  values: FormValues,
  step: number | "all",
  branches: Branch[],
  editingId?: string,
): Errors {
  const errors: Errors = {};
  const wants = (n: number) => step === "all" || step === n;

  if (wants(0)) {
    if (!values.branch_name.trim()) errors.branch_name = "Branch name is required.";
    else if (
      branches.some(
        (b) =>
          b.id !== editingId &&
          b.branch_name.trim().toLowerCase() === values.branch_name.trim().toLowerCase(),
      )
    ) {
      errors.branch_name = "Another branch already uses this name.";
    }

    const code = values.branch_code.trim().toUpperCase();
    if (!code) errors.branch_code = "Branch code is required.";
    else if (!/^[A-Z0-9-]{2,12}$/.test(code))
      errors.branch_code = "Use 2–12 letters, digits or hyphens, e.g. IGA-01.";
    else if (
      branches.some((b) => b.id !== editingId && b.branch_code.trim().toUpperCase() === code)
    ) {
      errors.branch_code = "This branch code is already in use.";
    }
  }

  if (wants(1)) {
    if (!values.region) errors.region = "Region is required.";
    if (!values.district.trim()) errors.district = "District is required.";
    if (!values.town.trim()) errors.town = "Town or municipality is required.";
    if (!values.physical_address.trim()) errors.physical_address = "Physical address is required.";
    if (!values.phone.trim()) errors.phone = "A branch phone number is required.";
    else if (!PHONE_PATTERN.test(values.phone.trim()))
      errors.phone = "Enter ten digits starting with 0, e.g. 0392000101.";
    if (values.alt_phone.trim() && !PHONE_PATTERN.test(values.alt_phone.trim())) {
      errors.alt_phone = "Enter ten digits starting with 0, or leave blank.";
    }
    if (values.email.trim() && !EMAIL_PATTERN.test(values.email.trim()))
      errors.email = "Enter a valid email address.";
    if (values.latitude.trim() && Number.isNaN(Number(values.latitude)))
      errors.latitude = "Latitude must be a number.";
    if (values.longitude.trim() && Number.isNaN(Number(values.longitude)))
      errors.longitude = "Longitude must be a number.";
  }

  if (wants(2)) {
    if (values.manager_id && values.manager_id === values.assistant_manager_id) {
      errors.assistant_manager_id = "The assistant must be a different member of staff.";
    }
  }

  if (wants(3)) {
    if (values.working_days.length === 0) errors.working_days = "Select at least one working day.";
    if (values.opening_time && values.closing_time && values.closing_time <= values.opening_time) {
      errors.closing_time = "Closing time must be after opening time.";
    }
    const cash = values.max_cash_holding.trim();
    if (cash && (Number.isNaN(Number(cash)) || Number(cash) < 0)) {
      errors.max_cash_holding = "Enter a positive amount, or leave blank for no limit.";
    }
  }

  return errors;
}

const FieldShell: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, error, hint, htmlFor, children, className = "" }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="form-label">
      {label} {required && <span className="text-chetu-red">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-chetu-red">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    ) : (
      hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    )}
  </div>
);

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="form-section-title">{children}</h3>
);

const ReviewRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <span className="text-[12px] text-slate-500">{label}</span>
    <span className="max-w-[60%] text-right text-[12px] font-semibold text-slate-900">
      {value || "—"}
    </span>
  </div>
);

export const BranchFormDialog: React.FC<{
  open: boolean;
  mode: "create" | "edit";
  branch?: Branch | null;
  onClose: () => void;
  onSaved?: (branchId: string) => void;
}> = ({ open, mode, branch, onClose, onSaved }) => {
  const { branches, addBranch, updateBranch } = useDatabase();
  const { addToast } = useNotifications();
  const { staff, canReadDirectory } = useStaffDirectory();

  const suggestedCode = useMemo(() => {
    const used = new Set(branches.map((b) => b.branch_code.toUpperCase()));
    for (let n = branches.length + 1; n < branches.length + 200; n += 1) {
      const candidate = `BR-${String(n).padStart(3, "0")}`;
      if (!used.has(candidate)) return candidate;
    }
    return "";
  }, [branches]);

  const [values, setValues] = useState<FormValues>(() =>
    mode === "edit" && branch
      ? fromBranch(branch)
      : { ...blankValues(), branch_code: suggestedCode },
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formKey, setFormKey] = useState("");

  // Re-seed when the dialog is reopened for a different branch, without
  // resetting while the user is part-way through filling it in.
  const identity = `${mode}:${branch?.id || "new"}:${open}`;
  if (open && identity !== formKey) {
    setFormKey(identity);
    setValues(
      mode === "edit" && branch
        ? fromBranch(branch)
        : { ...blankValues(), branch_code: suggestedCode },
    );
    setStep(0);
    setErrors({});
  }

  if (!open) return null;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const isWizard = mode === "create";

  const goNext = () => {
    const stepErrors = validate(values, step, branches, branch?.id);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const buildPayload = () => {
    const town = values.town.trim();
    const district = values.district.trim();
    return {
      branch_name: values.branch_name.trim(),
      branch_code: values.branch_code.trim().toUpperCase(),
      branch_type: values.branch_type,
      region: values.region || null,
      district: district || null,
      town: town || null,
      physical_address: values.physical_address.trim() || null,
      // `location` predates the structured address and is still read by older
      // screens, so it is kept true rather than left to rot.
      location: [town, district].filter(Boolean).join(", ") || null,
      latitude: values.latitude.trim() ? Number(values.latitude) : null,
      longitude: values.longitude.trim() ? Number(values.longitude) : null,
      phone: values.phone.trim() || null,
      alt_phone: values.alt_phone.trim() || null,
      email: values.email.trim() || null,
      manager_id: values.manager_id || null,
      assistant_manager_id: values.assistant_manager_id || null,
      opening_time: values.opening_time || null,
      closing_time: values.closing_time || null,
      working_days: values.working_days,
      currency: values.currency || "UGX",
      max_cash_holding: values.max_cash_holding.trim() ? Number(values.max_cash_holding) : null,
      approval_level: values.approval_level || null,
    };
  };

  const handleSubmit = async () => {
    const allErrors = validate(values, "all", branches, branch?.id);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Send the user back to the first step that actually has a problem.
      const stepOf: Record<string, number> = {
        branch_name: 0,
        branch_code: 0,
        region: 1,
        district: 1,
        town: 1,
        physical_address: 1,
        phone: 1,
        alt_phone: 1,
        email: 1,
        latitude: 1,
        longitude: 1,
        assistant_manager_id: 2,
        working_days: 3,
        closing_time: 3,
        max_cash_holding: 3,
      };
      if (isWizard) {
        const firstBad = Math.min(...Object.keys(allErrors).map((key) => stepOf[key] ?? 0));
        setStep(firstBad);
      }
      addToast("error", "Check the form", "Some fields still need attention.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (mode === "edit" && branch) {
        await updateBranch(branch.id, payload as Partial<Branch>);
        addToast("success", "Branch updated", "Branch information updated successfully.");
        onSaved?.(branch.id);
      } else {
        const created = await addBranch({ ...payload, status: "Active" } as Omit<
          Branch,
          "id" | "created_at"
        >);
        addToast(
          "success",
          "Branch created",
          `${created.branch_name} (${created.branch_code}) is now available across the system.`,
        );
        onSaved?.(created.id);
      }
      onClose();
    } catch (error) {
      addToast(
        "error",
        "Save failed",
        error instanceof Error ? error.message : "Could not save the branch.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const managerName = staff.find((s) => s.id === values.manager_id)?.full_name;
  const assistantName = staff.find((s) => s.id === values.assistant_manager_id)?.full_name;

  const stepOne = (
    <div className="space-y-4">
      <SectionHeading>Basic Information</SectionHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldShell label="Branch Name" required error={errors.branch_name} htmlFor="branch_name">
          <input
            id="branch_name"
            className="form-field"
            value={values.branch_name}
            onChange={(e) => set("branch_name", e.target.value)}
            placeholder="e.g. Mbarara Branch"
          />
        </FieldShell>
        <FieldShell
          label="Branch Code"
          required
          error={errors.branch_code}
          hint="Short unique identifier used on reports, e.g. MBR-05."
          htmlFor="branch_code"
        >
          <input
            id="branch_code"
            className="form-field uppercase"
            value={values.branch_code}
            onChange={(e) => set("branch_code", e.target.value.toUpperCase())}
            placeholder="e.g. MBR-05"
          />
        </FieldShell>
        <FieldShell label="Branch Type" required htmlFor="branch_type">
          <select
            id="branch_type"
            className="form-field"
            value={values.branch_type}
            onChange={(e) => set("branch_type", e.target.value as BranchType)}
          >
            {BRANCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FieldShell>
        <FieldShell
          label="Status"
          hint={
            isWizard
              ? "A new branch opens active. Closing one later requires a reason."
              : "Change this with Deactivate or Reactivate, so the reason is recorded."
          }
        >
          <div className="flex h-[46px] items-center md:h-[32px]">
            <StatusPill status={mode === "edit" && branch ? branch.status : "Active"} />
          </div>
        </FieldShell>
      </div>
    </div>
  );

  const stepTwo = (
    <div className="space-y-4">
      <SectionHeading>Location &amp; Contact</SectionHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldShell label="Region" required error={errors.region} htmlFor="region">
          <select
            id="region"
            className="form-field"
            value={values.region}
            onChange={(e) => set("region", e.target.value)}
          >
            <option value="">Select region</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label="District" required error={errors.district} htmlFor="district">
          <input
            id="district"
            className="form-field"
            value={values.district}
            onChange={(e) => set("district", e.target.value)}
            placeholder="e.g. Iganga"
          />
        </FieldShell>
        <FieldShell label="Town / Municipality" required error={errors.town} htmlFor="town">
          <input
            id="town"
            className="form-field"
            value={values.town}
            onChange={(e) => set("town", e.target.value)}
            placeholder="e.g. Iganga Town"
          />
        </FieldShell>
        <FieldShell
          label="Physical Address"
          required
          error={errors.physical_address}
          htmlFor="physical_address"
        >
          <input
            id="physical_address"
            className="form-field"
            value={values.physical_address}
            onChange={(e) => set("physical_address", e.target.value)}
            placeholder="e.g. Main Street, Plot 14"
          />
        </FieldShell>
        <FieldShell label="Branch Phone" required error={errors.phone} htmlFor="phone">
          <input
            id="phone"
            className="form-field"
            inputMode="numeric"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="0392000101"
          />
        </FieldShell>
        <FieldShell label="Alternative Phone" error={errors.alt_phone} htmlFor="alt_phone">
          <input
            id="alt_phone"
            className="form-field"
            inputMode="numeric"
            value={values.alt_phone}
            onChange={(e) => set("alt_phone", e.target.value)}
            placeholder="Optional"
          />
        </FieldShell>
        <FieldShell label="Branch Email" error={errors.email} htmlFor="email">
          <input
            id="email"
            className="form-field"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="branch@chetumicrofinance.com"
          />
        </FieldShell>
        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Latitude" error={errors.latitude} htmlFor="latitude">
            <input
              id="latitude"
              className="form-field"
              value={values.latitude}
              onChange={(e) => set("latitude", e.target.value)}
              placeholder="0.6093"
            />
          </FieldShell>
          <FieldShell label="Longitude" error={errors.longitude} htmlFor="longitude">
            <input
              id="longitude"
              className="form-field"
              value={values.longitude}
              onChange={(e) => set("longitude", e.target.value)}
              placeholder="33.4686"
            />
          </FieldShell>
        </div>
      </div>
    </div>
  );

  const stepThree = (
    <div className="space-y-4">
      <SectionHeading>Management</SectionHeading>
      {!canReadDirectory && (
        <NoticeBar tone="blue">
          The staff directory is only readable by Administrators, so the pickers below list just
          your own account.
        </NoticeBar>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldShell
          label="Branch Manager"
          hint="Linked to a real staff account, not typed in."
          htmlFor="manager_id"
        >
          <StaffSelect
            id="manager_id"
            value={values.manager_id}
            onChange={(id) => set("manager_id", id)}
            staff={staff}
            preferredRoles={["Branch Manager", "Administrator"]}
          />
        </FieldShell>
        <FieldShell
          label="Assistant Manager"
          error={errors.assistant_manager_id}
          htmlFor="assistant_manager_id"
        >
          <StaffSelect
            id="assistant_manager_id"
            value={values.assistant_manager_id}
            onChange={(id) => set("assistant_manager_id", id)}
            staff={staff}
            preferredRoles={["Branch Manager", "Loan Officer"]}
          />
        </FieldShell>
      </div>
      <NoticeBar tone="amber">
        Assigning a manager here does not grant them access to the branch. Staff see a branch once
        it is listed in their profile under User Management.
      </NoticeBar>
    </div>
  );

  const stepFour = (
    <div className="space-y-4">
      <SectionHeading>Operations</SectionHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Opening Time" htmlFor="opening_time">
            <input
              id="opening_time"
              type="time"
              className="form-field"
              value={values.opening_time}
              onChange={(e) => set("opening_time", e.target.value)}
            />
          </FieldShell>
          <FieldShell label="Closing Time" error={errors.closing_time} htmlFor="closing_time">
            <input
              id="closing_time"
              type="time"
              className="form-field"
              value={values.closing_time}
              onChange={(e) => set("closing_time", e.target.value)}
            />
          </FieldShell>
        </div>
        <FieldShell label="Default Currency" htmlFor="currency">
          <select
            id="currency"
            className="form-field"
            value={values.currency}
            onChange={(e) => set("currency", e.target.value)}
          >
            <option value="UGX">UGX — Uganda Shilling</option>
          </select>
        </FieldShell>
        <FieldShell
          label="Maximum Cash Holding"
          error={errors.max_cash_holding}
          hint="Leave blank for no limit."
          htmlFor="max_cash_holding"
        >
          <input
            id="max_cash_holding"
            className="form-field"
            inputMode="numeric"
            value={values.max_cash_holding}
            onChange={(e) => set("max_cash_holding", e.target.value)}
            placeholder="e.g. 20000000"
          />
        </FieldShell>
        <FieldShell
          label="Approval Level"
          hint="Where loan approvals for this branch are decided."
          htmlFor="approval_level"
        >
          <select
            id="approval_level"
            className="form-field"
            value={values.approval_level}
            onChange={(e) => set("approval_level", e.target.value as BranchApprovalLevel | "")}
          >
            <option value="">Not set</option>
            {APPROVAL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>
      <FieldShell label="Working Days" required error={errors.working_days}>
        <div className="flex flex-wrap gap-2">
          {WORKING_DAYS.map((day) => {
            const on = values.working_days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    "working_days",
                    on
                      ? values.working_days.filter((d) => d !== day)
                      : [...values.working_days, day],
                  )
                }
                className={`rounded-lg border px-3 py-2 text-[12px] font-bold transition md:py-1.5 ${
                  on
                    ? "border-[#0B4394] bg-[#0B4394] text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </FieldShell>
    </div>
  );

  const review = (
    <div className="space-y-4">
      <SectionHeading>Review</SectionHeading>
      <p className="text-[12px] text-slate-500">
        Check the details below. Everything here can be changed later from the branch dashboard.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Identity
          </p>
          <ReviewRow label="Branch name" value={values.branch_name} />
          <ReviewRow label="Branch code" value={values.branch_code.toUpperCase()} />
          <ReviewRow label="Branch type" value={values.branch_type} />
          <ReviewRow label="Status" value={<StatusPill status="Active" />} />
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Location &amp; contact
          </p>
          <ReviewRow label="Region" value={values.region} />
          <ReviewRow label="District" value={values.district} />
          <ReviewRow label="Town" value={values.town} />
          <ReviewRow label="Address" value={values.physical_address} />
          <ReviewRow label="Phone" value={values.phone} />
          <ReviewRow label="Alternative phone" value={values.alt_phone} />
          <ReviewRow label="Email" value={values.email} />
          <ReviewRow
            label="GPS"
            value={
              values.latitude && values.longitude ? `${values.latitude}, ${values.longitude}` : ""
            }
          />
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Management
          </p>
          <ReviewRow label="Branch manager" value={managerName} />
          <ReviewRow label="Assistant manager" value={assistantName} />
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Operations
          </p>
          <ReviewRow
            label="Opening hours"
            value={`${values.opening_time} – ${values.closing_time}`}
          />
          <ReviewRow label="Working days" value={values.working_days.join(", ")} />
          <ReviewRow label="Currency" value={values.currency} />
          <ReviewRow
            label="Maximum cash holding"
            value={
              values.max_cash_holding ? `UGX ${money(Number(values.max_cash_holding))}` : "No limit"
            }
          />
          <ReviewRow label="Approval level" value={values.approval_level} />
        </div>
      </div>
    </div>
  );

  const stepContent = [stepOne, stepTwo, stepThree, stepFour, review];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-3 sm:p-6">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">
              {isWizard ? "Create New Branch" : `Edit ${branch?.branch_name || "Branch"}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isWizard
                ? `Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`
                : "Update this branch’s record."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-chetu-red"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {isWizard && (
          <nav aria-label="Progress" className="shrink-0 border-b border-slate-100 px-4 py-3">
            <ol className="flex items-center gap-1 overflow-x-auto">
              {STEPS.map((label, index) => {
                const done = index < step;
                const current = index === step;
                return (
                  <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        done
                          ? "bg-emerald-500 text-white"
                          : current
                            ? "bg-[#0B4394] text-white"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span
                      className={`hidden truncate text-[11px] font-semibold sm:block ${
                        current ? "text-slate-900" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </span>
                    {index < STEPS.length - 1 && (
                      <span className={`h-px flex-1 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <ScrollArea axis="y" className="min-h-0 flex-1 px-4 py-4" ariaLabel="Branch details">
          {isWizard ? (
            stepContent[step]
          ) : (
            <div className="space-y-6">
              {stepOne}
              {stepTwo}
              {stepThree}
              {stepFour}
            </div>
          )}
        </ScrollArea>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {isWizard && step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-slate-300 px-4 text-[13px] font-bold text-slate-700 hover:bg-slate-50 sm:h-9 sm:w-auto"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-[13px] font-bold text-slate-600 hover:bg-slate-100 sm:h-9"
            >
              Cancel
            </button>
            {isWizard && step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-[#0B4394] px-5 text-[13px] font-bold text-white hover:bg-[#093672] sm:h-9"
              >
                Next: {STEPS[step + 1]} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0B4394] px-5 text-[13px] font-bold text-white hover:bg-[#093672] disabled:opacity-50 sm:h-9"
              >
                {submitting ? "Saving…" : isWizard ? "Create Branch" : "Save Changes"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
