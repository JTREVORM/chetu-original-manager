import React, { useMemo, useState } from "react";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import {
  CLOSED_LOAN_STATUSES,
  type Client,
  type Loan,
  type PaymentMethod,
} from "../types/database.types";
import {
  Field,
  MisFilters,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  todayISO,
  useMisScope,
  type MisColumn,
} from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";

interface CollectRow {
  loan: Loan;
  client: Client;
  group_name: string;
  group_code: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  overdue_weeks: number;
  overdue_amount: number;
}

const weeksBetween = (from?: string | null) => {
  if (!from) return 0;
  const ms = Date.now() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
};

/** Builds the collectable loan rows visible to the current user, scoped by filters. */
function useCollectRows(kind: "Regular" | "Overdue" | "Advance" | "BadDebt") {
  const scope = useMisScope();
  const { loans, clients, clientGroups, repayments } = useDatabase();

  return useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));

    return loans
      .filter((l) => {
        // Settled and written-off loans are closed — nothing more is collectable
        // on them, so they drop out of every collection screen.
        if (CLOSED_LOAN_STATUSES.includes(l.status)) return false;
        if (kind === "BadDebt") return l.is_bad_debt || l.status === "Defaulted";
        return (
          ["Active", "Overdue", "Defaulted"].includes(l.status) && Number(l.outstanding_balance) > 0
        );
      })
      .map<CollectRow | null>((l) => {
        const client = clientById.get(l.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";

        const paid = repayments
          .filter((r) => r.loan_id === l.id)
          .reduce((s, r) => s + Number(r.amount_paid || 0), 0);
        const weeksElapsed = Math.min(
          l.loan_period_weeks || 0,
          weeksBetween(l.first_repayment_date) + 1,
        );
        const expected = weeksElapsed * Number(l.weekly_installment || 0);
        const arrears = Math.max(0, expected - paid);
        const overdueWeeks =
          Number(l.weekly_installment) > 0 ? Math.floor(arrears / Number(l.weekly_installment)) : 0;

        return {
          loan: l,
          client,
          group_name: group?.group_name || "—",
          group_code: group?.group_code || "—",
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          overdue_weeks: overdueWeeks,
          overdue_amount: arrears,
        };
      })
      .filter((r): r is CollectRow => r !== null)
      .filter((r) => (kind === "Overdue" ? r.overdue_amount > 0 : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, repayments, kind, scope.officers, scope.activeBranches]);
}

const CollectionBase: React.FC<{
  title: string;
  kind: "Regular" | "Overdue" | "Advance" | "BadDebt";
  amountLabel: string;
  requireGroup?: boolean;
}> = ({ title, kind, amountLabel, requireGroup }) => {
  const scope = useMisScope();
  // Auditors have read-only access to collections.
  const canCollect = !scope.isAuditor;
  const rows = useCollectRows(kind);
  const { recordRepayment } = useDatabase();
  const { addToast } = useNotifications();

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [collectionDate, setCollectionDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.client.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay =
          `${r.group_name} ${r.group_code} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    if (requireGroup && !scope.groupId) {
      addToast("warning", "Select a group", "Choose the group you are collecting from.");
      return;
    }
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
    });
  };

  const defaultAmount = (r: CollectRow) =>
    kind === "Overdue" || kind === "BadDebt"
      ? Math.round(r.overdue_amount) || Number(r.loan.weekly_installment || 0)
      : Number(r.loan.weekly_installment || 0);

  const entered = (r: CollectRow) => {
    const raw = amounts[r.loan.id];
    return raw === undefined ? defaultAmount(r) : Number(raw || 0);
  };

  const total = filtered.reduce((s, r) => s + entered(r), 0);

  const saveAll = async () => {
    const payable = filtered.filter((r) => entered(r) > 0);
    if (payable.length === 0) {
      addToast("warning", "Nothing to collect", "Enter at least one collection amount.");
      return;
    }
    setSaving(true);
    try {
      for (const r of payable) {
        await recordRepayment(
          r.loan.id,
          entered(r),
          method,
          `${kind} collection on ${collectionDate}`,
        );
      }
      addToast(
        "success",
        "Collection Saved",
        `${payable.length} payment(s) totalling ${money(total)} recorded.`,
      );
      setAmounts({});
    } catch (error) {
      addToast(
        "error",
        "Collection failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: MisColumn<CollectRow>[] = [
    {
      key: "gcode",
      label: "Group Code",
      width: "9%",
      render: (r) => r.group_code,
      text: (r) => r.group_code,
    },
    {
      key: "mcode",
      label: "Member Code",
      width: "10%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "mname",
      label: "Member Name",
      width: "14%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    {
      key: "loan",
      label: "Loan No",
      width: "11%",
      render: (r) => r.loan.loan_number,
      text: (r) => r.loan.loan_number,
    },
    {
      key: "disb",
      label: "Disburse Date",
      width: "9%",
      render: (r) => shortDate(r.loan.disbursed_at),
      text: (r) => shortDate(r.loan.disbursed_at),
    },
    {
      key: "inst",
      label: "Installment",
      width: "9%",
      align: "right",
      render: (r) => money(r.loan.weekly_installment),
    },
    {
      key: "out",
      label: "Outstanding",
      width: "10%",
      align: "right",
      render: (r) => money(r.loan.outstanding_balance),
    },
    {
      key: "over",
      label: "Overdue",
      width: "10%",
      align: "right",
      render: (r) => (
        <span className={r.overdue_amount > 0 ? "font-bold text-chetu-red" : ""}>
          {money(r.overdue_amount)}
          {r.overdue_weeks > 0 && (
            <span className="ml-1 text-[10px] text-slate-400">({r.overdue_weeks}w)</span>
          )}
        </span>
      ),
    },
    {
      key: "amount",
      label: amountLabel,
      width: "12%",
      align: "right",
      render: (r) => (
        <input
          type="number"
          value={amounts[r.loan.id] ?? String(defaultAmount(r))}
          onChange={(e) => setAmounts((prev) => ({ ...prev, [r.loan.id]: e.target.value }))}
          className="form-field h-7 w-full text-right text-[11px]"
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title={title} columns={columns} rows={filtered} />}>
        {title}
      </MisPageTitle>

      <MisFilters
        title={title}
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name, code / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <Field label="Collection Date">
          <input
            type="date"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage="No collectable loans found."
        idleMessage="Select branch, officer and group, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${r.group_name}`}
      />

      {hasSearched && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-bold uppercase text-slate-500">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="form-field h-8 w-40"
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Mobile Money">Mobile Money</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-700">Total: {money(total)}</span>
            {canCollect && (
              <button
                type="button"
                disabled={saving}
                onClick={saveAll}
                className="rounded bg-[#0B4394] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Collect"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const GroupWiseCollection: React.FC = () => (
  <CollectionBase
    title="Group Wise Collection"
    kind="Regular"
    amountLabel="Collect Amount"
    requireGroup
  />
);

export const OverdueCollection: React.FC = () => (
  <CollectionBase title="Overdue Collection" kind="Overdue" amountLabel="Overdue Collect" />
);

export const AdvanceCollection: React.FC = () => (
  <CollectionBase title="Advance Collection" kind="Advance" amountLabel="Advance Amount" />
);

export const BadDebtsCollection: React.FC = () => (
  <CollectionBase title="BadDebts Collection" kind="BadDebt" amountLabel="Collect Amount" />
);
