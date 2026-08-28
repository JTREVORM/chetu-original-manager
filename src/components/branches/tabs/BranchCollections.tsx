/**
 * Collection performance.
 *
 * "Target" here is the instalments that actually fall due — the system holds no
 * separate target figure, and inventing one would make the collection rate
 * meaningless.
 */
import React, { useMemo } from "react";
import { Banknote } from "lucide-react";
import type { LoanRepayment } from "../../../types/database.types";
import { branchTrend, officerPerformance } from "../../../lib/branchMetrics";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { compactUGX, EmptyState, NoticeBar, Panel, parTone, percent, StatTile } from "../BranchUi";
import { CollectionsVsDueChart, MovementChart } from "../BranchCharts";
import { staffName, type BranchTabProps } from "./shared";

export const BranchCollections: React.FC<BranchTabProps> = ({ slice, metrics, staff }) => {
  const trend = useMemo(() => branchTrend(slice, 30), [slice]);
  const fortnight = useMemo(() => trend.slice(-14), [trend]);
  const officers = useMemo(() => officerPerformance(slice), [slice]);

  const clientName = (id: string) => slice.clients.find((c) => c.id === id)?.full_name || "—";
  const loanNumber = (id: string) => slice.loans.find((l) => l.id === id)?.loan_number || "—";

  const recent = useMemo(
    () =>
      [...slice.repayments]
        .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))
        .slice(0, 200),
    [slice.repayments],
  );

  const officerColumns: MisColumn<(typeof officers)[number]>[] = [
    {
      key: "officer",
      label: "Loan Officer",
      width: "22%",
      render: (r) => (
        <span className="font-semibold text-slate-800">
          {staffName(staff, r.officerId) || "Unassigned"}
        </span>
      ),
      text: (r) => staffName(staff, r.officerId) || "Unassigned",
    },
    {
      key: "members",
      label: "Members",
      width: "10%",
      align: "right",
      render: (r) => money(r.members),
      text: (r) => String(r.members),
    },
    {
      key: "groups",
      label: "Groups",
      width: "9%",
      align: "right",
      render: (r) => money(r.groups),
      text: (r) => String(r.groups),
    },
    {
      key: "loans",
      label: "Active Loans",
      width: "11%",
      align: "right",
      render: (r) => money(r.activeLoans),
      text: (r) => String(r.activeLoans),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      width: "14%",
      align: "right",
      render: (r) => `UGX ${money(r.outstanding)}`,
      text: (r) => `UGX ${money(r.outstanding)}`,
    },
    {
      key: "today",
      label: "Collected Today",
      width: "13%",
      align: "right",
      render: (r) => `UGX ${money(r.collectedToday)}`,
      text: (r) => `UGX ${money(r.collectedToday)}`,
    },
    {
      key: "month",
      label: "Collected This Month",
      width: "14%",
      align: "right",
      render: (r) => `UGX ${money(r.collectedMonth)}`,
      text: (r) => `UGX ${money(r.collectedMonth)}`,
    },
    {
      key: "par",
      label: "PAR 30",
      width: "10%",
      align: "right",
      render: (r) => {
        const ratio = r.outstanding > 0 ? (r.par30 / r.outstanding) * 100 : 0;
        return <span className={`font-bold ${parTone(ratio)}`}>{percent(ratio)}</span>;
      },
      text: (r) => percent(r.outstanding > 0 ? (r.par30 / r.outstanding) * 100 : 0),
    },
  ];

  const receiptColumns: MisColumn<LoanRepayment>[] = [
    {
      key: "receipt",
      label: "Receipt",
      width: "14%",
      render: (r) => r.receipt_number,
      text: (r) => r.receipt_number,
    },
    {
      key: "member",
      label: "Member",
      width: "20%",
      render: (r) => (
        <span className="font-semibold text-slate-800">{clientName(r.client_id)}</span>
      ),
      text: (r) => clientName(r.client_id),
    },
    {
      key: "loan",
      label: "Loan",
      width: "15%",
      render: (r) => loanNumber(r.loan_id),
      text: (r) => loanNumber(r.loan_id),
    },
    {
      key: "amount",
      label: "Amount",
      width: "13%",
      align: "right",
      render: (r) => <span className="font-bold">{money(r.amount_paid)}</span>,
      text: (r) => `UGX ${money(r.amount_paid)}`,
    },
    {
      key: "type",
      label: "Type",
      width: "11%",
      render: (r) => r.collection_type || "Regular",
      text: (r) => r.collection_type || "Regular",
    },
    {
      key: "method",
      label: "Method",
      width: "11%",
      render: (r) => r.payment_method,
      text: (r) => r.payment_method,
    },
    {
      key: "date",
      label: "Date",
      width: "10%",
      render: (r) => shortDate(r.payment_date),
      text: (r) => shortDate(r.payment_date),
    },
    {
      key: "staff",
      label: "Received By",
      width: "14%",
      render: (r) => staffName(staff, r.recorded_by) || <span className="text-slate-400">—</span>,
      text: (r) => staffName(staff, r.recorded_by) || "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Due today"
          value={compactUGX(metrics.collections.dueToday)}
          hint="instalments falling due"
        />
        <StatTile
          label="Collected today"
          value={compactUGX(metrics.collections.today)}
          tone="text-emerald-600"
        />
        <StatTile
          label="Collection rate"
          value={percent(metrics.collections.rate, 1)}
          tone={
            metrics.collections.rate >= 90
              ? "text-emerald-600"
              : metrics.collections.rate >= 70
                ? "text-amber-600"
                : "text-red-600"
          }
          hint="of today’s instalments"
        />
        <StatTile
          label="Overdue amount"
          value={compactUGX(metrics.portfolio.arrears)}
          tone={metrics.portfolio.arrears > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <StatTile label="Collected this month" value={compactUGX(metrics.collections.month)} />
      </div>

      <NoticeBar tone="blue">
        The system holds no separate collection target, so “due” is the instalments genuinely
        falling due on each day, taken from the repayment schedules.
      </NoticeBar>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Collections vs Due" subtitle="Last 14 days">
          <CollectionsVsDueChart data={fortnight} height={220} />
        </Panel>
        <Panel title="Collections Trend" subtitle="Money in against money out, last 30 days">
          <MovementChart data={trend} height={220} />
        </Panel>
      </div>

      <Panel
        title="Officer performance"
        subtitle="Portfolio and collections by the officer the member is assigned to"
      >
        {officers.length === 0 ? (
          <EmptyState icon={Banknote} title="No officer activity yet" />
        ) : (
          <MisTable
            columns={officerColumns}
            rows={officers}
            rowKey={(r) => r.officerId || "unassigned"}
            emptyMessage="No officer activity yet."
            mobileTitle={(r) => staffName(staff, r.officerId) || "Unassigned"}
          />
        )}
      </Panel>

      <Panel
        title="Recent receipts"
        subtitle={`Latest ${recent.length} collections recorded at this branch`}
      >
        {slice.repayments.length === 0 ? (
          <EmptyState icon={Banknote} title="No collections recorded at this branch" />
        ) : (
          <MisTable
            columns={receiptColumns}
            rows={recent}
            rowKey={(r) => r.id}
            emptyMessage="No collections recorded."
            mobileTitle={(r) => clientName(r.client_id)}
            mobileSubtitle={(r) => r.receipt_number}
            maxHeight="60vh"
          />
        )}
      </Panel>
    </div>
  );
};
