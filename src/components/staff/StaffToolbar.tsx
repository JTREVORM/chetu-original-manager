/**
 * Search, filters and export for the staff register.
 *
 * The branch list is built from the branches actually on file rather than a
 * fixed list, and the export always carries whatever the filters currently
 * show — an export that quietly widens the selection is worse than no export.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Table2,
  X,
} from "lucide-react";
import type { Branch } from "../../types/database.types";
import { EMPTY_STAFF_FILTERS, hasActiveFilters, type StaffFilters } from "./useStaffRegister";
import { STAFF_ROLES, STAFF_STATUSES } from "./StaffUi";

export const StaffExportMenu: React.FC<{
  onExport: (format: "excel" | "csv" | "pdf") => void;
  disabled?: boolean;
  count: number;
}> = ({ onExport, disabled, count }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {count} record{count === 1 ? "" : "s"} in view
          </p>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onExport("excel");
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel workbook
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onExport("csv");
            }}
          >
            <Table2 className="h-3.5 w-3.5 text-slate-400" /> CSV file
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onExport("pdf");
            }}
          >
            <FileText className="h-3.5 w-3.5 text-chetu-red" /> PDF document
          </button>
        </div>
      )}
    </div>
  );
};

export const StaffToolbar: React.FC<{
  filters: StaffFilters;
  onChange: (filters: StaffFilters) => void;
  branches: Branch[];
  /** A Branch Manager sees only their own branches, so the select is locked. */
  branchLocked?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  resultCount: number;
  totalCount: number;
  onExport: (format: "excel" | "csv" | "pdf") => void;
}> = ({
  filters,
  onChange,
  branches,
  branchLocked,
  onRefresh,
  refreshing,
  resultCount,
  totalCount,
  onExport,
}) => {
  const set = <K extends keyof StaffFilters>(key: K, value: StaffFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const filtered = hasActiveFilters(filters);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search staff by name, Staff ID, phone or email…"
            aria-label="Search staff"
            className="form-field pl-9"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set("search", "")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-auto xl:shrink-0">
          <div>
            <label className="sr-only" htmlFor="staff-filter-role">
              Role
            </label>
            <select
              id="staff-filter-role"
              className="form-field xl:w-40"
              value={filters.role}
              onChange={(e) => set("role", e.target.value as StaffFilters["role"])}
            >
              <option value="All">All Roles</option>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="staff-filter-branch">
              Branch
            </label>
            <select
              id="staff-filter-branch"
              className="form-field xl:w-40 disabled:bg-slate-100"
              value={filters.branch}
              disabled={branchLocked && branches.length <= 1}
              onChange={(e) => set("branch", e.target.value)}
            >
              <option value="All">All Branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branch_name}
                </option>
              ))}
              <option value="__none">Not attached</option>
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="staff-filter-status">
              Status
            </label>
            <select
              id="staff-filter-status"
              className="form-field xl:w-36"
              value={filters.status}
              onChange={(e) => set("status", e.target.value as StaffFilters["status"])}
            >
              <option value="All">All Status</option>
              {STAFF_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="staff-filter-login">
              Last login
            </label>
            <select
              id="staff-filter-login"
              className="form-field xl:w-40"
              value={filters.lastLogin}
              onChange={(e) => set("lastLogin", e.target.value as StaffFilters["lastLogin"])}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="never">Never Logged In</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 xl:shrink-0">
          <button
            type="button"
            onClick={() => onChange(EMPTY_STAFF_FILTERS)}
            disabled={!filtered}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Reload the staff register"
            aria-label="Refresh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <StaffExportMenu onExport={onExport} count={resultCount} disabled={resultCount === 0} />
        </div>
      </div>

      {filtered && (
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{resultCount}</strong> of {totalCount} staff
          </span>
        </div>
      )}
    </div>
  );
};
