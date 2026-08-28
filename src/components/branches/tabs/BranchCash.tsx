/**
 * Cash movement at this branch.
 *
 * The system has no till or vault module: there is no opening float, no counted
 * closing balance and therefore no real variance to report. Rather than invent
 * those figures, this tab reconciles what the ledgers do record — receipts in,
 * payments out, and the branch's bank movements — and says plainly what is not
 * tracked.
 */
import React, { useMemo } from "react";
import { Wallet } from "lucide-react";
import type { BankTransaction } from "../../../types/database.types";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { compactUGX, EmptyState, NoticeBar, Panel, StatTile } from "../BranchUi";
import { staffName, type BranchTabProps } from "./shared";

export const BranchCash: React.FC<BranchTabProps> = ({ branch, slice, metrics, staff }) => {
  const today = new Date().toISOString().split("T")[0];

  const expensesToday = useMemo(
    () =>
      slice.expenses
        .filter((e) => e.expense_date === today)
        .reduce((total, e) => total + Number(e.amount || 0), 0),
    [slice.expenses, today],
  );

  const bankToday = useMemo(
    () => slice.bankTransactions.filter((t) => t.transaction_date === today),
    [slice.bankTransactions, today],
  );

  const netToday = metrics.cash.receiptsToday - metrics.cash.paymentsToday;

  const flows = [
    {
      label: "Loan collections received",
      value: metrics.collections.today,
      direction: "in" as const,
    },
    {
      label: "Savings deposits received",
      value: metrics.savings.depositsToday,
      direction: "in" as const,
    },
    { label: "Loans disbursed", value: metrics.disbursements.today, direction: "out" as const },
    {
      label: "Savings withdrawals paid",
      value: metrics.savings.withdrawalsToday,
      direction: "out" as const,
    },
    { label: "Expenses paid", value: expensesToday, direction: "out" as const },
  ];

  const columns: MisColumn<BankTransaction>[] = [
    {
      key: "number",
      label: "Reference",
      width: "16%",
      render: (r) => r.transaction_number,
      text: (r) => r.transaction_number,
    },
    {
      key: "type",
      label: "Type",
      width: "12%",
      render: (r) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            r.transaction_type === "Deposit"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {r.transaction_type}
        </span>
      ),
      text: (r) => r.transaction_type,
    },
    {
      key: "category",
      label: "Category",
      width: "16%",
      render: (r) => r.category || "—",
      text: (r) => r.category || "—",
    },
    {
      key: "amount",
      label: "Amount",
      width: "14%",
      align: "right",
      render: (r) => <span className="font-bold">{money(r.amount)}</span>,
      text: (r) => `UGX ${money(r.amount)}`,
    },
    {
      key: "balance",
      label: "Balance After",
      width: "14%",
      align: "right",
      render: (r) => money(r.balance_after),
      text: (r) => `UGX ${money(r.balance_after)}`,
    },
    {
      key: "date",
      label: "Date",
      width: "12%",
      render: (r) => shortDate(r.transaction_date),
      text: (r) => shortDate(r.transaction_date),
    },
    {
      key: "staff",
      label: "Recorded By",
      width: "16%",
      render: (r) => staffName(staff, r.recorded_by) || <span className="text-slate-400">—</span>,
      text: (r) => staffName(staff, r.recorded_by) || "—",
    },
  ];

  const recentBank = useMemo(
    () =>
      [...slice.bankTransactions]
        .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
        .slice(0, 100),
    [slice.bankTransactions],
  );

  return (
    <div className="space-y-4">
      <NoticeBar tone="amber">
        This system does not run a till or vault module, so there is no counted opening float or
        closing balance to reconcile against. The figures below are the branch’s recorded
        cash-affecting transactions, not a till reconciliation.
      </NoticeBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Received today"
          value={compactUGX(metrics.cash.receiptsToday)}
          tone="text-emerald-600"
          hint="collections + deposits"
        />
        <StatTile
          label="Paid out today"
          value={compactUGX(metrics.cash.paymentsToday)}
          tone="text-amber-600"
          hint="disbursements + withdrawals + expenses"
        />
        <StatTile
          label="Net movement today"
          value={compactUGX(netToday)}
          tone={netToday >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <StatTile
          label="Bank position"
          value={compactUGX(metrics.cash.bankBalance)}
          hint={`${money(slice.bankTransactions.length)} transactions on file`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Today’s cash flows"
          subtitle="Every recorded movement that involves money changing hands"
        >
          <ul className="divide-y divide-slate-100">
            {flows.map((flow) => (
              <li key={flow.label} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-slate-600">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${flow.direction === "in" ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                  <span className="truncate">{flow.label}</span>
                </span>
                <span
                  className={`shrink-0 text-[13px] font-bold ${flow.direction === "in" ? "text-emerald-700" : "text-amber-700"}`}
                >
                  {flow.direction === "in" ? "+" : "−"} UGX {money(flow.value)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t-2 border-slate-200 py-2">
              <span className="text-[12px] font-bold text-slate-700">Net movement</span>
              <span
                className={`text-[13px] font-bold ${netToday >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                UGX {money(netToday)}
              </span>
            </li>
          </ul>
          {bankToday.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500">
              {bankToday.length} bank transaction{bankToday.length === 1 ? "" : "s"} also recorded
              at this branch today.
            </p>
          )}
        </Panel>

        <Panel title="Branch cash controls" subtitle="Set on the branch record">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatTile
              label="Maximum cash holding"
              value={
                branch.max_cash_holding != null
                  ? `UGX ${money(branch.max_cash_holding)}`
                  : "No limit set"
              }
            />
            <StatTile label="Default currency" value={branch.currency || "UGX"} />
            <StatTile label="Approval level" value={branch.approval_level || "Not set"} />
            <StatTile
              label="Expenses this month"
              value={compactUGX(metrics.cash.expensesMonth)}
              hint={`${money(slice.expenses.length)} recorded`}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Bank transactions" subtitle="Movements recorded against this branch">
        {slice.bankTransactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No bank transactions recorded for this branch"
            message="Deposits and withdrawals booked to this branch under Cash Management will appear here."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={recentBank}
            rowKey={(r) => r.id}
            emptyMessage="No bank transactions recorded."
            mobileTitle={(r) => r.transaction_number}
            mobileSubtitle={(r) => r.transaction_type}
            maxHeight="50vh"
          />
        )}
      </Panel>
    </div>
  );
};
