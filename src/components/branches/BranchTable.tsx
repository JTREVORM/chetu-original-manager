/**
 * The branch network as a sortable table.
 *
 * Built on MisTable so it keeps the behaviour every other list in the system
 * has: a dense desktop table, pale-blue "Label : Value" cards on a phone, and
 * client-side paging.
 */
import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useNavigate } from "../../lib/router-compat";
import type { Branch } from "../../types/database.types";
import type { BranchMetrics } from "../../lib/branchMetrics";
import { MisTable, money, type MisColumn } from "../mis/MisKit";
import { compactUGX, parTone, percent, StatusPill } from "./BranchUi";
import { BranchActionsMenu } from "./BranchActionsMenu";

export interface BranchRow {
  branch: Branch;
  metrics: BranchMetrics;
  staffCount: number;
  linkedRecords: number;
}

export type SortKey =
  | "branch"
  | "code"
  | "manager"
  | "staff"
  | "members"
  | "groups"
  | "portfolio"
  | "savings"
  | "par30"
  | "status";

export const sortRows = (rows: BranchRow[], key: SortKey, direction: "asc" | "desc") => {
  const value = (row: BranchRow): string | number => {
    switch (key) {
      case "branch":
        return row.branch.branch_name.toLowerCase();
      case "code":
        return row.branch.branch_code.toLowerCase();
      case "manager":
        return (row.branch.manager_name || "").toLowerCase();
      case "staff":
        return row.staffCount;
      case "members":
        return row.metrics.members.total;
      case "groups":
        return row.metrics.groups.total;
      case "portfolio":
        return row.metrics.portfolio.outstanding;
      case "savings":
        return row.metrics.savings.balance;
      case "par30":
        return row.metrics.portfolio.par30Ratio;
      case "status":
        return row.branch.status;
      default:
        return 0;
    }
  };
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
};

const SortHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}> = ({ label, sortKey, active, direction, onSort }) => {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 hover:text-white ${isActive ? "text-white" : ""}`}
    >
      {label}
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
};

export const BranchTable: React.FC<{
  rows: BranchRow[];
  loading?: boolean;
  canManage: boolean;
  sortKey: SortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onEdit: (branch: Branch) => void;
  onDeactivate: (branch: Branch) => void;
  onReactivate: (branch: Branch) => void;
  onDelete: (branch: Branch) => void;
}> = ({
  rows,
  loading,
  canManage,
  sortKey,
  sortDirection,
  onSort,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) => {
  const navigate = useNavigate();

  const header = (label: string, key: SortKey) => (
    <SortHeader
      label={label}
      sortKey={key}
      active={sortKey}
      direction={sortDirection}
      onSort={onSort}
    />
  );

  const columns: MisColumn<BranchRow>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "18%",
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/branches/${row.branch.id}`)}
          className="truncate text-left font-semibold text-[#0B4394] hover:underline"
        >
          {row.branch.branch_name}
        </button>
      ),
      text: (row) => row.branch.branch_name,
    },
    {
      key: "code",
      label: "Code",
      width: "8%",
      render: (row) => row.branch.branch_code,
      text: (row) => row.branch.branch_code,
    },
    {
      key: "manager",
      label: "Manager",
      width: "14%",
      render: (row) =>
        row.branch.manager_name || <span className="text-slate-400">Unassigned</span>,
      text: (row) => row.branch.manager_name || "Unassigned",
    },
    {
      key: "staff",
      label: "Staff",
      width: "6%",
      align: "right",
      render: (row) => money(row.staffCount),
      text: (row) => String(row.staffCount),
    },
    {
      key: "members",
      label: "Members",
      width: "8%",
      align: "right",
      render: (row) => money(row.metrics.members.total),
      text: (row) => String(row.metrics.members.total),
    },
    {
      key: "groups",
      label: "Groups",
      width: "7%",
      align: "right",
      render: (row) => money(row.metrics.groups.total),
      text: (row) => String(row.metrics.groups.total),
    },
    {
      key: "portfolio",
      label: "Portfolio",
      width: "11%",
      align: "right",
      render: (row) => compactUGX(row.metrics.portfolio.outstanding),
      text: (row) => `UGX ${money(row.metrics.portfolio.outstanding)}`,
    },
    {
      key: "savings",
      label: "Savings",
      width: "11%",
      align: "right",
      render: (row) => compactUGX(row.metrics.savings.balance),
      text: (row) => `UGX ${money(row.metrics.savings.balance)}`,
    },
    {
      key: "par30",
      label: "PAR 30",
      width: "8%",
      align: "right",
      render: (row) => (
        <span className={`font-bold ${parTone(row.metrics.portfolio.par30Ratio)}`}>
          {percent(row.metrics.portfolio.par30Ratio)}
        </span>
      ),
      text: (row) => percent(row.metrics.portfolio.par30Ratio),
    },
    {
      key: "status",
      label: "Status",
      width: "8%",
      render: (row) => <StatusPill status={row.branch.status} />,
      text: (row) => row.branch.status,
    },
    {
      key: "act",
      label: "Action",
      width: "9%",
      render: (row) => (
        <BranchActionsMenu
          branch={row.branch}
          canManage={canManage}
          linkedRecords={row.linkedRecords}
          onEdit={() => onEdit(row.branch)}
          onDeactivate={() => onDeactivate(row.branch)}
          onReactivate={() => onReactivate(row.branch)}
          onDelete={() => onDelete(row.branch)}
          compact
        />
      ),
    },
  ];

  // Every column except the action strip sorts, via MisColumn's `header` slot
  // so the plain label still drives the mobile cards.
  const sortableKeys = new Set<string>([
    "branch",
    "code",
    "manager",
    "staff",
    "members",
    "groups",
    "portfolio",
    "savings",
    "par30",
    "status",
  ]);
  const sortableColumns = columns.map((column) =>
    sortableKeys.has(column.key)
      ? { ...column, header: header(column.label, column.key as SortKey) }
      : column,
  );

  return (
    <MisTable
      columns={sortableColumns}
      rows={rows}
      rowKey={(row) => row.branch.id}
      loading={loading}
      emptyMessage="No branches match these filters."
      mobileTitle={(row) => row.branch.branch_name}
      mobileSubtitle={(row) => row.branch.branch_code}
    />
  );
};
