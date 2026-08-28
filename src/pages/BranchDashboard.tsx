/**
 * One branch, in full.
 *
 * Everything on this page is derived from the branch's own slice of the already
 * loaded tables, so a manager reading it sees the same figures the network list
 * and the reports produce.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  ChevronRight,
  FileText,
  HandCoins,
  LayoutDashboard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PiggyBank,
  Power,
  Settings,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useNavigate } from "../lib/router-compat";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { branchMetrics, buildBranchSlices, emptySlice } from "../lib/branchMetrics";
import { money } from "../components/mis/MisKit";
import {
  compactUGX,
  EmptyState,
  NoticeBar,
  parTone,
  percent,
  StatusPill,
} from "../components/branches/BranchUi";
import { BranchFormDialog } from "../components/branches/BranchForm";
import { DeactivateBranchDialog } from "../components/branches/DeactivateBranchDialog";
import { useStaffDirectory } from "../components/branches/useStaffDirectory";
import type { BranchTab } from "../components/branches/BranchActionsMenu";
import { BranchOverview } from "../components/branches/tabs/BranchOverview";
import { BranchStaff } from "../components/branches/tabs/BranchStaff";
import { BranchMembers } from "../components/branches/tabs/BranchMembers";
import { BranchGroups } from "../components/branches/tabs/BranchGroups";
import { BranchLoans } from "../components/branches/tabs/BranchLoans";
import { BranchSavings } from "../components/branches/tabs/BranchSavings";
import { BranchCollections } from "../components/branches/tabs/BranchCollections";
import { BranchCash } from "../components/branches/tabs/BranchCash";
import { BranchReports } from "../components/branches/tabs/BranchReports";
import { BranchSettings } from "../components/branches/tabs/BranchSettings";

const TABS: { id: BranchTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "staff", label: "Staff", icon: Users },
  { id: "members", label: "Members", icon: UsersRound },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "loans", label: "Loans", icon: HandCoins },
  { id: "savings", label: "Savings", icon: PiggyBank },
  { id: "collections", label: "Collections", icon: Banknote },
  { id: "cash", label: "Cash", icon: Wallet },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

const isTab = (value: string | null): value is BranchTab => TABS.some((tab) => tab.id === value);

export const BranchDashboard: React.FC<{ branchId: string }> = ({ branchId }) => {
  const navigate = useNavigate();
  const { user, isAdmin, isAuditor } = useAuth();
  const db = useDatabase();
  const { addToast } = useNotifications();
  const { staff, byBranch, canReadDirectory } = useStaffDirectory();

  const canManage = isAdmin && !isAuditor;

  const initialTab = (() => {
    if (typeof window === "undefined") return "overview";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return isTab(requested) ? requested : "overview";
  })();

  const [tab, setTab] = useState<BranchTab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // DatabaseContext fetches once on mount — before Supabase has restored the
  // session, so those reads come back empty — and again once the user is known.
  // Until a fetch has completed *with* a signed-in user we have not really
  // looked for this branch, and saying "not found" would be wrong.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (user?.id && !db.isLoading && db.dataVersion > 0) setSettled(true);
  }, [user?.id, db.isLoading, db.dataVersion]);

  const branch = db.branches.find((b) => b.id === branchId) || null;

  const slice = useMemo(() => {
    if (!branch) return null;
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
      [branch.id],
    );
    return slices.get(branch.id) || emptySlice(branch.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    branch?.id,
    db.clients,
    db.clientGroups,
    db.loans,
    db.loanApplications,
    db.repayments,
    db.savingsAccounts,
    db.savingsTransactions,
    db.expenses,
    db.bankTransactions,
  ]);

  const metrics = useMemo(
    () => (slice ? branchMetrics(slice, db.loanProducts) : null),
    [slice, db.loanProducts],
  );

  const selectTab = (next: BranchTab) => {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url);
    }
  };

  const handleReactivate = async () => {
    if (!branch) return;
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

  if (!branch && !settled) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!branch || !slice || !metrics) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/branches")}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#0B4394] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Branch Network
        </button>
        <EmptyState
          icon={Building2}
          title="Branch not found"
          message="This branch either does not exist or is not one you have access to."
          action={
            <button
              type="button"
              onClick={() => navigate("/branches")}
              className="inline-flex h-9 items-center rounded-lg bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672]"
            >
              Back to Branch Network
            </button>
          }
        />
      </div>
    );
  }

  const tabProps = {
    branch,
    slice,
    metrics,
    staff,
    branchStaff: byBranch.get(branch.id) || [],
    canReadDirectory,
    canManage,
  };

  const headline = [
    { label: "Members", value: money(metrics.members.total) },
    { label: "Groups", value: money(metrics.groups.total) },
    { label: "Active loans", value: money(metrics.loans.active) },
    { label: "Portfolio", value: compactUGX(metrics.portfolio.outstanding) },
    { label: "Savings", value: compactUGX(metrics.savings.balance) },
    {
      label: "PAR 30",
      value: (
        <span className={parTone(metrics.portfolio.par30Ratio)}>
          {percent(metrics.portfolio.par30Ratio)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-12">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => navigate("/branches")}
          className="font-semibold text-[#0B4394] hover:underline"
        >
          Branch Network
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate font-semibold text-slate-700">{branch.branch_name}</span>
      </nav>

      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {branch.branch_name}
              </h1>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                {branch.branch_code}
              </span>
              <StatusPill status={branch.status} />
              {branch.branch_type && (
                <span className="text-[11px] font-medium text-slate-500">{branch.branch_type}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#0B4394]" />
                {[branch.physical_address, branch.town, branch.district]
                  .filter(Boolean)
                  .join(", ") ||
                  branch.location ||
                  "Location not recorded"}
              </span>
              {branch.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-[#0B4394]" />
                  {branch.phone}
                </span>
              )}
              {branch.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#0B4394]" />
                  {branch.email}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5 text-[#0B4394]" />
                Branch Manager: {branch.manager_name || "Unassigned"}
              </span>
            </div>
          </div>

          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Branch
              </button>
              {branch.status === "Active" ? (
                <button
                  type="button"
                  onClick={() => setDeactivating(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-bold text-chetu-red hover:bg-red-100"
                >
                  <Power className="h-3.5 w-3.5" /> Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReactivate}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  <Power className="h-3.5 w-3.5" /> Reactivate
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-6">
          {headline.map((item) => (
            <div key={item.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </header>

      {branch.status !== "Active" && (
        <NoticeBar tone="amber">
          This branch is deactivated
          {branch.deactivation_reason ? `: ${branch.deactivation_reason}` : "."} Its records remain
          available, but no new operations should be processed under it.
        </NoticeBar>
      )}

      <div className="border-b border-slate-200">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-bold transition ${
                  active
                    ? "border-[#0B4394] text-[#0B4394]"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {tab === "overview" && <BranchOverview {...tabProps} />}
        {tab === "staff" && <BranchStaff {...tabProps} />}
        {tab === "members" && <BranchMembers {...tabProps} />}
        {tab === "groups" && <BranchGroups {...tabProps} />}
        {tab === "loans" && <BranchLoans {...tabProps} />}
        {tab === "savings" && <BranchSavings {...tabProps} />}
        {tab === "collections" && <BranchCollections {...tabProps} />}
        {tab === "cash" && <BranchCash {...tabProps} />}
        {tab === "reports" && <BranchReports {...tabProps} />}
        {tab === "settings" && (
          <BranchSettings
            {...tabProps}
            onEdit={() => setEditing(true)}
            onDeactivate={() => setDeactivating(true)}
            onReactivate={handleReactivate}
          />
        )}
      </div>

      <BranchFormDialog
        open={editing}
        mode="edit"
        branch={branch}
        onClose={() => setEditing(false)}
      />
      <DeactivateBranchDialog
        open={deactivating}
        branch={branch}
        onClose={() => setDeactivating(false)}
      />
    </div>
  );
};
