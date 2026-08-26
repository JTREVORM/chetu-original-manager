import React, { useEffect, useMemo, useState } from 'react';
import { Search, Inbox, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';

export const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const money2 = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const todayISO = () => new Date().toISOString().split('T')[0];
export const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};
export const shortDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export interface OfficerRow {
  id: string;
  full_name: string;
  branch_ids: string[] | null;
  status: string;
}

/** Role-aware branch / loan-officer / group scope used by every MIS list screen. */
export function useMisScope() {
  const { branches, clientGroups } = useDatabase();
  const { user, role } = useAuth();

  const isLoanOfficer = role === 'Loan Officer';
  const isBranchManager = role === 'Branch Manager';
  const isAdmin = role === 'Administrator';
  const isAuditor = role === 'Auditor';

  const branchLocked = isBranchManager || isLoanOfficer;
  const officerLocked = isLoanOfficer;

  const myBranches = user?.branch_ids ?? [];
  const myBranchKey = myBranches.join(',');

  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [officerId, setOfficerId] = useState(isLoanOfficer ? user?.id || '' : '');
  const [groupId, setGroupId] = useState('');

  const activeBranches = useMemo(() => {
    const list = branches.filter((b) => b.status === 'Active');
    if (isAdmin || isAuditor) return list;
    return myBranches.length ? list.filter((b) => myBranches.includes(b.id)) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, isAdmin, isAuditor, myBranchKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, branch_ids, status')
        .eq('role', 'Loan Officer')
        .order('full_name');
      if (!cancelled) setOfficers(((data || []) as OfficerRow[]).filter((o) => o.status === 'Active'));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (branchLocked) setBranchId((prev) => prev || myBranches[0] || activeBranches[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLocked, myBranchKey, activeBranches.length]);

  useEffect(() => {
    if (officerLocked && user?.id) setOfficerId(user.id);
  }, [officerLocked, user?.id]);

  const officerOptions = useMemo(
    () => officers.filter((o) => !branchId || (o.branch_ids || []).includes(branchId)),
    [officers, branchId],
  );

  const groupOptions = useMemo(
    () =>
      clientGroups.filter(
        (g) =>
          g.status === 'Active' &&
          g.approval_status === 'Approved' &&
          (!branchId || g.branch_id === branchId) &&
          (isLoanOfficer
            ? g.loan_officer_id === user?.id
            : !officerId || !g.loan_officer_id || g.loan_officer_id === officerId),
      ),
    [clientGroups, branchId, officerId, isLoanOfficer, user?.id],
  );

  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.branch_name || '—';
  const officerName = (id?: string | null) => officers.find((o) => o.id === id)?.full_name || '—';

  return {
    user,
    role,
    isAdmin,
    isAuditor,
    isBranchManager,
    isLoanOfficer,
    branchLocked,
    officerLocked,
    myBranches,
    officers,
    activeBranches,
    officerOptions,
    groupOptions,
    branchId,
    setBranchId,
    officerId,
    setOfficerId,
    groupId,
    setGroupId,
    branchName,
    officerName,
    lockedBranchName: branchName(branchId),
    lockedOfficerName: user?.full_name || '—',
  };
}

/**
 * Page heading. On mobile the original UMIS screens put the title inside the
 * white filter card rather than above it, so `MisFilters` renders its own copy
 * and this one hides itself there; the export buttons stay visible on both.
 */
export const MisPageTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    <h1 className="hidden min-w-0 truncate text-lg font-bold text-slate-900 md:block md:text-xl">{children}</h1>
    <span className="md:hidden" />
    {right && <div className="col-start-2 shrink-0">{right}</div>}
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className = '',
}) => (
  <div className={className}>
    <label className="form-label">{label}</label>
    {children}
  </div>
);

export const SearchButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Search' }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-4 text-base font-semibold text-white hover:bg-[#093672] sm:mt-0 sm:h-[34px] sm:rounded sm:text-[12px] sm:font-bold"
  >
    <SlidersHorizontal className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
    {label}
  </button>
);

/** Filter panel: responsive grid of controls + optional wide search input row. */
const COL_CLASS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

