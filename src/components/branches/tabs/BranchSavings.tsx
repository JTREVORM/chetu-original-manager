/** Savings held at this branch and the movement behind the balance. */
import React, { useMemo, useState } from "react";
import { PiggyBank } from "lucide-react";
import type { SavingsTransaction } from "../../../types/database.types";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { compactUGX, EmptyState, Panel, StatTile } from "../BranchUi";
import { SavingsMovementChart } from "../BranchCharts";
import { branchTrend } from "../../../lib/branchMetrics";
import { staffName, type BranchTabProps } from "./shared";

export const BranchSavings: React.FC<BranchTabProps> = ({ slice, metrics, staff }) => {
  const [type, setType] = useState("All");
  const [search, setSearch] = useState("");
  const trend = useMemo(() => branchTrend(slice, 30), [slice]);

  const accountOwner = (accountId: string) => {
    const account = slice.savingsAccounts.find((a) => a.id === accountId);
    if (!account) return "—";
    if (account.client_id)
      return slice.clients.find((c) => c.id === account.client_id)?.full_name || "—";
    if (account.group_id)
      return slice.groups.find((g) => g.id === account.group_id)?.group_name || "—";
    return "—";
  };
  const accountNumber = (accountId: string) =>
    slice.savingsAccounts.find((a) => a.id === accountId)?.account_number || "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...slice.savingsTransactions]
      .filter((t) => {
        if (type !== "All" && t.transaction_type !== type) return false;
        if (!term) return true;
        return [t.transaction_number, t.receipt_number, accountOwner(t.account_id)].some((field) =>
          String(field || "")
            .toLowerCase()
            .includes(term),
        );
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.savingsTransactions, type, search]);

  const columns: MisColumn<SavingsTransaction>[] = [
    {
      key: "number",
      label: "Transaction ID",
      width: "14%",
      render: (r) => r.transaction_number,
      text: (r) => r.transaction_number,
    },
    {
      key: "member",
      label: "Member / Group",
      width: "18%",
      render: (r) => (
        <span className="font-semibold text-slate-800">{accountOwner(r.account_id)}</span>
      ),
      text: (r) => accountOwner(r.account_id),
    },
    {
      key: "account",
      label: "Account",
      width: "13%",
      render: (r) => accountNumber(r.account_id),
      text: (r) => accountNumber(r.account_id),
    },
    {
      key: "type",
      label: "Type",
      width: "10%",
      render: (r) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            r.transaction_type === "Deposit"
              ? "bg-emerald-50 text-emerald-700"
              : r.transaction_type === "Withdrawal"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-[#0B4394]"
          }`}
        >
          {r.transaction_type}
        </span>
      ),
      text: (r) => r.transaction_type,
    },
    {
      key: "amount",
      label: "Amount",
      width: "12%",
      align: "right",
      render: (r) => <span className="font-bold">{money(r.amount)}</span>,
      text: (r) => `UGX ${money(r.amount)}`,
    },
    {
      key: "balance",
      label: "Balance After",
      width: "12%",
      align: "right",
      render: (r) => money(r.balance_after),
      text: (r) => `UGX ${money(r.balance_after)}`,
    },
    {
      key: "date",
      label: "Date",
      width: "10%",
      render: (r) => shortDate(r.created_at),
      text: (r) => shortDate(r.created_at),
    },
    {
      key: "staff",
      label: "Recorded By",
      width: "13%",
      render: (r) => staffName(staff, r.recorded_by) || <span className="text-slate-400">—</span>,
      text: (r) => staffName(staff, r.recorded_by) || "—",
    },
    {
      key: "receipt",
      label: "Reference",
      width: "12%",
      render: (r) => r.receipt_number,
      text: (r) => r.receipt_number,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total savings"
          value={compactUGX(metrics.savings.balance)}
          hint={`UGX ${money(metrics.savings.balance)}`}
        />
        <StatTile
          label="Deposits today"
          value={compactUGX(metrics.savings.depositsToday)}
          tone="text-emerald-600"
        />
        <StatTile
          label="Withdrawals today"
          value={compactUGX(metrics.savings.withdrawalsToday)}
          tone="text-amber-600"
        />
        <StatTile
          label="Net movement today"
          value={compactUGX(metrics.savings.netToday)}
          tone={metrics.savings.netToday >= 0 ? "text-emerald-600" : "text-red-600"}
          hint={`${money(metrics.savings.accounts)} accounts`}
        />
      </div>

      <Panel title="Savings Movement" subtitle="Deposits against withdrawals, last 30 days">
        <SavingsMovementChart data={trend} height={200} />
      </Panel>

      <Panel title="Savings transactions" subtitle={`${rows.length} shown`}>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="form-field sm:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by member, transaction or receipt number…"
            aria-label="Search savings transactions"
          />
          <select
            className="form-field"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="All">Type: All</option>
            <option value="Deposit">Deposits</option>
            <option value="Withdrawal">Withdrawals</option>
            <option value="Interest">Interest</option>
          </select>
        </div>

        {slice.savingsTransactions.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="No savings activity at this branch"
            message="Deposits and withdrawals recorded here will appear in this list."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            emptyMessage="No transactions match these filters."
            mobileTitle={(r) => accountOwner(r.account_id)}
            mobileSubtitle={(r) => r.transaction_number}
            maxHeight="60vh"
          />
        )}
      </Panel>
    </div>
  );
};
