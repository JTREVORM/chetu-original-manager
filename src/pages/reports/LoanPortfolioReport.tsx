/**
 * Loan Portfolio — every loan with its principal and interest kept apart.
 *
 * Read from `v_loan_portfolio`, which derives both from the instalment
 * schedule. The old reports showed a single `outstanding_balance` that mixes
 * the two, so "outstanding" silently included interest nobody had earned yet.
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
import { formatUGX } from "../../lib/loanCalculations";
import { useLoanPortfolioView } from "./financialReportData";
import type { LoanPortfolioRow } from "../../types/database.types";

const COLUMNS = [
  {
    key: "loan",
    label: "Loan",
    width: "12%",
    render: (r: LoanPortfolioRow) => r.loan_number,
    text: (r: LoanPortfolioRow) => r.loan_number,
  },
  {
    key: "member",
    label: "Member",
    width: "16%",
    render: (r: LoanPortfolioRow) => r.client_name,
    text: (r: LoanPortfolioRow) => r.client_name,
  },
  {
    key: "branch",
    label: "Branch",
    width: "10%",
    render: (r: LoanPortfolioRow) => r.branch_name || "—",
    text: (r: LoanPortfolioRow) => r.branch_name || "—",
  },
  {
    key: "product",
    label: "Product",
    width: "12%",
    render: (r: LoanPortfolioRow) => r.product_name || "—",
    text: (r: LoanPortfolioRow) => r.product_name || "—",
  },
  {
    key: "status",
    label: "Status",
    width: "9%",
    render: (r: LoanPortfolioRow) => r.status,
    text: (r: LoanPortfolioRow) => r.status,
  },
  {
    key: "principal",
    label: "Disbursed",
    align: "right" as const,
    width: "10%",
    render: (r: LoanPortfolioRow) => money(Number(r.principal_amount)),
    text: (r: LoanPortfolioRow) => money(Number(r.principal_amount)),
  },
  {
    key: "prin_out",
    label: "Principal out",
    align: "right" as const,
    width: "11%",
    render: (r: LoanPortfolioRow) => (
      <span className="font-semibold">{money(Number(r.principal_outstanding))}</span>
    ),
    text: (r: LoanPortfolioRow) => money(Number(r.principal_outstanding)),
  },
  {
    key: "int_out",
    label: "Interest out",
    align: "right" as const,
    width: "10%",
    render: (r: LoanPortfolioRow) => money(Number(r.interest_outstanding)),
    text: (r: LoanPortfolioRow) => money(Number(r.interest_outstanding)),
  },
  {
    key: "overdue",
    label: "Overdue",
    align: "right" as const,
    width: "10%",
    render: (r: LoanPortfolioRow) =>
      Number(r.overdue_amount) > 0 ? (
        <span className="font-bold text-red-700">{money(Number(r.overdue_amount))}</span>
      ) : (
        "—"
      ),
    text: (r: LoanPortfolioRow) => money(Number(r.overdue_amount)),
  },
];

const OPEN = ["Active", "Partially Paid", "Overdue"];

export const LoanPortfolioReport: React.FC = () => {
  const { rows, loading, error } = useLoanPortfolioView();
  const [status, setStatus] = useState("open");
  const [branch, setBranch] = useState("");
  const [applied, setApplied] = useState({ status: "open", branch: "" });

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (applied.branch && r.branch_id !== applied.branch) return false;
        if (applied.status === "open") return OPEN.includes(r.status);
        if (applied.status === "closed") return ["Fully Paid", "Settled"].includes(r.status);
        if (applied.status === "written_off") return r.status === "Written Off";
        if (applied.status === "overdue") return Number(r.overdue_amount) > 0;
        return true;
      }),
    [rows, applied],
  );

  const totals = useMemo(() => {
    const disbursed = rows.filter((r) => r.disbursed_at);
    return {
      totalDisbursed: disbursed.reduce((t, r) => t + Number(r.principal_amount), 0),
      principalOutstanding: filtered.reduce((t, r) => t + Number(r.principal_outstanding), 0),
      interestOutstanding: filtered.reduce((t, r) => t + Number(r.interest_outstanding), 0),
      active: rows.filter((r) => OPEN.includes(r.status)).length,
      completed: rows.filter((r) => ["Fully Paid", "Settled"].includes(r.status)).length,
      overdue: rows.filter((r) => Number(r.overdue_amount) > 0).length,
      writtenOff: rows.filter((r) => r.status === "Written Off").length,
      averageSize: disbursed.length
        ? disbursed.reduce((t, r) => t + Number(r.principal_amount), 0) / disbursed.length
        : 0,
    };
  }, [rows, filtered]);

  const branches = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => r.branch_id && seen.set(r.branch_id, r.branch_name || r.branch_id));
    return [...seen.entries()];
  }, [rows]);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={<ReportExportButtons title="Loan Portfolio" columns={COLUMNS} rows={filtered} />}
      >
        Loan Portfolio
      </MisPageTitle>

      <MisFilters>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-field">
            <option value="open">Open</option>
            <option value="overdue">In arrears</option>
            <option value="closed">Completed</option>
            <option value="written_off">Written off</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Field label="Branch">
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className="form-field">
            <option value="">All branches</option>
            {branches.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <SearchButton onClick={() => setApplied({ status, branch })} />
      </MisFilters>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total disbursed" value={formatUGX(totals.totalDisbursed)} />
        <Stat label="Principal outstanding" value={formatUGX(totals.principalOutstanding)} />
        <Stat label="Interest outstanding" value={formatUGX(totals.interestOutstanding)} />
        <Stat label="Average loan size" value={formatUGX(totals.averageSize)} />
        <Stat label="Active loans" value={String(totals.active)} />
        <Stat label="Completed" value={String(totals.completed)} />
        <Stat label="In arrears" value={String(totals.overdue)} />
        <Stat label="Written off" value={String(totals.writtenOff)} />
      </div>

      <MisTable<LoanPortfolioRow>
        columns={COLUMNS}
        rows={filtered}
        rowKey={(r) => r.loan_id}
        loading={loading}
        maxHeight="60vh"
        mobileTitle={(r) => r.client_name}
        mobileSubtitle={(r) => `${r.loan_number} • ${money(Number(r.principal_outstanding))}`}
        emptyMessage="No loans match these filters."
      />
    </div>
  );
};

export const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
    <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-1 text-[14px] font-black text-slate-900">{value}</p>
  </div>
);

export default LoanPortfolioReport;
