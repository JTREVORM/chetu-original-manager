/**
 * Income, Expenses, Profit & Loss, and Capital & Funding.
 *
 * All four read the ledger's own accounts, so loan principal cannot leak into
 * any of them: it never touches an income or expense account. The report they
 * replace counted every shilling collected as revenue.
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
import {
  monthToDate,
  useIncomeExpenseTotals,
  useIncomeStatementView,
  useTransactionsView,
} from "./financialReportData";
import { Stat } from "./LoanPortfolioReport";
import type { FinancialTransactionRow } from "../../types/database.types";

interface AccountTotal {
  code: string;
  name: string;
  amount: number;
}

const ACCOUNT_COLUMNS = [
  {
    key: "name",
    label: "Category",
    width: "56%",
    render: (r: AccountTotal) => r.name,
    text: (r: AccountTotal) => r.name,
  },
  {
    key: "code",
    label: "Code",
    width: "22%",
    render: (r: AccountTotal) => r.code,
    text: (r: AccountTotal) => r.code,
  },
  {
    key: "amount",
    label: "Amount",
    align: "right" as const,
    width: "22%",
    render: (r: AccountTotal) => <span className="font-semibold">{money(r.amount)}</span>,
    text: (r: AccountTotal) => money(r.amount),
  },
];

/** Date range controls shared by all four. */
const useRange = () => {
  const initial = monthToDate();
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to });
  const controls = (
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
  );
  return { applied, controls };
};

export const IncomeReport: React.FC = () => {
  const { applied, controls } = useRange();
  const { rows, loading, error } = useIncomeStatementView(applied);
  const totals = useIncomeExpenseTotals(rows);

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Income" columns={ACCOUNT_COLUMNS} rows={totals.income} />
        }
      >
        Income
      </MisPageTitle>
      {controls}
      {error && <Err message={error} />}
      <p className="text-[12px] leading-relaxed text-slate-500">
        Interest, penalties, processing, CRB, group maintenance, admission and passbook fees, each
        recognised when it was actually collected. Loan principal returning is not income and cannot
        appear here.
      </p>
      <MisTable<AccountTotal>
        columns={ACCOUNT_COLUMNS}
        rows={totals.income.filter((r) => r.amount !== 0)}
        rowKey={(r) => r.code}
        loading={loading}
        emptyMessage="No income recognised in this period."
        footer={<Total label="Total income" value={totals.totalIncome} tone="emerald" />}
      />
    </div>
  );
};

export const ExpenseReport: React.FC = () => {
  const { applied, controls } = useRange();
  const { rows, loading, error } = useIncomeStatementView(applied);
  const totals = useIncomeExpenseTotals(rows);
  const { rows: journals } = useTransactionsView({ ...applied, entryType: "expense" });

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Expenses" columns={ACCOUNT_COLUMNS} rows={totals.expenses} />
        }
      >
        Expenses
      </MisPageTitle>
      {controls}
      {error && <Err message={error} />}
      <MisTable<AccountTotal>
        columns={ACCOUNT_COLUMNS}
        rows={totals.expenses.filter((r) => r.amount !== 0)}
        rowKey={(r) => r.code}
        loading={loading}
        emptyMessage="No expenses in this period."
        footer={<Total label="Total expenses" value={totals.totalExpenses} tone="red" />}
      />
      <h2 className="pt-2 text-[13px] font-bold text-slate-900">Every expense, and what paid it</h2>
      <MisTable<FinancialTransactionRow>
        columns={[
          {
            key: "date",
            label: "Date",
            width: "10%",
            render: (t) => shortDate(t.transaction_date),
            text: (t) => shortDate(t.transaction_date),
          },
          {
            key: "no",
            label: "Voucher",
            width: "13%",
            render: (t) => t.expense_number || t.transaction_number,
            text: (t) => t.expense_number || t.transaction_number,
          },
          {
            key: "desc",
            label: "Description",
            width: "27%",
            render: (t) => t.description,
            text: (t) => t.description,
          },
          {
            key: "src",
            label: "Account used",
            width: "17%",
            render: (t) => t.source_account || "—",
            text: (t) => t.source_account || "—",
          },
          {
            key: "branch",
            label: "Branch",
            width: "12%",
            render: (t) => t.branch_name || "—",
            text: (t) => t.branch_name || "—",
          },
          {
            key: "by",
            label: "Staff",
            width: "11%",
            render: (t) => t.created_by_name || "—",
            text: (t) => t.created_by_name || "—",
          },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            width: "10%",
            render: (t) => money(Number(t.amount)),
            text: (t) => money(Number(t.amount)),
          },
        ]}
        rows={journals}
        rowKey={(t) => t.id}
        mobileTitle={(t) => t.description}
        mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
        emptyMessage="No expense journals in this period."
      />
    </div>
  );
};

