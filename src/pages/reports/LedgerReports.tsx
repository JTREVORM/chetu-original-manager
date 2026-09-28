/**
 * Account Ledger, Reconciliation, Branch, Loan Officer, Borrower Statement
 * and Transaction Audit.
 *
 * All six read database views directly, so they reconcile with the dashboard
 * and with each other by construction rather than by coincidence.
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
import { fetchAccountLedger } from "../../lib/financial/reports";
import { formatUGX } from "../../lib/loanCalculations";
import {
  monthToDate,
  useAccountBalancesView,
  useBorrowerStatementsView,
  useBranchFinancialsView,
  useOfficerPerformanceView,
  useReconciliationView,
  useTransactionsView,
} from "./financialReportData";
import { Stat } from "./LoanPortfolioReport";
import type {
  AccountLedgerRow,
  AccountReconciliationRow,
  BorrowerStatementRow,
  BranchFinancialsRow,
  FinancialTransactionRow,
  OfficerPerformanceRow,
} from "../../types/database.types";

const Err: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
      {message}
    </p>
  ) : null;

// ---------------------------------------------------------------------------

export const AccountLedgerReport: React.FC = () => {
  const { rows: accounts } = useAccountBalancesView();
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState<AccountLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liquid = accounts.filter((a) => a.account_class === "asset_liquid");
  const selected = accounts.find((a) => a.account_id === accountId);

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAccountLedger(accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the ledger");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const COLUMNS = [
    {
      key: "date",
      label: "Date",
      width: "10%",
      render: (r: AccountLedgerRow) => shortDate(r.transaction_date),
      text: (r: AccountLedgerRow) => shortDate(r.transaction_date),
    },
    {
      key: "no",
      label: "Journal",
      width: "14%",
      render: (r: AccountLedgerRow) => r.transaction_number,
      text: (r: AccountLedgerRow) => r.transaction_number,
    },
    {
      key: "desc",
      label: "Description",
      width: "38%",
      render: (r: AccountLedgerRow) => r.description,
      text: (r: AccountLedgerRow) => r.description,
    },
    {
      key: "in",
      label: "In",
      align: "right" as const,
      width: "12%",
      render: (r: AccountLedgerRow) => (r.direction === "debit" ? money(Number(r.amount)) : "—"),
      text: (r: AccountLedgerRow) => (r.direction === "debit" ? money(Number(r.amount)) : "—"),
    },
    {
      key: "out",
      label: "Out",
      align: "right" as const,
      width: "12%",
      render: (r: AccountLedgerRow) => (r.direction === "credit" ? money(Number(r.amount)) : "—"),
      text: (r: AccountLedgerRow) => (r.direction === "credit" ? money(Number(r.amount)) : "—"),
    },
    {
      key: "bal",
      label: "Balance",
      align: "right" as const,
      width: "14%",
      render: (r: AccountLedgerRow) => (
        <span className="font-semibold">{money(Number(r.running_balance))}</span>
      ),
      text: (r: AccountLedgerRow) => money(Number(r.running_balance)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={<ReportExportButtons title="Account Ledger" columns={COLUMNS} rows={rows} />}
      >
        Account Ledger
      </MisPageTitle>
      <MisFilters>
        <Field label="Account" className="min-w-[240px]">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="form-field"
          >
            <option value="">Choose an account…</option>
            {liquid.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </Field>
        <SearchButton onClick={load} label="Open ledger" />
      </MisFilters>
      <Err message={error} />
      {selected && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Opening" value={formatUGX(Number(selected.opening_balance))} />
          <Stat label="Inflows" value={formatUGX(Number(selected.total_inflows))} />
          <Stat label="Outflows" value={formatUGX(Number(selected.total_outflows))} />
          <Stat label="Closing" value={formatUGX(Number(selected.current_balance))} />
        </div>
      )}
      <MisTable<AccountLedgerRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => `${r.transaction_id}-${r.line_no}`}
        loading={loading}
        hasSearched={!!accountId}
        idleMessage="Choose an account and press Open ledger."
        maxHeight="60vh"
        mobileTitle={(r) => r.transaction_number}
        mobileSubtitle={(r) => `${shortDate(r.transaction_date)} • ${money(Number(r.amount))}`}
        emptyMessage="Nothing has been posted to this account."
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const ReconciliationReport: React.FC = () => {
  const { rows, loading, error } = useReconciliationView();
  const COLUMNS = [
    {
      key: "acct",
      label: "Account",
      width: "20%",
      render: (r: AccountReconciliationRow) => r.account_name,
      text: (r: AccountReconciliationRow) => r.account_name,
    },
    {
      key: "sys",
      label: "System balance",
      align: "right" as const,
      width: "14%",
      render: (r: AccountReconciliationRow) => money(Number(r.system_balance)),
      text: (r: AccountReconciliationRow) => money(Number(r.system_balance)),
    },
    {
      key: "actual",
      label: "Counted / statement",
      align: "right" as const,
      width: "15%",
      render: (r: AccountReconciliationRow) =>
        r.actual_balance == null ? "—" : money(Number(r.actual_balance)),
      text: (r: AccountReconciliationRow) =>
        r.actual_balance == null ? "—" : money(Number(r.actual_balance)),
    },
    {
      key: "diff",
      label: "Difference",
      align: "right" as const,
      width: "12%",
      render: (r: AccountReconciliationRow) =>
        r.difference == null ? (
          "—"
        ) : (
          <span className={Number(r.difference) === 0 ? "" : "font-bold text-red-700"}>
            {money(Number(r.difference))}
          </span>
        ),
      text: (r: AccountReconciliationRow) =>
        r.difference == null ? "—" : money(Number(r.difference)),
    },
    {
      key: "on",
      label: "Date",
      width: "10%",
      render: (r: AccountReconciliationRow) => shortDate(r.reconciled_on) || "—",
      text: (r: AccountReconciliationRow) => shortDate(r.reconciled_on) || "—",
    },
    {
      key: "by",
      label: "Reconciled by",
      width: "13%",
      render: (r: AccountReconciliationRow) => r.reconciled_by_name || "—",
      text: (r: AccountReconciliationRow) => r.reconciled_by_name || "—",
    },
    {
      key: "reason",
      label: "Adjustment reason",
      width: "16%",
      render: (r: AccountReconciliationRow) => r.adjustment_reason || "—",
      text: (r: AccountReconciliationRow) => r.adjustment_reason || "—",
    },
  ];

  const unresolved = rows.filter((r) => r.state === "Unresolved difference");

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Cash and Bank Reconciliation" columns={COLUMNS} rows={rows} />
        }
      >
        Cash &amp; Bank Reconciliation
      </MisPageTitle>
      <Err message={error} />
      {unresolved.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          {unresolved.length} account{unresolved.length === 1 ? " has" : "s have"} an unresolved
          difference. It stays visible until an Administrator explains and posts it — nothing is
          absorbed quietly.
        </p>
      )}
      <MisTable<AccountReconciliationRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.account_id}
        loading={loading}
        mobileTitle={(r) => r.account_name}
        mobileSubtitle={(r) => r.state}
        emptyMessage="No accounts to reconcile."
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const BranchFinancialReport: React.FC = () => {
  const { rows, loading, error } = useBranchFinancialsView();
  const COLUMNS = [
    {
      key: "branch",
      label: "Branch",
      width: "16%",
      render: (r: BranchFinancialsRow) => r.branch_name,
      text: (r: BranchFinancialsRow) => r.branch_name,
    },
    {
      key: "liq",
      label: "Liquidity",
      align: "right" as const,
      width: "12%",
      render: (r: BranchFinancialsRow) => money(Number(r.liquidity)),
      text: (r: BranchFinancialsRow) => money(Number(r.liquidity)),
    },
    {
      key: "disb",
      label: "Disbursed",
      align: "right" as const,
      width: "12%",
      render: (r: BranchFinancialsRow) => money(Number(r.principal_disbursed)),
      text: (r: BranchFinancialsRow) => money(Number(r.principal_disbursed)),
    },
    {
      key: "coll",
      label: "Collected",
      align: "right" as const,
      width: "12%",
      render: (r: BranchFinancialsRow) => money(Number(r.total_collected)),
      text: (r: BranchFinancialsRow) => money(Number(r.total_collected)),
    },
    {
      key: "out",
      label: "Principal out",
      align: "right" as const,
      width: "12%",
      render: (r: BranchFinancialsRow) => money(Number(r.principal_outstanding)),
      text: (r: BranchFinancialsRow) => money(Number(r.principal_outstanding)),
    },
    {
      key: "arr",
      label: "Arrears",
      align: "right" as const,
      width: "11%",
      render: (r: BranchFinancialsRow) =>
        Number(r.arrears) > 0 ? (
          <span className="font-bold text-red-700">{money(Number(r.arrears))}</span>
        ) : (
          "—"
        ),
      text: (r: BranchFinancialsRow) => money(Number(r.arrears)),
    },
    {
      key: "inc",
      label: "Income",
      align: "right" as const,
      width: "9%",
      render: (r: BranchFinancialsRow) => money(Number(r.income)),
      text: (r: BranchFinancialsRow) => money(Number(r.income)),
    },
    {
      key: "exp",
      label: "Expenses",
      align: "right" as const,
      width: "9%",
      render: (r: BranchFinancialsRow) => money(Number(r.expenses)),
      text: (r: BranchFinancialsRow) => money(Number(r.expenses)),
    },
    {
      key: "net",
      label: "Net result",
      align: "right" as const,
      width: "7%",
      render: (r: BranchFinancialsRow) => (
        <span className="font-semibold">{money(Number(r.net_result))}</span>
      ),
      text: (r: BranchFinancialsRow) => money(Number(r.net_result)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={<ReportExportButtons title="Branch Financials" columns={COLUMNS} rows={rows} />}
      >
        Branch Report
      </MisPageTitle>
      <Err message={error} />
      <MisTable<BranchFinancialsRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.branch_id}
        loading={loading}
        mobileTitle={(r) => r.branch_name}
        mobileSubtitle={(r) => `Liquidity ${money(Number(r.liquidity))}`}
        emptyMessage="No branches."
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const LoanOfficerReport: React.FC = () => {
  const { rows, loading, error } = useOfficerPerformanceView();
  const COLUMNS = [
    {
      key: "officer",
      label: "Officer",
      width: "18%",
      render: (r: OfficerPerformanceRow) => r.officer_name,
      text: (r: OfficerPerformanceRow) => r.officer_name,
    },
    {
      key: "role",
      label: "Role",
      width: "12%",
      render: (r: OfficerPerformanceRow) => r.role,
      text: (r: OfficerPerformanceRow) => r.role,
    },
    {
      key: "borrowers",
      label: "Borrowers",
      align: "right" as const,
      width: "10%",
      render: (r: OfficerPerformanceRow) => String(r.active_borrowers),
      text: (r: OfficerPerformanceRow) => String(r.active_borrowers),
    },
    {
      key: "portfolio",
      label: "Portfolio",
      align: "right" as const,
      width: "13%",
      render: (r: OfficerPerformanceRow) => money(Number(r.portfolio_managed)),
      text: (r: OfficerPerformanceRow) => money(Number(r.portfolio_managed)),
    },
    {
      key: "disb",
      label: "Disbursed",
      align: "right" as const,
      width: "12%",
      render: (r: OfficerPerformanceRow) => money(Number(r.amount_disbursed)),
      text: (r: OfficerPerformanceRow) => money(Number(r.amount_disbursed)),
    },
    {
      key: "exp",
      label: "Expected",
      align: "right" as const,
      width: "12%",
      render: (r: OfficerPerformanceRow) => money(Number(r.expected_collections)),
      text: (r: OfficerPerformanceRow) => money(Number(r.expected_collections)),
    },
    {
      key: "act",
      label: "Collected",
      align: "right" as const,
      width: "12%",
      render: (r: OfficerPerformanceRow) => money(Number(r.actual_collections)),
      text: (r: OfficerPerformanceRow) => money(Number(r.actual_collections)),
    },
    {
      key: "od",
      label: "Overdue",
      align: "right" as const,
      width: "11%",
      render: (r: OfficerPerformanceRow) =>
        Number(r.overdue_portfolio) > 0 ? (
          <span className="font-bold text-red-700">{money(Number(r.overdue_portfolio))}</span>
        ) : (
          "—"
        ),
      text: (r: OfficerPerformanceRow) => money(Number(r.overdue_portfolio)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Loan Officer Performance" columns={COLUMNS} rows={rows} />
        }
      >
        Loan Officer Report
      </MisPageTitle>
      <Err message={error} />
      <MisTable<OfficerPerformanceRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.officer_id}
        loading={loading}
        mobileTitle={(r) => r.officer_name}
        mobileSubtitle={(r) =>
          `${r.active_borrowers} borrower(s) • ${money(Number(r.portfolio_managed))}`
        }
        emptyMessage="No officers with a portfolio."
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const BorrowerStatementReport: React.FC = () => {
  const { rows, loading, error } = useBorrowerStatementsView();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const filtered = useMemo(() => {
    const q = applied.trim().toLowerCase();
    const withHistory = rows.filter((r) => r.loans_count > 0 || Number(r.fees_paid) > 0);
    if (!q) return withHistory;
    return withHistory.filter((r) =>
      `${r.full_name} ${r.client_number} ${r.group_name || ""}`.toLowerCase().includes(q),
    );
  }, [rows, applied]);

  const COLUMNS = [
    {
      key: "member",
      label: "Member",
      width: "18%",
      render: (r: BorrowerStatementRow) => r.full_name,
      text: (r: BorrowerStatementRow) => r.full_name,
    },
    {
      key: "no",
      label: "Number",
      width: "12%",
      render: (r: BorrowerStatementRow) => r.client_number,
      text: (r: BorrowerStatementRow) => r.client_number,
    },
    {
      key: "group",
      label: "Group",
      width: "12%",
      render: (r: BorrowerStatementRow) => r.group_name || "—",
      text: (r: BorrowerStatementRow) => r.group_name || "—",
    },
    {
      key: "loans",
      label: "Loans",
      align: "right" as const,
      width: "7%",
      render: (r: BorrowerStatementRow) => String(r.loans_count),
      text: (r: BorrowerStatementRow) => String(r.loans_count),
    },
    {
      key: "disb",
      label: "Disbursed",
      align: "right" as const,
      width: "11%",
      render: (r: BorrowerStatementRow) => money(Number(r.principal_disbursed)),
      text: (r: BorrowerStatementRow) => money(Number(r.principal_disbursed)),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right" as const,
      width: "10%",
      render: (r: BorrowerStatementRow) => money(Number(r.total_paid)),
      text: (r: BorrowerStatementRow) => money(Number(r.total_paid)),
    },
    {
      key: "prin",
      label: "Principal out",
      align: "right" as const,
      width: "11%",
      render: (r: BorrowerStatementRow) => money(Number(r.principal_outstanding)),
      text: (r: BorrowerStatementRow) => money(Number(r.principal_outstanding)),
    },
    {
      key: "int",
      label: "Interest out",
      align: "right" as const,
      width: "10%",
      render: (r: BorrowerStatementRow) => money(Number(r.interest_outstanding)),
      text: (r: BorrowerStatementRow) => money(Number(r.interest_outstanding)),
    },
    {
      key: "sec",
      label: "Security held",
      align: "right" as const,
      width: "9%",
      render: (r: BorrowerStatementRow) => money(Number(r.security_held)),
      text: (r: BorrowerStatementRow) => money(Number(r.security_held)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={
          <ReportExportButtons title="Borrower Statements" columns={COLUMNS} rows={filtered} />
        }
      >
        Borrower Statement
      </MisPageTitle>
      <MisFilters>
        <Field label="Member, number or group" className="min-w-[240px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={() => setApplied(search)} />
      </MisFilters>
      <Err message={error} />
      <MisTable<BorrowerStatementRow>
        columns={COLUMNS}
        rows={filtered}
        rowKey={(r) => r.client_id}
        loading={loading}
        maxHeight="60vh"
        mobileTitle={(r) => r.full_name}
        mobileSubtitle={(r) => `${r.client_number} • ${money(Number(r.total_outstanding))} owing`}
        emptyMessage="No members with a financial history."
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const TransactionAuditReport: React.FC = () => {
  const initial = monthToDate();
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [type, setType] = useState("");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to, entryType: "" });

  const { rows, loading, error } = useTransactionsView({
    from: applied.from,
    to: applied.to,
    entryType: applied.entryType || null,
  });

  const COLUMNS = [
    {
      key: "no",
      label: "Transaction",
      width: "12%",
      render: (t: FinancialTransactionRow) => t.transaction_number,
      text: (t: FinancialTransactionRow) => t.transaction_number,
    },
    {
      key: "when",
      label: "Date & time",
      width: "13%",
      render: (t: FinancialTransactionRow) =>
        `${shortDate(t.transaction_date)} ${new Date(t.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
      text: (t: FinancialTransactionRow) => `${shortDate(t.transaction_date)}`,
    },
    {
      key: "type",
      label: "Type",
      width: "11%",
      render: (t: FinancialTransactionRow) => t.entry_type.replace(/_/g, " "),
      text: (t: FinancialTransactionRow) => t.entry_type,
    },
    {
      key: "accts",
      label: "Source → destination",
      width: "18%",
      render: (t: FinancialTransactionRow) => t.accounts || "—",
      text: (t: FinancialTransactionRow) => t.accounts || "—",
    },
    {
      key: "related",
      label: "Related record",
      width: "13%",
      render: (t: FinancialTransactionRow) =>
        t.loan_number || t.receipt_number || t.expense_number || "—",
      text: (t: FinancialTransactionRow) =>
        t.loan_number || t.receipt_number || t.expense_number || "—",
    },
    {
      key: "branch",
      label: "Branch",
      width: "9%",
      render: (t: FinancialTransactionRow) => t.branch_name || "—",
      text: (t: FinancialTransactionRow) => t.branch_name || "—",
    },
    {
      key: "user",
      label: "User",
      width: "11%",
      render: (t: FinancialTransactionRow) => t.created_by_name || "—",
      text: (t: FinancialTransactionRow) => t.created_by_name || "—",
    },
    {
      key: "rev",
      label: "Reversal",
      width: "8%",
      render: (t: FinancialTransactionRow) =>
        t.status === "reversed"
          ? `by ${t.reversed_by_number}`
          : t.status === "reversal"
            ? `of ${t.reverses_number}`
            : "—",
      text: (t: FinancialTransactionRow) => t.status,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right" as const,
      width: "5%",
      render: (t: FinancialTransactionRow) => money(Number(t.amount)),
      text: (t: FinancialTransactionRow) => money(Number(t.amount)),
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle
        right={<ReportExportButtons title="Transaction Audit" columns={COLUMNS} rows={rows} />}
      >
        Transaction Audit
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
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className="form-field">
            <option value="">All types</option>
            {[
              "capital_injection",
              "capital_withdrawal",
              "disbursement",
              "repayment",
              "fee_collection",
              "expense",
              "internal_transfer",
              "writeoff",
              "reconciliation_adjustment",
              "reversal",
            ].map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <SearchButton onClick={() => setApplied({ from, to, entryType: type })} />
      </MisFilters>
      <Err message={error} />
      <MisTable<FinancialTransactionRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        maxHeight="65vh"
        mobileTitle={(t) => t.transaction_number}
        mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
        emptyMessage="No transactions in this period."
      />
    </div>
  );
};
