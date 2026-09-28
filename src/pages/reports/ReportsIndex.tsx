import React from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  Coins,
  Clock,
  FileSpreadsheet,
  FileText,
  Landmark,
  PiggyBank,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Undo2,
  Users,
} from "lucide-react";
import { MisPageTitle } from "../../components/mis/MisKit";

/**
 * Financial reports, read from the balanced ledger.
 *
 * Separated from the operational reports below because they answer a
 * different question: not "how is the portfolio doing" but "where is the
 * money". Every one of them reconciles to the same journals.
 */
const FINANCIAL_REPORTS = [
  {
    to: "/reports/financial-position",
    icon: Scale,
    title: "Financial Position",
    desc: "Cash, bank, mobile money, receivables, liabilities and capital, all derived from postings.",
  },
  {
    to: "/reports/cash-flow",
    icon: ArrowLeftRight,
    title: "Cash Flow",
    desc: "Opening to closing balance by category. Internal transfers shown but never counted as income.",
  },
  {
    to: "/reports/profit-and-loss",
    icon: TrendingUp,
    title: "Profit & Loss",
    desc: "Income less operating expenses. Returned loan principal is excluded by construction.",
  },
  {
    to: "/reports/income",
    icon: Coins,
    title: "Income",
    desc: "Interest, penalties, processing, CRB, group maintenance, admission and passbook fees.",
  },
  {
    to: "/reports/expenses",
    icon: TrendingDown,
    title: "Expenses",
    desc: "Spending by category, branch, staff member and the account that actually paid it.",
  },
  {
    to: "/reports/capital",
    icon: Landmark,
    title: "Capital & Funding",
    desc: "Capital introduced and withdrawn, with the destination account and reference.",
  },
  {
    to: "/reports/account-ledger",
    icon: BookOpen,
    title: "Account Ledger",
    desc: "Every posting against one account, with a running balance.",
  },
  {
    to: "/reports/reconciliation",
    icon: Scale,
    title: "Cash & Bank Reconciliation",
    desc: "System balance against the counted balance, the difference, and who resolved it.",
  },
  {
    to: "/reports/transaction-audit",
    icon: ClipboardList,
    title: "Transaction Audit",
    desc: "Every journal with its accounts, related record, user, timestamp and reversal history.",
  },
];

/** Portfolio and operational reports. */
const REPORTS = [
  {
    to: "/reports/loan-portfolio",
    icon: FileSpreadsheet,
    title: "Loan Portfolio",
    desc: "Every loan with principal and interest outstanding kept apart, by branch, officer and product.",
  },
  {
    to: "/reports/collections",
    icon: Receipt,
    title: "Collections",
    desc: "Expected against actual, split into principal, interest and penalties, with the collection rate.",
  },
  {
    to: "/reports/arrears",
    icon: Clock,
    title: "Arrears & Portfolio at Risk",
    desc: "Arrears aged 1-7, 8-30, 31-60, 61-90 and 90+ days with PAR percentages.",
  },
  {
    to: "/reports/branch-financials",
    icon: Building2,
    title: "Branch Report",
    desc: "Liquidity, disbursements, collections, portfolio, arrears, income and expenses per branch.",
  },
  {
    to: "/reports/loan-officer",
    icon: Users,
    title: "Loan Officer Report",
    desc: "Portfolio managed, disbursed, expected against collected, arrears and collection rate.",
  },
  {
    to: "/reports/borrower-statement",
    icon: ClipboardList,
    title: "Borrower Statement",
    desc: "A member's complete history: loans, payments, splits, balances and security held.",
  },
  {
    to: "/reports/master-roll",
    icon: FileText,
    title: "Master Roll",
    desc: "Every loan disbursed in a date window with schedule and collection drill-downs.",
  },
  {
    to: "/reports/lo-wise-group-realizable",
    icon: Users,
    title: "LO Wise Group Realizable",
    desc: "Group-level today's realizable, overdue and total realizable per loan officer.",
  },
  {
    to: "/reports/daily-overdue",
    icon: Clock,
    title: "Daily Overdue Report",
    desc: "Loans behind on instalments as on a date, with overdue realization stats.",
  },
  {
    to: "/reports/outstanding",
    icon: BarChart3,
    title: "Outstanding Report",
    desc: "Active loan balances with collection and schedule exports.",
  },
  {
    to: "/reports/day-collection-list",
    icon: Receipt,
    title: "Day Collection List",
    desc: "All collections captured within a date range by loan type.",
  },
  {
    to: "/reports/overdue-collection-list",
    icon: FileSpreadsheet,
    title: "Overdue Collection List",
    desc: "Overdue amounts collected in a period for arrears follow-up.",
  },
  {
    to: "/reports/par",
    icon: TrendingDown,
    title: "Portfolio at Risk",
    desc: "Arrears ageing buckets and the PAR ratio across the open portfolio.",
  },
  {
    to: "/reports/loan-closure",
    icon: CheckCircle2,
    title: "Loan Closure Report",
    desc: "Loans that left the portfolio: repaid to term, settled early or written off.",
  },
  {
    to: "/reports/approvals",
    icon: ClipboardList,
    title: "Approval Pipeline",
    desc: "Groups, members and loan applications waiting on a decision or rejected.",
  },
  {
    to: "/reports/reversals",
    icon: Undo2,
    title: "Reversal Register",
    desc: "Every disbursement and receipt an Administrator has rolled back.",
  },
  {
    to: "/reports/fee-collection",
    icon: Coins,
    title: "Fee Collection Report",
    desc: "Admission, passbook, processing, CRB, security and group maintenance charges collected.",
  },
  {
    to: "/reports/savings",
    icon: PiggyBank,
    title: "Savings Report",
    desc: "Deposits and withdrawals per member, group, branch and loan officer, with net movement.",
  },
];

/** Reports landing page — entry cards for every MIS report. */
export const ReportsIndex: React.FC = () => (
  <div className="space-y-5">
    <MisPageTitle>Reports</MisPageTitle>

    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Financial
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FINANCIAL_REPORTS.map((r) => (
          <Card key={r.to} {...r} />
        ))}
      </div>
    </section>

    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Portfolio &amp; operations
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.to} {...r} />
        ))}
      </div>
    </section>
  </div>
);

const Card: React.FC<{
  to: string;
  icon: React.ElementType;
  title: string;
  desc: string;
}> = ({ to, icon: Icon, title, desc }) => (
  <Link
    to={to}
    className="group rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-[#0B4394] hover:shadow-md"
  >
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#0B4394]/10 text-[#0B4394]">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B4394]">{title}</h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{desc}</p>
      </div>
    </div>
  </Link>
);
