/**
 * Arrears and Portfolio at Risk, aged into the standard microfinance buckets.
 *
 * PAR percentages are computed against the outstanding principal, not the
 * principal-plus-interest figure the old reports used — a loan's interest is
 * not at risk until it has been earned.
 */
import React, { useMemo } from "react";
import { MisPageTitle, MisTable, money } from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { formatUGX } from "../../lib/loanCalculations";
import { PAR_BUCKET_ORDER } from "../../lib/financial/reports";
import { useLoanPortfolioView } from "./financialReportData";
import { Stat } from "./LoanPortfolioReport";
import type { LoanPortfolioRow } from "../../types/database.types";

interface BucketRow {
  bucket: string;
  loans: number;
  overduePrincipal: number;
  overdueInterest: number;
  overdueTotal: number;
  principalOutstanding: number;
  parPercent: number;
}

const COLUMNS = [
  {
    key: "bucket",
    label: "Days past due",
    width: "16%",
    render: (r: BucketRow) => r.bucket,
    text: (r: BucketRow) => r.bucket,
  },
  {
    key: "loans",
    label: "Loans",
    align: "right" as const,
    width: "10%",
    render: (r: BucketRow) => String(r.loans),
    text: (r: BucketRow) => String(r.loans),
  },
  {
    key: "op",
    label: "Overdue principal",
    align: "right" as const,
    width: "17%",
    render: (r: BucketRow) => money(r.overduePrincipal),
    text: (r: BucketRow) => money(r.overduePrincipal),
  },
  {
    key: "oi",
    label: "Overdue interest",
    align: "right" as const,
    width: "16%",
    render: (r: BucketRow) => money(r.overdueInterest),
    text: (r: BucketRow) => money(r.overdueInterest),
  },
  {
    key: "ot",
    label: "Total overdue",
    align: "right" as const,
    width: "16%",
    render: (r: BucketRow) => <span className="font-semibold">{money(r.overdueTotal)}</span>,
    text: (r: BucketRow) => money(r.overdueTotal),
  },
  {
    key: "po",
    label: "Principal at risk",
    align: "right" as const,
    width: "16%",
    render: (r: BucketRow) => money(r.principalOutstanding),
    text: (r: BucketRow) => money(r.principalOutstanding),
  },
  {
    key: "par",
    label: "PAR %",
    align: "right" as const,
    width: "9%",
    render: (r: BucketRow) => `${r.parPercent.toFixed(1)}%`,
    text: (r: BucketRow) => `${r.parPercent.toFixed(1)}%`,
  },
];

export const ArrearsAgeing: React.FC = () => {
  const { rows, loading, error } = useLoanPortfolioView();

  const open = useMemo(
    () => rows.filter((r) => ["Active", "Partially Paid", "Overdue"].includes(r.status)),
    [rows],
  );

  const totalPrincipal = open.reduce((t, r) => t + Number(r.principal_outstanding), 0);

  const buckets = useMemo<BucketRow[]>(() => {
    const byBucket = new Map<string, LoanPortfolioRow[]>();
    PAR_BUCKET_ORDER.forEach((b) => byBucket.set(b, []));
    open.forEach((r) => byBucket.get(r.par_bucket)?.push(r));

    return PAR_BUCKET_ORDER.map((bucket) => {
      const list = byBucket.get(bucket) || [];
      const principalOutstanding = list.reduce((t, r) => t + Number(r.principal_outstanding), 0);
      return {
        bucket: bucket === "Current" ? "Current" : `${bucket} days`,
        loans: list.length,
        overduePrincipal: list.reduce((t, r) => t + Number(r.overdue_principal), 0),
        overdueInterest: list.reduce((t, r) => t + Number(r.overdue_interest), 0),
        overdueTotal: list.reduce((t, r) => t + Number(r.overdue_amount), 0),
        principalOutstanding,
        parPercent: totalPrincipal > 0 ? (principalOutstanding / totalPrincipal) * 100 : 0,
      };
    });
  }, [open, totalPrincipal]);

  const atRisk = buckets.filter((b) => b.bucket !== "Current");
  const par30 = atRisk
    .filter((b) => !b.bucket.startsWith("1-7") && !b.bucket.startsWith("8-30"))
    .reduce((t, b) => t + b.principalOutstanding, 0);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Arrears & Portfolio at Risk"
            columns={COLUMNS}
            rows={buckets}
          />
        }
      >
        Arrears &amp; Portfolio at Risk
      </MisPageTitle>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Principal outstanding" value={formatUGX(totalPrincipal)} />
        <Stat
          label="Total arrears"
          value={formatUGX(atRisk.reduce((t, b) => t + b.overdueTotal, 0))}
        />
        <Stat label="Loans in arrears" value={String(atRisk.reduce((t, b) => t + b.loans, 0))} />
        <Stat
          label="PAR 30+"
          value={totalPrincipal > 0 ? `${((par30 / totalPrincipal) * 100).toFixed(1)}%` : "—"}
        />
      </div>

      <MisTable<BucketRow>
        columns={COLUMNS}
        rows={buckets}
        rowKey={(r) => r.bucket}
        loading={loading}
        mobileTitle={(r) => r.bucket}
        mobileSubtitle={(r) => `${r.loans} loan(s) • ${money(r.overdueTotal)}`}
        emptyMessage="No open loans."
      />
    </div>
  );
};

export default ArrearsAgeing;
