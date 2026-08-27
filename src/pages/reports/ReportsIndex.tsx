import React from 'react';
import { Link } from '@tanstack/react-router';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Coins,
  Clock,
  FileSpreadsheet,
  FileText,
  PiggyBank,
  Receipt,
  TrendingDown,
  Undo2,
  Users,
} from 'lucide-react';
import { MisPageTitle } from '../../components/mis/MisKit';

const REPORTS = [
  {
    to: '/reports/master-roll',
    icon: FileText,
    title: 'Master Roll',
    desc: 'Every loan disbursed in a date window with schedule and collection drill-downs.',
  },
  {
    to: '/reports/lo-wise-group-realizable',
    icon: Users,
    title: 'LO Wise Group Realizable',
    desc: "Group-level today's realizable, overdue and total realizable per loan officer.",
  },
  {
    to: '/reports/daily-overdue',
    icon: Clock,
    title: 'Daily Overdue Report',
    desc: 'Loans behind on instalments as on a date, with overdue realization stats.',
  },
  {
    to: '/reports/outstanding',
    icon: BarChart3,
    title: 'Outstanding Report',
    desc: 'Active loan balances with collection and schedule exports.',
  },
  {
    to: '/reports/day-collection-list',
    icon: Receipt,
    title: 'Day Collection List',
    desc: 'All collections captured within a date range by loan type.',
  },
  {
    to: '/reports/overdue-collection-list',
    icon: FileSpreadsheet,
    title: 'Overdue Collection List',
    desc: 'Overdue amounts collected in a period for arrears follow-up.',
  },
  {
    to: '/reports/par',
    icon: TrendingDown,
    title: 'Portfolio at Risk',
    desc: 'Arrears ageing buckets and the PAR ratio across the open portfolio.',
  },
  {
    to: '/reports/loan-closure',
    icon: CheckCircle2,
    title: 'Loan Closure Report',
    desc: 'Loans that left the portfolio: repaid to term, settled early or written off.',
  },
  {
    to: '/reports/approvals',
    icon: ClipboardList,
    title: 'Approval Pipeline',
    desc: 'Groups, members and loan applications waiting on a decision or rejected.',
  },
  {
    to: '/reports/reversals',
    icon: Undo2,
    title: 'Reversal Register',
    desc: 'Every disbursement and receipt an Administrator has rolled back.',
  },
  {
    to: '/reports/fee-collection',
    icon: Coins,
    title: 'Fee Collection Report',
    desc: 'Admission, passbook, processing, CRB, security and group maintenance charges collected.',
  },
  {
    to: '/reports/savings',
    icon: PiggyBank,
    title: 'Savings Report',
    desc: 'Deposits and withdrawals per member, group, branch and loan officer, with net movement.',
  },
];

/** Reports landing page — entry cards for every MIS report. */
export const ReportsIndex: React.FC = () => (
  <div className="space-y-4">
    <MisPageTitle>Reports</MisPageTitle>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {REPORTS.map((r) => (
        <Link
          key={r.to}
          to={r.to}
          className="group rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-[#0B4394] hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#0B4394]/10 text-[#0B4394]">
              <r.icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B4394]">{r.title}</h3>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{r.desc}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  </div>
);
