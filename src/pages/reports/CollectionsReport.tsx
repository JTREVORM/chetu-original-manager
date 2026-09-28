/**
 * Collections — what was expected, what came in, and how it split.
 *
 * The split is read from the receipt, not recomputed here. Every screen that
 * needs principal-versus-interest now reads the same stored allocation.
 */
import React, { useMemo, useState } from "react";
import {
  Field,
  MisFilters,
  MisPageTitle,
  MisTable,
  SearchButton,
  money,
  shortDate,
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { summariseCollections } from "../../lib/financial/reports";
import { formatUGX } from "../../lib/loanCalculations";
import { monthToDate, useCollectionsView, useLoanPortfolioView } from "./financialReportData";
import { Stat } from "./LoanPortfolioReport";
import type { RepaymentAllocationRow } from "../../types/database.types";

const COLUMNS = [
  {
    key: "date",
    label: "Date",
    width: "9%",
    render: (r: RepaymentAllocationRow) => shortDate(r.payment_date),
    text: (r: RepaymentAllocationRow) => shortDate(r.payment_date),
  },
  {
    key: "receipt",
    label: "Receipt",
    width: "13%",
    render: (r: RepaymentAllocationRow) => r.receipt_number,
    text: (r: RepaymentAllocationRow) => r.receipt_number,
  },
  {
    key: "member",
    label: "Member",
    width: "16%",
    render: (r: RepaymentAllocationRow) => r.client_name || "—",
    text: (r: RepaymentAllocationRow) => r.client_name || "—",
  },
  {
    key: "loan",
    label: "Loan",
    width: "12%",
    render: (r: RepaymentAllocationRow) => r.loan_number || "—",
    text: (r: RepaymentAllocationRow) => r.loan_number || "—",
  },
  {
    key: "amount",
    label: "Collected",
    align: "right" as const,
    width: "11%",
    render: (r: RepaymentAllocationRow) => (
      <span className="font-semibold">{money(Number(r.amount_paid))}</span>
    ),
    text: (r: RepaymentAllocationRow) => money(Number(r.amount_paid)),
  },
  {
    key: "principal",
    label: "Principal",
    align: "right" as const,
    width: "11%",
    render: (r: RepaymentAllocationRow) => money(Number(r.principal_portion)),
    text: (r: RepaymentAllocationRow) => money(Number(r.principal_portion)),
  },
  {
    key: "interest",
    label: "Interest",
    align: "right" as const,
    width: "10%",
    render: (r: RepaymentAllocationRow) => money(Number(r.interest_portion)),
    text: (r: RepaymentAllocationRow) => money(Number(r.interest_portion)),
  },
  {
    key: "penalty",
    label: "Penalty",
    align: "right" as const,
    width: "9%",
    render: (r: RepaymentAllocationRow) =>
      Number(r.penalty_portion) > 0 ? money(Number(r.penalty_portion)) : "—",
    text: (r: RepaymentAllocationRow) => money(Number(r.penalty_portion)),
  },
  {
    key: "late",
    label: "Late?",
    width: "9%",
    render: (r: RepaymentAllocationRow) =>
      r.was_overdue ? <span className="font-semibold text-amber-700">Overdue</span> : "On time",
    text: (r: RepaymentAllocationRow) => (r.was_overdue ? "Overdue" : "On time"),
  },
];

export const CollectionsReport: React.FC = () => {
  const initial = monthToDate();
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to });

  const { rows, loading, error } = useCollectionsView(applied);
  const { rows: portfolio } = useLoanPortfolioView();

  const summary = useMemo(() => summariseCollections(rows, portfolio), [rows, portfolio]);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Collections"
            columns={COLUMNS}
            rows={rows}
            period={`${shortDate(applied.from)} – ${shortDate(applied.to)}`}
          />
        }
      >
        Collections
      </MisPageTitle>

      <MisFilters>
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="form-field"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={() => setApplied({ from, to })} />
      </MisFilters>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expected" value={formatUGX(summary.expected)} />
        <Stat label="Actually collected" value={formatUGX(summary.actual)} />
        <Stat label="Principal collected" value={formatUGX(summary.principal)} />
        <Stat label="Interest collected" value={formatUGX(summary.interest)} />
        <Stat label="Penalties collected" value={formatUGX(summary.penalties)} />
        <Stat label="Missed (still overdue)" value={formatUGX(summary.missed)} />
        <Stat label="Overdue collections" value={formatUGX(summary.overdueCollections)} />
        <Stat
          label="Collection rate"
          value={summary.rate === null ? "—" : `${summary.rate.toFixed(1)}%`}
        />
      </div>

      <MisTable<RepaymentAllocationRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.repayment_id}
        loading={loading}
        maxHeight="60vh"
        mobileTitle={(r) => r.client_name || r.receipt_number}
        mobileSubtitle={(r) => `${shortDate(r.payment_date)} • ${money(Number(r.amount_paid))}`}
        emptyMessage="No collections in this period."
      />
    </div>
  );
};

export default CollectionsReport;
