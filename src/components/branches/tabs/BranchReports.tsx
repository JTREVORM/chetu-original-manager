/**
 * Branch-scoped reports.
 *
 * Each report is built here from the same branch slice the rest of the dashboard
 * uses, then handed to the existing `ReportExportButtons` for PDF and CSV — the
 * export plumbing every other report screen already uses.
 */
import React, { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "../../../lib/router-compat";
import { CLOSED_LOAN_STATUSES } from "../../../types/database.types";
import { daysPastDue, overdueAsOf, type ScheduleRow } from "../../../pages/reports/reportData";
import { useDatabase } from "../../../context/DatabaseContext";
import { money, shortDate, type MisColumn } from "../../mis/MisKit";
import { ReportExportButtons } from "../../mis/ReportExport";
import { NoticeBar, Panel, percent } from "../BranchUi";
import { staffName, type BranchTabProps } from "./shared";

type Row = Record<string, string>;

const text = (key: string) => (row: Row) => row[key] ?? "";
const col = (key: string, label: string, align?: "right"): MisColumn<Row> => ({
  key,
  label,
  align,
  render: (row) => row[key] ?? "",
  text: text(key),
});

export const BranchReports: React.FC<BranchTabProps> = ({
  branch,
  slice,
  metrics,
  staff,
  branchStaff,
}) => {
  const navigate = useNavigate();
  const { loanProducts } = useDatabase();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const clientName = (id: string) => slice.clients.find((c) => c.id === id)?.full_name || "—";
  const productName = (id: string) => loanProducts.find((p) => p.id === id)?.product_name || "—";

  const inRange = (date?: string | null) => Boolean(date && date >= from && date <= to);

  const reports = useMemo(() => {
    const openLoans = slice.loans.filter(
      (l) => !CLOSED_LOAN_STATUSES.includes(l.status) && l.status !== "Pending",
    );

    const performance: Row[] = [
      { metric: "Members on file", value: money(metrics.members.total) },
      { metric: "Active members", value: money(metrics.members.active) },
      { metric: "Groups on file", value: money(metrics.groups.total) },
      { metric: "Active loans", value: money(metrics.loans.active) },
      { metric: "Outstanding portfolio (UGX)", value: money(metrics.portfolio.outstanding) },
      { metric: "Arrears (UGX)", value: money(metrics.portfolio.arrears) },
      { metric: "PAR 30", value: percent(metrics.portfolio.par30Ratio) },
      { metric: "Savings held (UGX)", value: money(metrics.savings.balance) },
      {
        metric: "Collections in period (UGX)",
        value: money(
          slice.repayments
            .filter((r) => inRange(r.payment_date))
            .reduce((t, r) => t + Number(r.amount_paid || 0), 0),
        ),
      },
      {
        metric: "Disbursements in period (UGX)",
        value: money(
          slice.loans
            .filter((l) => inRange(l.disbursed_at?.split("T")[0]))
            .reduce((t, l) => t + Number(l.principal_amount || 0), 0),
        ),
      },
      { metric: "Staff assigned", value: money(branchStaff.length) },
    ];

    const portfolio: Row[] = openLoans.map((loan) => ({
      loan: loan.loan_number,
      member: clientName(loan.client_id),
      product: productName(loan.product_id),
      principal: money(loan.principal_amount),
      outstanding: money(loan.outstanding_balance),
      status: loan.status,
      arrears: String(daysPastDue((loan.schedule || []) as ScheduleRow[], today)),
    }));

    const par: Row[] = openLoans
      .map((loan) => ({
        loan,
        days: daysPastDue((loan.schedule || []) as ScheduleRow[], today),
        overdue: overdueAsOf((loan.schedule || []) as ScheduleRow[], today),
      }))
      .filter((entry) => entry.days > 0)
      .sort((a, b) => b.days - a.days)
      .map((entry) => ({
        loan: entry.loan.loan_number,
        member: clientName(entry.loan.client_id),
        outstanding: money(entry.loan.outstanding_balance),
        overdue: money(entry.overdue),
        days: String(entry.days),
        bucket:
          entry.days <= 30
            ? "PAR 1-30"
            : entry.days <= 60
              ? "PAR 31-60"
              : entry.days <= 90
                ? "PAR 61-90"
                : "PAR 90+",
      }));

    const savings: Row[] = slice.savingsTransactions
      .filter((t) => inRange(t.created_at.split("T")[0]))
      .map((t) => {
        const account = slice.savingsAccounts.find((a) => a.id === t.account_id);
        const owner = account?.client_id
          ? clientName(account.client_id)
          : slice.groups.find((g) => g.id === account?.group_id)?.group_name || "—";
        return {
          transaction: t.transaction_number,
          member: owner,
          type: t.transaction_type,
          amount: money(t.amount),
          balance: money(t.balance_after),
          date: shortDate(t.created_at),
          staff: staffName(staff, t.recorded_by) || "—",
        };
      });

    const collections: Row[] = slice.repayments
      .filter((r) => inRange(r.payment_date))
      .map((r) => ({
        receipt: r.receipt_number,
        member: clientName(r.client_id),
        loan: slice.loans.find((l) => l.id === r.loan_id)?.loan_number || "—",
        amount: money(r.amount_paid),
        type: r.collection_type || "Regular",
        method: r.payment_method,
        date: shortDate(r.payment_date),
        staff: staffName(staff, r.recorded_by) || "—",
      }));

    const members: Row[] = slice.clients.map((client) => ({
      number: client.client_number,
      name: client.full_name,
      phone: client.phone_number || "—",
      group: slice.groups.find((g) => g.id === client.group_id)?.group_name || "—",
      officer: staffName(staff, client.loan_officer_id) || "—",
      status: client.status,
      registered: shortDate(client.date_registered),
    }));

    const staffRows: Row[] = branchStaff.map((member) => ({
      name: member.full_name,
      role: member.role,
      phone: member.phone_number || "—",
      status: member.status,
      collected: money(
        slice.repayments
          .filter((r) => r.recorded_by === member.id && inRange(r.payment_date))
          .reduce((t, r) => t + Number(r.amount_paid || 0), 0),
      ),
      since: shortDate(member.created_at),
    }));

    const cash: Row[] = [
      ...slice.bankTransactions
        .filter((t) => inRange(t.transaction_date))
        .map((t) => ({
          date: shortDate(t.transaction_date),
          source: "Bank",
          description: `${t.transaction_type} — ${t.category || "Uncategorised"}`,
          direction: t.transaction_type === "Deposit" ? "In" : "Out",
          amount: money(t.amount),
        })),
      ...slice.expenses
        .filter((e) => inRange(e.expense_date))
        .map((e) => ({
          date: shortDate(e.expense_date),
          source: "Expense",
          description: `${e.category} — ${e.description}`,
          direction: "Out",
          amount: money(e.amount),
        })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    return [
      {
        id: "performance",
        title: "Branch Performance Report",
        description: "Headline members, portfolio, arrears and savings position.",
        columns: [col("metric", "Metric"), col("value", "Value", "right")],
        rows: performance,
      },
      {
        id: "portfolio",
        title: "Loan Portfolio Report",
        description: "Every open loan with its balance and arrears age.",
        columns: [
          col("loan", "Loan"),
          col("member", "Member"),
          col("product", "Product"),
          col("principal", "Principal", "right"),
          col("outstanding", "Outstanding", "right"),
          col("status", "Status"),
          col("arrears", "Days in Arrears", "right"),
        ],
        rows: portfolio,
      },
      {
        id: "par",
        title: "PAR Report",
        description: "Loans behind schedule, bucketed by arrears age.",
        columns: [
          col("loan", "Loan"),
          col("member", "Member"),
          col("outstanding", "Outstanding", "right"),
          col("overdue", "Overdue", "right"),
          col("days", "Days", "right"),
          col("bucket", "Bucket"),
        ],
        rows: par,
      },
      {
        id: "collections",
        title: "Collections Report",
        description: "Receipts recorded in the selected period.",
        columns: [
          col("receipt", "Receipt"),
          col("member", "Member"),
          col("loan", "Loan"),
          col("amount", "Amount", "right"),
          col("type", "Type"),
          col("method", "Method"),
          col("date", "Date"),
          col("staff", "Received By"),
        ],
        rows: collections,
      },
      {
        id: "savings",
        title: "Savings Report",
        description: "Deposits, withdrawals and interest in the selected period.",
        columns: [
          col("transaction", "Transaction"),
          col("member", "Member / Group"),
          col("type", "Type"),
          col("amount", "Amount", "right"),
          col("balance", "Balance After", "right"),
          col("date", "Date"),
          col("staff", "Recorded By"),
        ],
        rows: savings,
      },
      {
        id: "members",
        title: "Member Report",
        description: "Every member admitted at this branch.",
        columns: [
          col("number", "Member ID"),
          col("name", "Name"),
          col("phone", "Phone"),
          col("group", "Group"),
          col("officer", "Loan Officer"),
          col("status", "Status"),
          col("registered", "Registered"),
        ],
        rows: members,
      },
      {
        id: "staff",
        title: "Staff Performance Report",
        description: "Staff assigned here and what they collected in the period.",
        columns: [
          col("name", "Staff Name"),
          col("role", "Role"),
          col("phone", "Phone"),
          col("status", "Status"),
          col("collected", "Collected", "right"),
          col("since", "Member Since"),
        ],
        rows: staffRows,
      },
      {
        id: "cash",
        title: "Cash Report",
        description: "Bank movements and expenses booked to this branch.",
        columns: [
          col("date", "Date"),
          col("source", "Source"),
          col("description", "Description"),
          col("direction", "Direction"),
          col("amount", "Amount", "right"),
        ],
        rows: cash,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice, metrics, staff, branchStaff, from, to, loanProducts]);

  const period = `${shortDate(from)} to ${shortDate(to)}`;

  return (
    <div className="space-y-4">
      <Panel
        title="Reporting period"
        subtitle="Applies to the collections, savings, staff and cash reports below"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="report-from" className="form-label">
              From
            </label>
            <input
              id="report-from"
              type="date"
              className="form-field"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="report-to" className="form-label">
              To
            </label>
            <input
              id="report-to"
              type="date"
              className="form-field"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setFrom(monthStart);
                setTo(today);
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-4 text-[12px] font-bold text-slate-700 hover:bg-slate-50 md:h-[32px]"
            >
              Reset to this month
            </button>
          </div>
        </div>
      </Panel>

      <NoticeBar tone="blue">
        These exports cover {branch.branch_name} only. The full institution-wide versions, with
        officer and group filters, are under{" "}
        <button type="button" onClick={() => navigate("/reports")} className="font-bold underline">
          Reports
        </button>
        .
      </NoticeBar>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {reports.map((report) => (
          <div
            key={report.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0B4394]">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <h3 className="truncate text-[13px] font-bold text-slate-900">{report.title}</h3>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {report.description}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                {report.rows.length} row{report.rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="shrink-0">
              <ReportExportButtons
                title={`${report.title} — ${branch.branch_name}`}
                columns={report.columns}
                rows={report.rows}
                period={period}
                subtitle={`${branch.branch_name} (${branch.branch_code}) — Chetu Microfinance Ltd`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
