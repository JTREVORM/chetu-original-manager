/**
 * Cash Flow — what came in, what went out, and why.
 *
 * Internal transfers are shown but excluded from the net movement. Moving
 * money from the bank to the till changes nothing about how much Chetu has,
 * and counting it would inflate both sides of the statement.
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
import { summariseCashFlow } from "../../lib/financial/reports";
import { formatUGX } from "../../lib/loanCalculations";
import { monthToDate, useCashFlowView } from "./financialReportData";
import type { CashFlowRow } from "../../types/database.types";

const COLUMNS = [
  {
    key: "date",
    label: "Date",
    width: "10%",
    render: (r: CashFlowRow) => shortDate(r.transaction_date),
    text: (r: CashFlowRow) => shortDate(r.transaction_date),
  },
  {
    key: "no",
    label: "Journal",
    width: "13%",
    render: (r: CashFlowRow) => r.transaction_number,
    text: (r: CashFlowRow) => r.transaction_number,
  },
  {
    key: "cat",
    label: "Category",
    width: "17%",
    render: (r: CashFlowRow) => r.flow_category,
    text: (r: CashFlowRow) => r.flow_category,
  },
  {
    key: "account",
    label: "Account",
    width: "18%",
    render: (r: CashFlowRow) => r.account_name,
    text: (r: CashFlowRow) => r.account_name,
  },
  {
    key: "desc",
    label: "Description",
    width: "22%",
    render: (r: CashFlowRow) => r.description,
    text: (r: CashFlowRow) => r.description,
  },
  {
    key: "in",
    label: "In",
    align: "right" as const,
    width: "10%",
    render: (r: CashFlowRow) =>
      Number(r.cash_in) > 0 ? (
        <span className="text-emerald-700">{money(Number(r.cash_in))}</span>
      ) : (
        "—"
      ),
    text: (r: CashFlowRow) => (Number(r.cash_in) > 0 ? money(Number(r.cash_in)) : "—"),
  },
  {
    key: "out",
    label: "Out",
    align: "right" as const,
    width: "10%",
    render: (r: CashFlowRow) =>
      Number(r.cash_out) > 0 ? (
        <span className="text-red-700">{money(Number(r.cash_out))}</span>
      ) : (
        "—"
      ),
    text: (r: CashFlowRow) => (Number(r.cash_out) > 0 ? money(Number(r.cash_out)) : "—"),
  },
];

export const CashFlowReport: React.FC = () => {
  const initial = monthToDate();
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to });

  const { rows, loading, error } = useCashFlowView(applied);

  // Opening balance is everything that moved before the window starts.
  const openingRange = useMemo(
    () => (applied.from ? { to: dayBefore(applied.from) } : { to: null }),
    [applied.from],
  );
  const { rows: openingRows } = useCashFlowView(openingRange);
  const opening = useMemo(
    () => openingRows.reduce((t, r) => t + Number(r.cash_movement || 0), 0),
    [openingRows],
  );

  const summary = useMemo(() => summariseCashFlow(rows, opening), [rows, opening]);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Cash Flow"
            columns={COLUMNS}
            rows={rows}
            period={`${shortDate(applied.from)} – ${shortDate(applied.to)}`}
            subtitle="Movements through cash, bank and wallet accounts"
          />
        }
      >
        Cash Flow
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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="mb-3 text-[13px] font-bold text-slate-900">
          Statement of cash flow · {shortDate(applied.from)} – {shortDate(applied.to)}
        </h3>
        <dl className="space-y-1.5 text-[13px]">
          <Line label="Opening balance" value={summary.openingBalance} strong />
          <Line label="Capital introduced" value={summary.capitalIntroduced} />
          <Line label="Capital withdrawn" value={-summary.capitalWithdrawn} />
          <Line label="Loan repayments received" value={summary.loanRepayments} />
          <Line label="Fee income received" value={summary.feeIncome} />
          <Line label="Other income" value={summary.otherIncome} />
          <Line label="Loan disbursements" value={-summary.loanDisbursements} />
          <Line label="Operating expenses" value={-summary.expenses} />
          <Line label="Security refunds" value={-summary.securityRefunds} />
          <Line label="Adjustments and reversals" value={summary.adjustments} />
          <Line label="Net movement" value={summary.netMovement} strong />
          <Line label="Closing balance" value={summary.closingBalance} strong />
        </dl>

        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">
            Internal transfers
          </p>
          <div className="mt-1 flex flex-wrap gap-4 text-[13px] text-sky-900">
            <span>In {formatUGX(summary.internalTransfersIn)}</span>
            <span>Out {formatUGX(summary.internalTransfersOut)}</span>
            <span className="font-bold">
              Net {formatUGX(summary.internalTransfersIn - summary.internalTransfersOut)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-sky-800">
            Money moved between Chetu&rsquo;s own accounts. Shown for completeness and excluded from
            the movement above — it changes where the money is, not how much there is.
          </p>
        </div>
      </div>

      <MisTable<CashFlowRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => `${r.transaction_id}-${r.account_id}`}
        loading={loading}
        maxHeight="60vh"
        mobileTitle={(r) => r.flow_category}
        mobileSubtitle={(r) =>
          `${shortDate(r.transaction_date)} • ${money(Number(r.cash_movement))}`
        }
        emptyMessage="No cash moved in this period."
      />
    </div>
  );
};

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const Line: React.FC<{ label: string; value: number; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div
    className={`flex items-baseline justify-between gap-3 ${
      strong ? "border-t border-slate-200 pt-1.5 font-bold text-slate-900" : "text-slate-600"
    }`}
  >
    <dt>{label}</dt>
    <dd className={Number(value) < 0 ? "text-red-700" : ""}>{formatUGX(Number(value))}</dd>
  </div>
);

export default CashFlowReport;
