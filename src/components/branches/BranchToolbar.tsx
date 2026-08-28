/**
 * Search, filters and view controls for the branch network list.
 *
 * The filter options are built from the branches actually on file rather than a
 * fixed list, so a region or a manager only appears once something is filed
 * under it.
 */
import React from "react";
import { LayoutGrid, RefreshCw, Rows3, Search, X } from "lucide-react";

export interface BranchFilters {
  search: string;
  status: string;
  region: string;
  managerId: string;
}

export const EMPTY_FILTERS: BranchFilters = {
  search: "",
  status: "All",
  region: "All",
  managerId: "All",
};

export const BranchToolbar: React.FC<{
  filters: BranchFilters;
  onChange: (filters: BranchFilters) => void;
  regions: string[];
  managers: { id: string; name: string }[];
  view: "grid" | "table";
  onViewChange: (view: "grid" | "table") => void;
  onRefresh: () => void;
  refreshing?: boolean;
  resultCount: number;
  totalCount: number;
  exportSlot?: React.ReactNode;
}> = ({
  filters,
  onChange,
  regions,
  managers,
  view,
  onViewChange,
  onRefresh,
  refreshing,
  resultCount,
  totalCount,
  exportSlot,
}) => {
  const set = <K extends keyof BranchFilters>(key: K, value: BranchFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const filtered = resultCount !== totalCount;

  const toggle = (target: "grid" | "table", Icon: React.ElementType, label: string) => (
    <button
      type="button"
      onClick={() => onViewChange(target)}
      aria-pressed={view === target}
      className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-[11px] font-bold transition ${
        view === target
          ? "bg-white text-[#0B4394] shadow-xs"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search branches by name, code, town, district or manager…"
            aria-label="Search branches"
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:shrink-0">
          <label className="sr-only" htmlFor="branch-filter-status">
            Status
          </label>
          <select
            id="branch-filter-status"
            className="form-field lg:w-36"
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="All">Status: All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <label className="sr-only" htmlFor="branch-filter-region">
            Region
          </label>
          <select
            id="branch-filter-region"
            className="form-field lg:w-40"
            value={filters.region}
            onChange={(e) => set("region", e.target.value)}
          >
            <option value="All">Region: All</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
            <option value="__none">Not set</option>
          </select>

          <label className="sr-only" htmlFor="branch-filter-manager">
            Branch manager
          </label>
          <select
            id="branch-filter-manager"
            className="form-field lg:w-44"
            value={filters.managerId}
            onChange={(e) => set("managerId", e.target.value)}
          >
            <option value="All">Manager: All</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
            <option value="__none">Unassigned</option>
          </select>
        </div>

        <div className="flex items-center gap-2 lg:shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {toggle("grid", LayoutGrid, "Grid")}
            {toggle("table", Rows3, "Table")}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Reload branch data"
            aria-label="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {exportSlot}
        </div>
      </div>

      {filtered && (
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{resultCount}</strong> of {totalCount}{" "}
            branches
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="font-bold text-[#0B4394] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};
