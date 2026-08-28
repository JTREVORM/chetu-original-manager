/**
 * The register's summary strip.
 *
 * Every figure is counted from the rows on file, and every tile is a filter:
 * clicking "Suspended" is the same act as choosing Suspended in the status
 * select, so the number and the list can never disagree about what they mean.
 */
import React from "react";
import {
  ShieldCheck,
  UserCheck,
  UserCog,
  UserMinus,
  UserRound,
  UserX,
  Users,
  Building2,
  ClipboardClock,
} from "lucide-react";
import type { StaffStats } from "./useStaffRegister";
import type { StaffFilters } from "./useStaffRegister";

interface Tile {
  key: string;
  label: string;
  value: number;
  hint?: string;
  icon: React.ElementType;
  tone: "navy" | "emerald" | "amber" | "red" | "slate" | "indigo" | "purple";
  /** The filter state this tile stands for. */
  filter: Partial<StaffFilters>;
}

const TONES = {
  navy: "bg-blue-50 text-[#0B4394]",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  slate: "bg-slate-100 text-slate-600",
  indigo: "bg-indigo-50 text-indigo-600",
  purple: "bg-purple-50 text-purple-600",
} as const;

const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

export const StaffStatsStrip: React.FC<{
  stats: StaffStats;
  filters: StaffFilters;
  onApply: (patch: Partial<StaffFilters>) => void;
}> = ({ stats, filters, onApply }) => {
  const tiles: Tile[] = [
    {
      key: "total",
      label: "Total Staff",
      value: stats.total,
      hint: "All accounts",
      icon: Users,
      tone: "navy",
      filter: { role: "All", status: "All" },
    },
    {
      key: "active",
      label: "Active",
      value: stats.active,
      hint: share(stats.active, stats.total),
      icon: UserCheck,
      tone: "emerald",
      filter: { status: "Active", role: "All" },
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending,
      hint: "Never signed in",
      icon: UserRound,
      tone: "amber",
      filter: { status: "Pending", role: "All" },
    },
    {
      key: "suspended",
      label: "Suspended",
      value: stats.suspended,
      hint: share(stats.suspended, stats.total),
      icon: UserX,
      tone: "red",
      filter: { status: "Suspended", role: "All" },
    },
    {
      key: "inactive",
      label: "Inactive",
      value: stats.inactive,
      hint: share(stats.inactive, stats.total),
      icon: UserMinus,
      tone: "slate",
      filter: { status: "Inactive", role: "All" },
    },
    {
      key: "officers",
      label: "Loan Officers",
      value: stats.loanOfficers,
      hint: share(stats.loanOfficers, stats.total),
      icon: UserCog,
      tone: "navy",
      filter: { role: "Loan Officer", status: "All" },
    },
    {
      key: "managers",
      label: "Branch Managers",
      value: stats.branchManagers,
      hint: share(stats.branchManagers, stats.total),
      icon: Building2,
      tone: "indigo",
      filter: { role: "Branch Manager", status: "All" },
    },
    {
      key: "admins",
      label: "Administrators",
      value: stats.administrators,
      hint: share(stats.administrators, stats.total),
      icon: ShieldCheck,
      tone: "amber",
      filter: { role: "Administrator", status: "All" },
    },
    {
      key: "auditors",
      label: "Auditors",
      value: stats.auditors,
      hint: share(stats.auditors, stats.total),
      icon: ShieldCheck,
      tone: "purple",
      filter: { role: "Auditor", status: "All" },
    },
    {
      key: "requests",
      label: "Pending Requests",
      value: stats.pendingRequests,
      hint: "Days awaiting approval",
      icon: ClipboardClock,
      tone: "amber",
      filter: { role: "Loan Officer", status: "All" },
    },
  ];

  // A tile reads as selected when the filters already say exactly what it says.
  const isActive = (tile: Tile) =>
    tile.key !== "total" &&
    tile.key !== "requests" &&
    Object.entries(tile.filter).every(([k, v]) => filters[k as keyof StaffFilters] === v) &&
    (tile.filter.status !== "All" || tile.filter.role !== "All");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const active = isActive(tile);
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onApply(tile.filter)}
            aria-pressed={active}
            className={`flex w-full items-start justify-between gap-2 rounded-xl border bg-white p-3 text-left shadow-xs transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4394]/40 ${
              active ? "border-[#0B4394] ring-1 ring-[#0B4394]/20" : "border-slate-200"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
                {tile.label}
              </p>
              <p className="mt-1 text-xl font-bold leading-none text-slate-900">{tile.value}</p>
              {tile.hint && (
                <p className="mt-1 text-[10px] font-medium text-slate-400">{tile.hint}</p>
              )}
            </div>
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONES[tile.tone]}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
};