export const ProfitAndLossReport: React.FC = () => {
  const { applied, controls } = useRange();
  const { rows, loading, error } = useIncomeStatementView(applied);
  const totals = useIncomeExpenseTotals(rows);
  const netResult = totals.totalIncome - totals.totalExpenses;

  const lines = useMemo<AccountTotal[]>(
    () => [
      ...totals.income.filter((r) => r.amount !== 0),
      { code: "", name: "Total income", amount: totals.totalIncome },
      ...totals.expenses.filter((r) => r.amount !== 0).map((r) => ({ ...r, amount: -r.amount })),
      { code: "", name: "Total operating expenses", amount: -totals.totalExpenses },
      { code: "", name: "Net result", amount: netResult },
    ],
    [totals, netResult],
  );

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Profit and Loss" columns={ACCOUNT_COLUMNS} rows={lines} />
        }
      >
        Profit &amp; Loss
      </MisPageTitle>
      {controls}
      {error && <Err message={error} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Income" value={formatUGX(totals.totalIncome)} />
        <Stat label="Operating expenses" value={formatUGX(totals.totalExpenses)} />
        <Stat label="Net result" value={formatUGX(netResult)} />
      </div>
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-900">
        Loan principal coming back is movement on the balance sheet, not revenue. It never touches
        an income account, so it is excluded from this statement by construction rather than by
        filtering.
      </p>
      <MisTable<AccountTotal>
        columns={ACCOUNT_COLUMNS}
        rows={lines}
        rowKey={(r) => r.code || r.name}
        loading={loading}
        emptyMessage="Nothing to report for this period."
      />
    </div>
  );
};

export const CapitalFundingReport: React.FC = () => {
  const { applied, controls } = useRange();
  const { rows, loading, error } = useTransactionsView(applied);
  const capital = rows.filter(
    (t) => t.entry_type === "capital_injection" || t.entry_type === "capital_withdrawal",
  );

  const introduced = capital
    .filter((t) => t.entry_type === "capital_injection")
    .reduce((t, r) => t + Number(r.amount), 0);
  const withdrawn = capital
    .filter((t) => t.entry_type === "capital_withdrawal")
    .reduce((t, r) => t + Number(r.amount), 0);

  const COLUMNS = [
    {
      key: "date",
      label: "Date",
      width: "10%",
      render: (t: FinancialTransactionRow) => shortDate(t.transaction_date),
      text: (t: FinancialTransactionRow) => shortDate(t.transaction_date),
    },
    {
      key: "no",
      label: "Journal",
      width: "14%",
      render: (t: FinancialTransactionRow) => t.transaction_number,
      text: (t: FinancialTransactionRow) => t.transaction_number,
    },
    {
      key: "dir",
      label: "Direction",
      width: "10%",
      render: (t: FinancialTransactionRow) => (t.entry_type === "capital_injection" ? "In" : "Out"),
      text: (t: FinancialTransactionRow) => (t.entry_type === "capital_injection" ? "In" : "Out"),
    },
    {
      key: "acct",
      label: "Destination account",
      width: "20%",
      render: (t: FinancialTransactionRow) => t.destination_account || t.source_account || "—",
      text: (t: FinancialTransactionRow) => t.destination_account || t.source_account || "—",
    },
    {
      key: "branch",
      label: "Branch",
      width: "12%",
      render: (t: FinancialTransactionRow) => t.branch_name || "—",
      text: (t: FinancialTransactionRow) => t.branch_name || "—",
    },
    {
      key: "ref",
      label: "Reference",
      width: "12%",
      render: (t: FinancialTransactionRow) => t.reference_number || "—",
      text: (t: FinancialTransactionRow) => t.reference_number || "—",
    },
    {
      key: "desc",
      label: "Source / note",
      width: "12%",
      render: (t: FinancialTransactionRow) => t.description,
      text: (t: FinancialTransactionRow) => t.description,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right" as const,
      width: "10%",
      render: (t: FinancialTransactionRow) => money(Number(t.amount)),
      text: (t: FinancialTransactionRow) => money(Number(t.amount)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={<ReportExportButtons title="Capital and Funding" columns={COLUMNS} rows={capital} />}
      >
        Capital &amp; Funding
      </MisPageTitle>
      {controls}
      {error && <Err message={error} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Capital introduced" value={formatUGX(introduced)} />
        <Stat label="Capital withdrawn" value={formatUGX(withdrawn)} />
        <Stat label="Net capital" value={formatUGX(introduced - withdrawn)} />
      </div>
      <p className="text-[12px] leading-relaxed text-slate-500">
        Capital is equity. It is kept apart from income everywhere in the system, so funding the
        business can never look like earning from it.
      </p>
      <MisTable<FinancialTransactionRow>
        columns={COLUMNS}
        rows={capital}
        rowKey={(t) => t.id}
        loading={loading}
        mobileTitle={(t) => t.transaction_number}
        mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
        emptyMessage="No capital recorded in this period."
      />
    </div>
  );
};

const Err: React.FC<{ message: string }> = ({ message }) => (
  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
    {message}
  </p>
);

const Total: React.FC<{ label: string; value: number; tone: string }> = ({
  label,
  value,
  tone,
}) => (
  <div className="flex items-center justify-between px-4 py-2.5 text-[13px] font-bold">
    <span>{label}</span>
    <span className={tone === "emerald" ? "text-emerald-700" : "text-red-700"}>
      {formatUGX(value)}
    </span>
  </div>
);
