/**
 * Presentation primitives shared by the Branch Network screens.
 *
 * Kept together so the network list, the branch dashboard and the branch forms
 * state a figure, a status or an empty result the same way everywhere.
 */
import React from "react";
import { AlertTriangle, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { BranchApprovalLevel, BranchType } from "../../types/database.types";

export const NAVY = "#0B4394";
export const EMERALD = "#059669";
export const AMBER = "#D97706";
export const RED = "#D32F2F";
export const SLATE = "#64748b";

export const BRANCH_TYPES: BranchType[] = [
  "Head Office",
  "Main Branch",
  "Satellite Branch",
  "Field Office",
];
export const APPROVAL_LEVELS: BranchApprovalLevel[] = ["Branch", "Regional", "Head Office"];
export const WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Uganda's administrative regions — the branch network's top-level grouping. */
export const REGIONS = ["Central", "Eastern", "Northern", "Western"];

/** Compact UGX rendering for KPI tiles, where full digits would not fit. */
export const compactUGX = (n: number) => {
  const value = Number(n || 0);
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `UGX ${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `UGX ${(value / 1_000).toFixed(0)}K`;
  return `UGX ${value.toFixed(0)}`;
};

export const percent = (n: number, digits = 2) => `${Number(n || 0).toFixed(digits)}%`;

export const StatusPill: React.FC<{ status: string; className?: string }> = ({
  status,
  className = "",
}) => {
  const active = status === "Active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {status}
    </span>
  );
};

/**
 * Portfolio at risk reads as a health signal, not a neutral number: under 5% is
 * healthy, under 10% needs watching, above that is a problem worth flagging.
 */
export const parTone = (ratio: number) =>
  ratio <= 5 ? "text-emerald-600" : ratio <= 10 ? "text-amber-600" : "text-red-600";

export const Delta: React.FC<{ value: number | null; suffix?: string }> = ({
  value,
  suffix = "vs yesterday",
}) => {
  if (value === null) {
    return <span className="text-[11px] font-medium text-slate-400">no prior day to compare</span>;
  }
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  const tone = rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-red-600" : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" />
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(1)}% {suffix}
    </span>
  );
};

export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone?: "navy" | "emerald" | "amber" | "red" | "slate";
  onClick?: () => void;
}> = ({ label, value, hint, icon: Icon, tone = "navy", onClick }) => {
  const tones = {
    navy: "bg-blue-50 text-[#0B4394]",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
  } as const;
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition ${
        onClick
          ? "hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4394]/40"
          : ""
      }`}
    >
      {/* Labels wrap rather than truncate: "Outstanding Loans" cut to
          "Outstanding…" tells the reader nothing, and these cards sit six
          across on wide screens. */}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1.5 text-lg font-bold leading-tight text-slate-900 xl:text-xl">{value}</p>
        {hint !== undefined && (
          <div className="mt-1 text-[11px] font-medium leading-tight text-slate-500">{hint}</div>
        )}
      </div>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
    </Wrapper>
  );
};

/** A labelled figure inside a panel — denser than a KPI card. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
}> = ({ label, value, hint, tone = "text-slate-900" }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-base font-bold ${tone}`}>{value}</p>
    {hint !== undefined && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
  </div>
);

export const Panel: React.FC<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, right, children, className = "" }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

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

export const NoticeBar: React.FC<{
  tone?: "amber" | "blue" | "red";
  children: React.ReactNode;
}> = ({ tone = "amber", children }) => {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-[#0B4394]",
    red: "border-red-200 bg-red-50 text-red-800",
  } as const;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${tones[tone]}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
};

export const SkeletonCard: React.FC = () => (
  <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
    <div className="h-3 w-1/3 rounded bg-slate-200" />
    <div className="mt-3 h-2 w-1/2 rounded bg-slate-100" />
    <div className="mt-6 grid grid-cols-3 gap-3">
      <div className="h-8 rounded bg-slate-100" />
      <div className="h-8 rounded bg-slate-100" />
      <div className="h-8 rounded bg-slate-100" />
    </div>
    <div className="mt-4 h-10 rounded bg-slate-100" />
  </div>
);

export const SkeletonRow: React.FC<{ columns: number }> = ({ columns }) => (
  <div className="flex animate-pulse gap-3 border-b border-slate-100 px-3 py-3">
    {Array.from({ length: columns }).map((_, i) => (
      <div key={i} className="h-3 flex-1 rounded bg-slate-100" />
    ))}
  </div>
);