/** Filter panel: responsive grid of controls + optional wide search input row. */
export const MisFilters: React.FC<{
  children: React.ReactNode;
  cols?: number;
  /** Shown at the top of the card on mobile, as the original UMIS screens do. */
  title?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  onSubmit?: () => void;
}> = ({ children, cols = 4, title, searchValue, onSearchChange, searchPlaceholder, onSubmit }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs sm:p-4">
    {title && <h1 className="mb-4 text-2xl font-bold text-slate-900 md:hidden">{title}</h1>}
    <div className={`grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2 ${COL_CLASS[cols] || 'lg:grid-cols-4'}`}>
      {children}
    </div>
    {onSearchChange && (
      <div className="mt-3 flex items-center gap-2">
        <input
          value={searchValue || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          placeholder={searchPlaceholder || 'Search…'}
          className="form-field flex-1"
        />
        <button
          type="button"
          onClick={() => onSubmit?.()}
          aria-label="Search records"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#0B4394] text-white hover:bg-[#093672] sm:h-[34px] sm:w-10 sm:rounded sm:border sm:border-slate-300 sm:bg-white sm:text-slate-600 sm:hover:bg-slate-50"
        >
          <Search className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>
    )}
  </div>
);

export interface MisColumn<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
  /** plain text used for the truncation tooltip and mobile card value */
  text?: (row: T) => string;
  hideOnMobile?: boolean;
  /**
   * Renders as a button strip at the foot of the mobile card rather than as a
   * "Label :Value" line. Inferred for the conventional Action / select columns.
   */
  isAction?: boolean;
}

const ACTION_KEYS = new Set(['act', 'action', 'actions', 'pick']);
const isActionColumn = <T,>(c: MisColumn<T>) =>
  c.isAction ?? (ACTION_KEYS.has(c.key) || c.label === 'Action' || c.label === '');

const PAGE_SIZES = [10, 25, 50, 100];

