/**
 * Financial Position — where Chetu's money is, on one page.
 *
 * Every figure comes from `v_money_position` and `v_account_balances`, the
 * same rows the dashboard reads, so the two cannot disagree. Nothing here is
 * a stored total and nothing is seeded with a constant: this report replaces
 * one that printed a hard-coded UGX 250,000,000 bank balance.
 */
import React from "react";
import { MisPageTitle, MisTable, money, shortDate } from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useDatabase } from "../../context/DatabaseContext";
import { formatUGX } from "../../lib/loanCalculations";
import { useAccountBalancesView } from "./financialReportData";
import type { AccountBalance } from "../../types/database.types";

const SECTION_LABEL: Record<string, string> = {
  asset_liquid: "Liquid assets",
  asset_receivable: "Receivables",
  liability: "Liabilities",
  equity: "Capital & equity",
  income: "Income",
  expense: "Expenses",
};

const COLUMNS = [
  {
    key: "account",
    label: "Account",
    width: "30%",
    render: (a: AccountBalance) => a.account_name,
    text: (a: AccountBalance) => a.account_name,
  },
  {
    key: "section",
    label: "Section",
    width: "18%",
    render: (a: AccountBalance) => SECTION_LABEL[a.account_class] || a.account_class,
    text: (a: AccountBalance) => SECTION_LABEL[a.account_class] || a.account_class,
  },
  {
    key: "branch",
    label: "Branch",
    width: "16%",
    render: (a: AccountBalance) => a.branch_name || "Institution-wide",
    text: (a: AccountBalance) => a.branch_name || "Institution-wide",
  },
  {
    key: "last",
    label: "Last activity",
    width: "12%",
    render: (a: AccountBalance) => shortDate(a.last_transaction_date) || "—",
    text: (a: AccountBalance) => shortDate(a.last_transaction_date) || "—",
  },
  {
    key: "amount",
    label: "Amount",
    align: "right" as const,
    width: "24%",
    render: (a: AccountBalance) => (
      <span className="font-semibold">{money(Number(a.natural_balance))}</span>
    ),
    text: (a: AccountBalance) => money(Number(a.natural_balance)),
  },
];

export const FinancialPositionReport: React.FC = () => {
  const { moneyPosition } = useDatabase();
  const { rows, loading, error } = useAccountBalancesView();

  const shown = rows.filter((a) => Number(a.current_balance) !== 0 || a.posting_count > 0);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Financial Position"
            columns={COLUMNS}
            rows={shown}
            subtitle="Assets, liabilities and capital, derived from posted journals"
          />
        }
      >
        Financial Position
      </MisPageTitle>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </p>
      )}

      {moneyPosition && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Liquidity">
            <Line label="Cash at hand" value={moneyPosition.cash_at_hand} />
            <Line label="Cash at bank" value={moneyPosition.cash_at_bank} />
            <Line label="Mobile money / merchant" value={moneyPosition.mobile_money} />
            {Number(moneyPosition.unclassified_legacy) !== 0 && (
              <Line label="Legacy / unclassified" value={moneyPosition.unclassified_legacy} muted />
            )}
            <Line
              label="Total available liquidity"
              value={moneyPosition.total_available_liquidity}
              strong
            />
          </Card>

          <Card title="Money with borrowers">
            <Line label="Outstanding principal" value={moneyPosition.outstanding_principal} />
            <Line label="Interest receivable" value={moneyPosition.interest_receivable} />
            <Line label="Penalties receivable" value={moneyPosition.penalties_receivable} />
            <Line label="Overdue portfolio" value={moneyPosition.overdue_portfolio} />
            <Line label="Total loan portfolio" value={moneyPosition.total_loan_portfolio} strong />
          </Card>

          <Card title="Liabilities, capital and result">
            <Line label="Member security held" value={moneyPosition.security_held} />
            <Line label="Capital introduced" value={moneyPosition.capital_introduced} />
            <Line label="Income to date" value={moneyPosition.total_income} />
            <Line label="Expenses to date" value={moneyPosition.total_expenses} />
            <Line label="Net result" value={moneyPosition.net_result} />
            <Line label="Net worth (ledger)" value={moneyPosition.net_worth_ledger} strong />
          </Card>
        </div>
      )}

      {moneyPosition && (
        <div className="rounded-xl border border-[#0B4394] bg-[#f1f6fd] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold text-slate-900">Total financial position</span>
            <span className="text-xl font-black text-[#0B4394]">
              {formatUGX(Number(moneyPosition.total_financial_position))}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            Liquidity plus what members owe, less the refundable security Chetu holds for them.
            Counting only interest actually collected, the ledger's own net worth is{" "}
            {formatUGX(Number(moneyPosition.net_worth_ledger))} — the difference is contracted
            interest not yet earned.
          </p>
        </div>
      )}

      <MisTable<AccountBalance>
        columns={COLUMNS}
        rows={shown}
        rowKey={(a) => a.account_id}
        loading={loading}
        mobileTitle={(a) => a.account_name}
        mobileSubtitle={(a) => money(Number(a.natural_balance))}
        emptyMessage="No accounts carry a balance yet."
      />
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
    <dl className="space-y-1.5 text-[13px]">{children}</dl>
  </div>
);

const Line: React.FC<{ label: string; value: number; strong?: boolean; muted?: boolean }> = ({
  label,
  value,
  strong,
  muted,
}) => (
  <div
    className={`flex items-baseline justify-between gap-3 ${
      strong ? "border-t border-slate-200 pt-1.5 font-bold text-slate-900" : ""
    } ${muted ? "text-amber-700" : ""}`}
  >
    <dt className={strong || muted ? "" : "text-slate-600"}>{label}</dt>
    <dd>{formatUGX(Number(value))}</dd>
  </div>
);

export default FinancialPositionReport;
