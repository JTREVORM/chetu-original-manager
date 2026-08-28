/**
 * One branch, as a card.
 *
 * Reads top to bottom the way a manager asks about a branch: who and where it
 * is, how big it is, what it is carrying, and what came in today.
 */
import React from "react";
import { MapPin, Phone, UserRound } from "lucide-react";
import { useNavigate } from "../../lib/router-compat";
import type { Branch } from "../../types/database.types";
import type { BranchMetrics } from "../../lib/branchMetrics";
import { money } from "../mis/MisKit";
import { compactUGX, parTone, percent, StatusPill } from "./BranchUi";
import { BranchActionsMenu } from "./BranchActionsMenu";

const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div className="text-center">
    <p className="text-[15px] font-bold leading-tight text-slate-900">{value}</p>
    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
  </div>
);

const Money: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = "text-slate-900",
}) => (
  <div className="min-w-0">
    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className={`mt-0.5 truncate text-[13px] font-bold ${tone}`}>{value}</p>
  </div>
);

export const BranchCard: React.FC<{
  branch: Branch;
  metrics: BranchMetrics;
  staffCount: number;
  canManage: boolean;
  linkedRecords: number;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}> = ({
  branch,
  metrics,
  staffCount,
  canManage,
  linkedRecords,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) => {
  const navigate = useNavigate();
  const inactive = branch.status !== "Active";

  return (
    <article
      className={`flex flex-col rounded-xl border bg-white shadow-xs transition hover:shadow-sm ${
        inactive ? "border-slate-200 opacity-90" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/branches/${branch.id}`)}
            className="block max-w-full truncate text-left text-[14px] font-bold text-slate-900 hover:text-[#0B4394] hover:underline"
          >
            {branch.branch_name}
          </button>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            {branch.branch_code}
            {branch.branch_type ? ` · ${branch.branch_type}` : ""}
          </p>
        </div>
        <StatusPill status={branch.status} />
      </header>

      <div className="space-y-1.5 px-4 py-3 text-[11px] text-slate-600">
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0B4394]" />
          <span className="truncate">
            {[branch.physical_address, branch.town, branch.district].filter(Boolean).join(", ") ||
              branch.location ||
              "Location not recorded"}
          </span>
        </p>
        <p className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0 text-[#0B4394]" />
          <span className="truncate">{branch.phone || "No phone recorded"}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[#0B4394]" />
          <span className="truncate">{branch.manager_name || "No manager assigned"}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-slate-100 bg-slate-50/60 px-4 py-3">
        <Stat value={money(staffCount)} label="Staff" />
        <Stat value={money(metrics.members.total)} label="Members" />
        <Stat value={money(metrics.groups.total)} label="Groups" />
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <Money label="Portfolio" value={compactUGX(metrics.portfolio.outstanding)} />
        <Money label="Savings" value={compactUGX(metrics.savings.balance)} />
        <Money
          label="PAR 30"
          value={percent(metrics.portfolio.par30Ratio)}
          tone={parTone(metrics.portfolio.par30Ratio)}
        />
        <Money
          label="Collections today"
          value={compactUGX(metrics.collections.today)}
          tone="text-[#0B4394]"
        />
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/branches/${branch.id}`)}
          className="text-[12px] font-bold text-[#0B4394] hover:underline"
        >
          View dashboard
        </button>
        <BranchActionsMenu
          branch={branch}
          canManage={canManage}
          linkedRecords={linkedRecords}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
          onDelete={onDelete}
          compact
        />
      </footer>
    </article>
  );
};