/** Desktop fixed-layout table (no word wrapping) + mobile stacked cards. */
export function MisTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  hasSearched = true,
  emptyMessage = 'No details found!',
  idleMessage = 'Choose your filters and press Search.',
  mobileTitle,
  mobileSubtitle,
  footer,
}: {
  columns: MisColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  hasSearched?: boolean;
  emptyMessage?: string;
  idleMessage?: string;
  mobileTitle?: (row: T) => React.ReactNode;
  mobileSubtitle?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const showIdle = !loading && !hasSearched;
  const showEmpty = !loading && hasSearched && rows.length === 0;

  // Action buttons move to their own strip on mobile, so they are separated
  // from the columns that render as "Label :Value" lines.
  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const actionColumns = mobileColumns.filter(isActionColumn);
  const dataColumns = mobileColumns.filter((c) => !isActionColumn(c));

  const [pageSize, setPageSize] = useState<number>(100);
  const [page, setPage] = useState(1);

  // A new result set always starts at the first page.
  useEffect(() => { setPage(1); }, [rows.length]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstShown = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastShown = Math.min(safePage * pageSize, rows.length);

  return (
    <>
      <div className="hidden rounded-lg border border-slate-200 bg-white shadow-xs md:block">
        <table className="w-full table-fixed text-left text-[11px]">
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr className="[&>th]:whitespace-nowrap">
              {columns.map((c) => (
                <th key={c.key} className={`px-2 py-2.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {(showIdle || showEmpty) && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                  <Inbox className="mx-auto mb-2 h-6 w-6" />
                  {showIdle ? idleMessage : emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              visibleRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="hover:bg-slate-50 [&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      title={c.text ? c.text(row) : undefined}
                      className={`px-2 py-2.5 text-slate-700 ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
          {!loading && rows.length > 0 && footer}
        </table>
      </div>

      {/*
        Mobile presentation mirrors the original UMIS screens: each record is a
        pale blue panel of "Label :Value" lines, with the row's action buttons
        gathered into a right-aligned strip at the foot of the panel.
      */}
      <div className="space-y-2.5 md:hidden">
        {loading && (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-slate-400">Loading…</div>
        )}
        {(showIdle || showEmpty) && (
          <div className="rounded-lg bg-white p-8 text-center">
            <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">{showIdle ? 'No results yet' : emptyMessage}</p>
            {showIdle && <p className="mt-1 text-xs text-slate-400">{idleMessage}</p>}
          </div>
        )}
        {!loading &&
          visibleRows.map((row) => (
            <div key={rowKey(row)} className="rounded-lg bg-[#eaf1f8] px-4 py-3">
              {dataColumns.map((c) => (
                <p key={c.key} className="py-[3px] text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">{c.label} :</span>
                  <span className="ml-1 break-words">{c.render(row)}</span>
                </p>
              ))}
              {actionColumns.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {actionColumns.map((c) => (
                    <React.Fragment key={c.key}>{c.render(row)}</React.Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}

      </div>

      {/* Pagination applies to both views, so it sits outside the mobile block. */}
      {!loading && rows.length > 0 && (
        <div className="space-y-2 pt-1 text-center">
            <div className="flex items-center justify-center gap-2 text-[13px] text-slate-700">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px]"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>entries</span>
            </div>
            <p className="text-[13px] text-slate-600">
              Showing {firstShown} to {lastShown} of {rows.length} entries
            </p>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-[13px] text-slate-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
        </div>
      )}
    </>
  );
}

/**
 * One record as a pale blue panel of "Label :Value" lines — the same shape
 * `MisTable` uses on mobile, for the screens that build their own lists
 * (the instalment schedule, the guarantor picker) instead of driving a table.
 */
export const MisDataCard: React.FC<{
  rows: { label: string; value: React.ReactNode }[];
  footer?: React.ReactNode;
  className?: string;
}> = ({ rows, footer, className = '' }) => (
  <div className={`rounded-lg bg-[#eaf1f8] px-4 py-3 ${className}`}>
    {rows.map((r) => (
      <p key={r.label} className="py-[3px] text-[13px] leading-snug text-slate-900">
        <span className="font-bold">{r.label} :</span>
        <span className="ml-1 break-words">{r.value}</span>
      </p>
    ))}
    {footer && <div className="mt-2 flex items-center justify-end gap-2">{footer}</div>}
  </div>
);

/** Simple centered modal shell used by the info / re-admission / upload dialogs. */
export const MisModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, children, width = 'max-w-3xl' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
      <div className={`w-full ${width} rounded-lg bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-chetu-red"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};

export const ActionButton: React.FC<{
  onClick: () => void;
  title: string;
  tone?: 'blue' | 'amber' | 'green' | 'navy' | 'red';
  children: React.ReactNode;
}> = ({ onClick, title, tone = 'blue', children }) => {
  const tones: Record<string, string> = {
    blue: 'bg-sky-500 hover:bg-sky-600',
    amber: 'bg-amber-500 hover:bg-amber-600',
    green: 'bg-emerald-500 hover:bg-emerald-600',
    navy: 'bg-[#0B4394] hover:bg-[#093672]',
    red: 'bg-chetu-red hover:opacity-90',
  };
  // Touch-sized on mobile, matching the original's button strip; compact in the
  // desktop table where the rows are dense.
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-white [&>svg]:h-5 [&>svg]:w-5 md:h-6 md:w-6 md:rounded md:[&>svg]:h-3.5 md:[&>svg]:w-3.5 ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

/** Branch / Loan Officer / Group selects with the standard role locking applied. */
export const ScopeFields: React.FC<{
  scope: ReturnType<typeof useMisScope>;
  withGroup?: boolean;
  groupRequired?: boolean;
}> = ({ scope, withGroup = true }) => (
  <>
    <Field label="Select Branch">
      {scope.branchLocked ? (
        <input readOnly value={scope.lockedBranchName} className="form-field bg-slate-100" />
      ) : (
        <select
          value={scope.branchId}
          onChange={(e) => {
            scope.setBranchId(e.target.value);
            scope.setOfficerId('');
            scope.setGroupId('');
          }}
          className="form-field"
        >
          <option value="">-- Select --</option>
          {scope.activeBranches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branch_name}
            </option>
          ))}
        </select>
      )}
    </Field>

    <Field label="Loan Officer">
      {scope.officerLocked ? (
        <input readOnly value={scope.lockedOfficerName} className="form-field bg-slate-100" />
      ) : (
        <select
          value={scope.officerId}
          onChange={(e) => {
            scope.setOfficerId(e.target.value);
            scope.setGroupId('');
          }}
          className="form-field"
        >
          <option value="">-- Select --</option>
          {scope.officerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name}
            </option>
          ))}
        </select>
      )}
    </Field>

    {withGroup && (
      <Field label="Select Group">
        <select value={scope.groupId} onChange={(e) => scope.setGroupId(e.target.value)} className="form-field">
          <option value="">-- Select --</option>
          {scope.groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.group_name} ({g.group_code})
            </option>
          ))}
        </select>
      </Field>
    )}
  </>
);
