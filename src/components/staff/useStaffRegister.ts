/**
 * The staff register: reading it, counting it and filtering it.
 *
 * Everything comes from `public.staff_directory`, a view that joins each
 * profile to today's business day for their branch and to their own officer
 * day. It is declared `security_invoker`, so the row level security on all
 * three underlying tables still applies — a Branch Manager reading this hook
 * gets their own branch's staff and nobody else's, without the screen having
 * to remember to filter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import type { StaffStatus, UserRole } from "../../types/database.types";

export interface StaffDirectoryRow {
  id: string;
  staff_code: string | null;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  role: UserRole;
  status: StaffStatus;
  avatar_url: string | null;
  branch_ids: string[] | null;
  primary_branch_id: string | null;
  date_joined: string | null;
  last_login_at: string | null;
  last_password_change_at: string | null;
  failed_login_attempts: number | null;
  must_change_password: boolean | null;
  two_factor_enabled: boolean | null;
  status_reason: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string | null;
  primary_branch_name: string | null;
  primary_branch_code: string | null;
  business_day_status: string | null;
  business_date: string | null;
  officer_day_status: string | null;
  officer_day_submitted_at: string | null;
  officer_day_rejection_reason: string | null;
}

export type LastLoginWindow = "all" | "today" | "7d" | "30d" | "never";

export interface StaffFilters {
  search: string;
  role: "All" | UserRole;
  branch: string;
  status: "All" | StaffStatus;
  lastLogin: LastLoginWindow;
}

export const EMPTY_STAFF_FILTERS: StaffFilters = {
  search: "",
  role: "All",
  branch: "All",
  status: "All",
  lastLogin: "all",
};

export const hasActiveFilters = (f: StaffFilters) =>
  f.search.trim() !== "" ||
  f.role !== "All" ||
  f.branch !== "All" ||
  f.status !== "All" ||
  f.lastLogin !== "all";

export interface StaffStats {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  inactive: number;
  loanOfficers: number;
  branchManagers: number;
  administrators: number;
  auditors: number;
  /** Officer days waiting on a manager's decision, right now. */
  pendingRequests: number;
}

/** Loads the register and keeps it in step with the header's Refresh. */
export function useStaffRegister(dataVersion: number) {
  const [rows, setRows] = useState<StaffDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (options?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: readError } = await supabase
      .from("staff_directory")
      .select("*")
      .order("full_name");

    if (readError) {
      setError(readError.message);
    } else {
      setRows((data || []) as StaffDirectoryRow[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  return { rows, loading, refreshing, error, reload: load, setRows };
}

/** Real counts, from the rows actually on file — never a typed-in number. */
export function computeStaffStats(rows: StaffDirectoryRow[]): StaffStats {
  const byStatus = (s: StaffStatus) => rows.filter((r) => r.status === s).length;
  const byRole = (r: UserRole) => rows.filter((row) => row.role === r).length;
  return {
    total: rows.length,
    active: byStatus("Active"),
    pending: byStatus("Pending"),
    suspended: byStatus("Suspended"),
    inactive: byStatus("Inactive"),
    loanOfficers: byRole("Loan Officer"),
    branchManagers: byRole("Branch Manager"),
    administrators: byRole("Administrator"),
    auditors: byRole("Auditor"),
    pendingRequests: rows.filter(
      (r) => r.officer_day_status === "SUBMITTED" || r.officer_day_status === "PENDING_APPROVAL",
    ).length,
  };
}

const withinWindow = (value: string | null, window: LastLoginWindow): boolean => {
  if (window === "all") return true;
  if (window === "never") return !value;
  if (!value) return false;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return false;
  if (window === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return then >= start.getTime();
  }
  const days = window === "7d" ? 7 : 30;
  return then >= Date.now() - days * 86400000;
};

/**
 * Filters compose: role, branch, status and last-login narrow together, and the
 * search runs over the four things an administrator actually types — a name, a
 * staff number, a phone number or an email address.
 */
export function filterStaff(rows: StaffDirectoryRow[], filters: StaffFilters): StaffDirectoryRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.role !== "All" && row.role !== filters.role) return false;
    if (filters.status !== "All" && row.status !== filters.status) return false;
    if (filters.branch !== "All") {
      const attached = row.branch_ids || [];
      if (filters.branch === "__none") {
        if (attached.length > 0) return false;
      } else if (!attached.includes(filters.branch)) {
        return false;
      }
    }
    if (!withinWindow(row.last_login_at, filters.lastLogin)) return false;
    if (!query) return true;
    return [row.full_name, row.staff_code, row.phone_number, row.email, row.primary_branch_name]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });
}

/** Debounces the search box so a fast typist does not re-filter on every key. */
export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Filters plus their debounced search term, ready for `filterStaff`. */
export function useFilteredStaff(rows: StaffDirectoryRow[], filters: StaffFilters) {
  const debouncedSearch = useDebounced(filters.search);
  return useMemo(
    () => filterStaff(rows, { ...filters, search: debouncedSearch }),
    [rows, filters, debouncedSearch],
  );
}
