/**
 * Presentation primitives shared by the Staff Management screens.
 *
 * Kept together so the register, the profile drawer, the wizard and the
 * permission matrix state a role, a status or a business-day state the same
 * way everywhere — a status that reads "Suspended" in one place and
 * "SUSPENDED" in another makes the reader check whether they mean the same
 * thing.
 */
import React from "react";
import { AlertTriangle } from "lucide-react";
import type { UserRole, StaffStatus } from "../../types/database.types";
import type { OfficerDayStatus, BusinessDayStatus } from "../../context/BusinessDayContext";

export const NAVY = "#0B4394";

export const STAFF_ROLES: UserRole[] = [
  "Administrator",
  "Branch Manager",
  "Loan Officer",
  "Auditor",
];
export const STAFF_STATUSES: StaffStatus[] = ["Active", "Pending", "Suspended", "Inactive"];

/** Roles that are attached to branches rather than working institution-wide. */
export const isBranchScopedRole = (role: UserRole) =>
  role === "Branch Manager" || role === "Loan Officer";

export const shortDate = (v?: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export const shortTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * "2h ago", "Yesterday", "16 days ago" — the form an administrator scanning the
 * register actually reads. Anything past a fortnight goes back to a date,
 * because "94 days ago" is not a fact anyone can hold.
 */
export const relativeTime = (v?: string | null): string => {
  if (!v) return "Never logged in";
  const then = new Date(v).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return shortDate(v);
};

/** Today / Yesterday / the date, paired with the clock time. */
export const loginStamp = (v?: string | null): { primary: string; secondary: string } => {
  if (!v) return { primary: "Never logged in", secondary: "" };
  const date = new Date(v);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor(
    (startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86400000,
  );
  const label = dayDiff === 0 ? "Today" : dayDiff === 1 ? "Yesterday" : shortDate(v);
  return { primary: `${label}, ${shortTime(v)}`, secondary: relativeTime(v) };
};

const ROLE_TONE: Record<UserRole, string> = {
  Administrator: "bg-amber-50 text-amber-800 ring-amber-200",
  "Branch Manager": "bg-indigo-50 text-indigo-800 ring-indigo-200",
  "Loan Officer": "bg-blue-50 text-[#0B4394] ring-blue-200",
  Auditor: "bg-purple-50 text-purple-800 ring-purple-200",
};

export const RoleBadge: React.FC<{ role: UserRole; className?: string }> = ({
  role,
  className = "",
}) => (
  <span
    className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold ring-1 ${ROLE_TONE[role] || ROLE_TONE["Loan Officer"]} ${className}`}
  >
    {role}
  </span>
);

const STATUS_TONE: Record<StaffStatus, { chip: string; dot: string }> = {
  Active: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  Pending: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  Suspended: { chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  Inactive: { chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const StatusBadge: React.FC<{ status: StaffStatus; className?: string }> = ({
  status,
  className = "",
}) => {
  const tone = STATUS_TONE[status] || STATUS_TONE.Inactive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${tone.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {status}
    </span>
  );
};

/**
 * The business-day states, which the control system spells in SCREAMING_SNAKE
 * and this screen renders as words.
 */
const DAY_TONE: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  APPROVED: "bg-blue-50 text-[#0B4394] ring-blue-200",
  SPECIAL_ACCESS: "bg-amber-50 text-amber-800 ring-amber-200",
  SUBMITTED: "bg-amber-50 text-amber-800 ring-amber-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 ring-amber-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
  LOCKED: "bg-slate-100 text-slate-600 ring-slate-200",
  NOT_OPENED: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const DayBadge: React.FC<{
  status: OfficerDayStatus | BusinessDayStatus | string | null | undefined;
}> = ({ status }) => {
  const value = status || "LOCKED";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
        DAY_TONE[value] || DAY_TONE.LOCKED
      }`}
    >
      {String(value).replace(/_/g, " ")}
    </span>
  );
};

/** A labelled fact inside the profile drawer. */
export const DetailRow: React.FC<{
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-500">
      {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
      {label}
    </span>
    <span className="min-w-0 break-words text-right text-[12px] font-semibold text-slate-900">
      {value}
    </span>
  </div>
);

export const DrawerSection: React.FC<{
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, children, right }) => (
  <section className="rounded-xl border border-slate-200 bg-white">
    <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {right}
    </header>
    <div className="px-3.5 py-1.5">{children}</div>
  </section>
);

export const NoticeBar: React.FC<{
  tone?: "amber" | "blue" | "red" | "slate";
  children: React.ReactNode;
}> = ({ tone = "amber", children }) => {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-[#0B4394]",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${tones[tone]}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  message?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, message, action }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
    <Icon className="mx-auto h-8 w-8 text-slate-300" />
    <p className="mt-2 text-[13px] font-bold text-slate-700">{title}</p>
    {message && (
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">{message}</p>
    )}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

/** Skeletons, so the register is never a blank rectangle while it loads. */
export const SkeletonStats: React.FC<{ count?: number }> = ({ count = 9 }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-3">
        <div className="h-2 w-2/3 rounded bg-slate-200" />
        <div className="mt-3 h-5 w-1/2 rounded bg-slate-100" />
        <div className="mt-2 h-2 w-1/3 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="h-9 border-b border-slate-200 bg-slate-50" />
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="flex animate-pulse items-center gap-3 border-b border-slate-100 px-3 py-3"
      >
        <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200" />
        <div className="h-3 flex-1 rounded bg-slate-100" />
        <div className="h-3 w-20 rounded bg-slate-100" />
        <div className="h-3 w-24 rounded bg-slate-100" />
        <div className="h-3 w-16 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

/** The primary and secondary button shapes used across the staff dialogs. */
export const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "navy" | "red" | "amber" | "emerald" }
> = ({ tone = "navy", className = "", children, ...rest }) => {
  const tones = {
    navy: "bg-[#0B4394] hover:bg-[#093672]",
    red: "bg-chetu-red hover:bg-chetu-darkred",
    amber: "bg-amber-600 hover:bg-amber-700",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
  } as const;
  return (
    <button
      {...rest}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[13px] font-bold text-white transition disabled:opacity-50 sm:h-9 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
};

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <button
    {...rest}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:h-9 ${className}`}
  >
    {children}
  </button>
);
