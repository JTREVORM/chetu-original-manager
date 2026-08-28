/**
 * Branch Network — the institution at a glance.
 *
 * Every figure on this screen is derived from the loans, receipts, accounts and
 * members already loaded by DatabaseContext, through `branchMetrics`. Nothing is
 * stored per branch and nothing is estimated, so a card can never disagree with
 * the report that reads the same rows.
 */
import React, { useMemo, useState } from "react";
import { Building2, Download, PiggyBank, Plus, TrendingUp, UsersRound, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import type { Branch } from "../types/database.types";
import { branchMetrics, buildBranchSlices, emptySlice, networkMetrics } from "../lib/branchMetrics";
import { money, type MisColumn } from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";
import {
  compactUGX,
  EmptyState,
  KpiCard,
  NoticeBar,
  parTone,
  percent,
  SkeletonCard,
} from "../components/branches/BranchUi";
import { BranchCard } from "../components/branches/BranchCard";
import {
  BranchTable,
  sortRows,
  type BranchRow,
  type SortKey,
} from "../components/branches/BranchTable";
import {
  BranchToolbar,
  EMPTY_FILTERS,
  type BranchFilters,
} from "../components/branches/BranchToolbar";
import { BranchFormDialog } from "../components/branches/BranchForm";
import { DeactivateBranchDialog } from "../components/branches/DeactivateBranchDialog";
import { useStaffDirectory } from "../components/branches/useStaffDirectory";

export const Branches: React.FC = () => {
  const { isAdmin, isAuditor } = useAuth();
  const db = useDatabase();
  const { addToast } = useNotifications();
  const { byBranch: staffByBranch } = useStaffDirectory();

  const canManage = isAdmin && !isAuditor;

  const [filters, setFilters] = useState<BranchFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [sortKey, setSortKey] = useState<SortKey>("branch");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [refreshing, setRefreshing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formBranch, setFormBranch] = useState<Branch | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);

  const branches = db.branches;

  const rows: BranchRow[] = useMemo(() => {
    const slices = buildBranchSlices(
      {
        clients: db.clients,
        clientGroups: db.clientGroups,
        loans: db.loans,
        loanApplications: db.loanApplications,
        repayments: db.repayments,
        savingsAccounts: db.savingsAccounts,
        savingsTransactions: db.savingsTransactions,
        expenses: db.expenses,
        bankTransactions: db.bankTransactions,
      },
      branches.map((b) => b.id),
    );
    return branches.map((branch) => ({
      branch,
      metrics: branchMetrics(slices.get(branch.id) || emptySlice(branch.id), db.loanProducts),
      staffCount: staffByBranch.get(branch.id)?.length ?? 0,
      linkedRecords: db.branchLinkedRecordCount(branch.id),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    branches,
    db.clients,
    db.clientGroups,
    db.loans,
    db.loanApplications,
    db.repayments,
    db.savingsAccounts,
    db.savingsTransactions,
    db.expenses,
    db.bankTransactions,
    db.loanProducts,
    staffByBranch,
  ]);

  const network = useMemo(
    () => networkMetrics(rows.map((row) => ({ status: row.branch.status, metrics: row.metrics }))),
    [rows],
  );

  const regions = useMemo(
    () => [...new Set(branches.map((b) => b.region).filter((r): r is string => Boolean(r)))].sort(),
    [branches],
  );

  const managers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const branch of branches) {
      if (branch.manager_id && branch.manager_name)
        seen.set(branch.manager_id, branch.manager_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches]);

  const filteredRows = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const matched = rows.filter(({ branch }) => {
      if (filters.status !== "All" && branch.status !== filters.status) return false;
      if (filters.region === "__none" && branch.region) return false;
      if (
        filters.region !== "All" &&
        filters.region !== "__none" &&
        branch.region !== filters.region
      )
        return false;
      if (filters.managerId === "__none" && branch.manager_id) return false;
      if (
        filters.managerId !== "All" &&
        filters.managerId !== "__none" &&
        branch.manager_id !== filters.managerId
      )
        return false;
      if (!term) return true;
      return [
        branch.branch_name,
        branch.branch_code,
        branch.town,
        branch.district,
        branch.region,
        branch.manager_name,
        branch.location,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
    return sortRows(matched, sortKey, sortDirection);
  }, [rows, filters, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection(
        key === "branch" || key === "code" || key === "manager" || key === "status"
          ? "asc"
          : "desc",
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await db.refetch({ silent: true });
      addToast("info", "Branch data refreshed", "Figures are current as of now.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleReactivate = async (branch: Branch) => {
    try {
      await db.reactivateBranch(branch.id);
      addToast(
        "success",
        "Branch reactivated",
        `${branch.branch_name} is open for operations again.`,
      );
    } catch (error) {
      addToast(
        "error",
        "Could not reactivate",
        error instanceof Error ? error.message : "The branch was not changed.",
      );
    }
  };

  const handleDelete = async (branch: Branch) => {
    try {
      await db.deleteBranch(branch.id);
      addToast("success", "Branch removed", `${branch.branch_name} was deleted.`);
    } catch (error) {
      addToast(
        "error",
        "Could not delete",
        error instanceof Error ? error.message : "The branch was not removed.",
      );
    } finally {
      setConfirmDelete(null);
    }
  };

  const openCreate = () => {
    setFormMode("create");
    setFormBranch(null);
    setFormOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setFormMode("edit");
    setFormBranch(branch);
    setFormOpen(true);
  };

  // Export mirrors the table view, minus the action column.
  const exportColumns: MisColumn<BranchRow>[] = [
    {
      key: "branch",
      label: "Branch",
      render: (r) => r.branch.branch_name,
      text: (r) => r.branch.branch_name,
    },
    {
      key: "code",
      label: "Code",
      render: (r) => r.branch.branch_code,
      text: (r) => r.branch.branch_code,
    },
    {
      key: "type",
      label: "Type",
      render: (r) => r.branch.branch_type,
      text: (r) => r.branch.branch_type || "",
    },
    {
      key: "region",
      label: "Region",
      render: (r) => r.branch.region || "",
      text: (r) => r.branch.region || "",
    },
    {
      key: "manager",
      label: "Manager",
      render: (r) => r.branch.manager_name || "",
      text: (r) => r.branch.manager_name || "Unassigned",
    },
    {
      key: "staff",
      label: "Staff",
      render: (r) => r.staffCount,
      text: (r) => String(r.staffCount),
    },
    {
      key: "members",
      label: "Members",
      render: (r) => r.metrics.members.total,
      text: (r) => String(r.metrics.members.total),
    },
    {
      key: "groups",
      label: "Groups",
      render: (r) => r.metrics.groups.total,
      text: (r) => String(r.metrics.groups.total),
    },
    {
      key: "loans",
      label: "Active loans",
      render: (r) => r.metrics.loans.active,
      text: (r) => String(r.metrics.loans.active),
    },
    {
      key: "portfolio",
      label: "Outstanding (UGX)",
      render: (r) => money(r.metrics.portfolio.outstanding),
      text: (r) => money(r.metrics.portfolio.outstanding),
    },
    {
      key: "savings",
      label: "Savings (UGX)",
      render: (r) => money(r.metrics.savings.balance),
      text: (r) => money(r.metrics.savings.balance),
    },
    {
      key: "par30",
      label: "PAR 30",
      render: (r) => percent(r.metrics.portfolio.par30Ratio),
      text: (r) => percent(r.metrics.portfolio.par30Ratio),
    },
    {
      key: "collections",
      label: "Collections today (UGX)",
      render: (r) => money(r.metrics.collections.today),
      text: (r) => money(r.metrics.collections.today),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => r.branch.status,
      text: (r) => r.branch.status,
    },
  ];

  const loading = db.isLoading && branches.length === 0;

  return (
    <div className="space-y-5 pb-12">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0B4394]/10 text-[#0B4394]">
              <Building2 className="h-4 w-4" />
            </span>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Branch Network
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Manage all branches, view performance and operational overview.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReportExportButtons
            title="Branch Network"
            columns={exportColumns}
            rows={filteredRows}
            period={`As at ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
            subtitle="Chetu Microfinance Ltd — branch performance summary"
            totals={[
              ["Outstanding portfolio", `UGX ${money(network.outstanding)}`],
              ["Total savings", `UGX ${money(network.savings)}`],
              ["PAR 30", percent(network.par30Ratio)],
            ]}
          />
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672]"
            >
              <Plus className="h-4 w-4" />
              New Branch
            </button>
          )}
        </div>
      </header>

      {/* Six across only on a genuinely wide screen — at laptop widths the
          sidebar leaves each of six cards too narrow for its own label. */}
      <section
        aria-label="Network summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        <KpiCard
          label="Total Branches"
          value={money(network.branchesTotal)}
          hint="All branches"
          icon={Building2}
        />
        <KpiCard
          label="Active Branches"
          value={money(network.branchesActive)}
          hint={`${percent(network.activeShare, 1)} of total`}
          icon={Building2}
          tone="emerald"
        />
        <KpiCard
          label="Total Members"
          value={money(network.members)}
          hint="Across all branches"
          icon={UsersRound}
        />
        <KpiCard
          label="Outstanding Loans"
          value={compactUGX(network.outstanding)}
          hint="Total portfolio"
          icon={Wallet}
          tone="navy"
        />
        <KpiCard
          label="Total Savings"
          value={compactUGX(network.savings)}
          hint="Total savings held"
          icon={PiggyBank}
          tone="emerald"
        />
        <KpiCard
          label="PAR 30"
          value={<span className={parTone(network.par30Ratio)}>{percent(network.par30Ratio)}</span>}
          hint={`UGX ${money(network.par30Amount)} at risk`}
          icon={TrendingUp}
          tone={network.par30Ratio <= 5 ? "emerald" : network.par30Ratio <= 10 ? "amber" : "red"}
        />
      </section>

      <BranchToolbar
        filters={filters}
        onChange={setFilters}
        regions={regions}
        managers={managers}
        view={view}
        onViewChange={setView}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        resultCount={filteredRows.length}
        totalCount={rows.length}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No branches yet"
          message="Create the first branch to start admitting members, forming groups and assigning loan officers."
          action={
            canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672]"
              >
                <Plus className="h-4 w-4" /> New Branch
              </button>
            ) : undefined
          }
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No branches match these filters"
          message="Try a different search term, or clear the filters to see the whole network."
          action={
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-4 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
            >
              Clear filters
            </button>
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredRows.map((row) => (
            <BranchCard
              key={row.branch.id}
              branch={row.branch}
              metrics={row.metrics}
              staffCount={row.staffCount}
              canManage={canManage}
              linkedRecords={row.linkedRecords}
              onEdit={() => openEdit(row.branch)}
              onDeactivate={() => setDeactivating(row.branch)}
              onReactivate={() => handleReactivate(row.branch)}
              onDelete={() => setConfirmDelete(row.branch)}
            />
          ))}
        </div>
      ) : (
        <BranchTable
          rows={filteredRows}
          canManage={canManage}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          onEdit={openEdit}
          onDeactivate={setDeactivating}
          onReactivate={handleReactivate}
          onDelete={setConfirmDelete}
        />
      )}

      <BranchFormDialog
        open={formOpen}
        mode={formMode}
        branch={formBranch}
        onClose={() => setFormOpen(false)}
      />

      <DeactivateBranchDialog
        open={Boolean(deactivating)}
        branch={deactivating}
        onClose={() => setDeactivating(null)}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-900">
              Delete {confirmDelete.branch_name}?
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
              This branch holds no members, groups or ledger entries, so it can be removed outright.
              This cannot be undone.
            </p>
            <div className="mt-3">
              <NoticeBar tone="amber">
                If this branch is simply no longer in use, deactivate it instead — that keeps the
                record and its history.
              </NoticeBar>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-[12px] font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-chetu-red px-4 text-[12px] font-bold text-white hover:bg-chetu-darkred"
              >
                Delete branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
