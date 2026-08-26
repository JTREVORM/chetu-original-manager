import React, { useMemo } from 'react';
import { useNavigate } from '../lib/router-compat';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { formatUGX } from '../lib/loanCalculations';
import { CLOSED_LOAN_STATUSES, type Loan } from '../types/database.types';
import { AlertTriangle, ArrowRight, Clock, FileSpreadsheet, UserPlus, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const NAVY = '#0B4394';
const todayISO = () => new Date().toISOString().split('T')[0]!;

/** Days past due of the oldest unpaid instalment; 0 when the loan is current. */
function daysPastDue(loan: Loan, asOn: string): number {
  const overdue = (loan.schedule || [])
    .filter((r) => r.due_date <= asOn && Number(r.installment_amount || 0) - Number(r.paid_amount || 0) > 0)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const oldest = overdue[0];
  if (!oldest) return 0;
  return Math.max(0, Math.floor((new Date(asOn).getTime() - new Date(oldest.due_date).getTime()) / 86400000));
}

/** Amount already due and still unpaid. */
function arrearsOf(loan: Loan, asOn: string): number {
  return (loan.schedule || [])
    .filter((r) => r.due_date <= asOn)
    .reduce((s, r) => s + Math.max(0, Number(r.installment_amount || 0) - Number(r.paid_amount || 0)), 0);
}

/**
 * Operational dashboard.
 *
 * What a person sees is bounded by what they are responsible for:
 *   Loan Officer   their own members, loans and collections. No institutional
 *                  cash position — they do not hold the ledger, and row level
 *                  security denies them those rows anyway, so showing the tile
 *                  would only ever print zero.
 *   Branch Manager everything in their branch, plus the queues waiting on their
 *                  approval and how each of their officers is performing.
 *   Administrator  the institution, plus the branch-by-branch comparison.
 *   Auditor        the institution, read-only, with no action links.
 *
 * Every figure below is derived from the already branch-scoped collections the
 * database context exposes, so the scoping is enforced once rather than
 * re-implemented per tile.
 */
export const Dashboard: React.FC = () => {
  const { role, isAdmin, isLoanOfficer, isBranchManager, isAuditor, user } = useAuth();
  const {
    clients,
    clientGroups,
    loanApplications,
    loans,
    repayments,
    branches,
    expenses,
    currentBankBalance,
    totalCollectionsToday,
    totalCollectionsWeekly,
    totalCollectionsMonthly,
    totalSavingsBalance,
  } = useDatabase();
  const navigate = useNavigate();

  const asOn = todayISO();
  const institutionWide = isAdmin || isAuditor;

  const m = useMemo(() => {
    const open = loans.filter((l) => !CLOSED_LOAN_STATUSES.includes(l.status) && l.status !== 'Pending');
    const outstanding = open.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);

    const inArrears = open.filter((l) => daysPastDue(l, asOn) > 0);
    const par30 = open.filter((l) => daysPastDue(l, asOn) > 30);
    const par30Value = par30.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
    const arrears = open.reduce((s, l) => s + arrearsOf(l, asOn), 0);

    // Collection rate: of everything that has fallen due, how much came in.
    const dueToDate = open.reduce(
      (s, l) => s + (l.schedule || []).filter((r) => r.due_date <= asOn)
        .reduce((x, r) => x + Number(r.installment_amount || 0), 0),
      0,
    );
    const paidOfDue = Math.max(0, dueToDate - arrears);

    const monthStart = asOn.slice(0, 8) + '01';
    const disbursedThisMonth = loans
      .filter((l) => l.disbursed_at && l.disbursed_at.split('T')[0]! >= monthStart)
      .reduce((s, l) => s + Number(l.principal_amount || 0), 0);

    return {
      open,
      outstanding,
      inArrearsCount: inArrears.length,
      par30Count: par30.length,
      par30Value,
      par30Ratio: outstanding > 0 ? (par30Value / outstanding) * 100 : 0,
      arrears,
      collectionRate: dueToDate > 0 ? (paidOfDue / dueToDate) * 100 : 100,
      disbursedThisMonth,
      activeMembers: clients.filter((c) => c.status === 'Active' && c.approval_status === 'Approved').length,
      activeGroups: clientGroups.filter((g) => g.status === 'Active' && g.approval_status === 'Approved').length,
      pendingGroups: clientGroups.filter((g) => g.approval_status === 'Pending').length,
      pendingMembers: clients.filter((c) => c.approval_status === 'Pending').length,
      pendingApps: loanApplications.filter((a) => a.status === 'Pending').length,
      awaitingDisburse: loans.filter((l) => l.status === 'Pending').length,
      rejectedApps: loanApplications.filter((a) => a.status === 'Rejected').length,
    };
  }, [loans, clients, clientGroups, loanApplications, asOn]);

  // Six-month series, zero-filled — empty months are shown as zero rather than
  // hidden, so a gap in lending is visible instead of silently smoothed over.
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - (5 - i));
        return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString(undefined, { month: 'short' }) };
      }),
    [],
  );

  const disbursementTrend = months.map(({ key, label }) => ({
    month: label,
    Disbursed: loans.filter((l) => (l.disbursed_at || '').startsWith(key)).reduce((s, l) => s + Number(l.principal_amount || 0), 0),
    Collected: repayments.filter((r) => r.payment_date.startsWith(key)).reduce((s, r) => s + Number(r.amount_paid || 0), 0),
  }));

  const ageing = useMemo(() => {
    const buckets = [
      { name: 'Current', min: 0, max: 0, color: '#059669' },
      { name: '1–30', min: 1, max: 30, color: '#F59E0B' },
      { name: '31–60', min: 31, max: 60, color: '#EA580C' },
      { name: '61–90', min: 61, max: 90, color: '#DC2626' },
      { name: '90+', min: 91, max: Infinity, color: '#7F1D1D' },
    ];
    return buckets
      .map((b) => ({
        ...b,
        value: m.open.filter((l) => { const d = daysPastDue(l, asOn); return d >= b.min && d <= b.max; })
          .reduce((s, l) => s + Number(l.outstanding_balance || 0), 0),
      }))
      .filter((b) => b.value > 0);
  }, [m.open, asOn]);

  /** Portfolio broken down by whoever owns it — branches for an administrator, officers for a manager. */
  const breakdown = useMemo(() => {
    const key = (l: Loan) => {
      const c = clients.find((x) => x.id === l.client_id);
      if (!c) return null;
      if (institutionWide) return c.branch_id || null;
      return c.loan_officer_id || null;
    };
    const map = new Map<string, { outstanding: number; arrears: number; loans: number }>();
    for (const l of m.open) {
      const k = key(l);
      if (!k) continue;
      const e = map.get(k) || { outstanding: 0, arrears: 0, loans: 0 };
      e.outstanding += Number(l.outstanding_balance || 0);
      e.arrears += arrearsOf(l, asOn);
      e.loans += 1;
      map.set(k, e);
    }
    const nameOf = (id: string) =>
      institutionWide
        ? branches.find((b) => b.id === id)?.branch_name || 'Unassigned'
        : clientGroups.find((g) => g.loan_officer_id === id)?.loan_officer_name || 'Unassigned';
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: nameOf(id), ...v }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [m.open, clients, branches, clientGroups, institutionWide, asOn]);

  const myBranchName = branches.length === 1 ? branches[0]!.branch_name : `${branches.length} branches`;
  const scopeLabel = isLoanOfficer ? 'My portfolio' : isBranchManager ? myBranchName : 'All branches';

  // What is sitting in a queue waiting on this person.
  const queue = useMemo(() => {
    const items: { label: string; count: number; to: string }[] = [];
    if (isLoanOfficer) {
      items.push({ label: 'My rejected applications', count: m.rejectedApps, to: '/loan-rejected' });
      items.push({ label: 'Members awaiting approval', count: m.pendingMembers, to: '/member-waiting-approval' });
      items.push({ label: 'Groups awaiting approval', count: m.pendingGroups, to: '/groups/waiting-approval' });
      items.push({ label: 'Loans to disburse', count: m.awaitingDisburse, to: '/loan-waiting-disburse' });
    } else {
      items.push({ label: 'Groups to approve', count: m.pendingGroups, to: '/groups/waiting-approval' });
      items.push({ label: 'Members to approve', count: m.pendingMembers, to: '/member-waiting-approval' });
      items.push({ label: 'Loan applications to review', count: m.pendingApps, to: '/loan-waiting-approval' });
      items.push({ label: 'Loans awaiting disbursement', count: m.awaitingDisburse, to: '/loan-waiting-disburse' });
    }
    return items;
  }, [m, isLoanOfficer]);

  const outstandingLabel = isLoanOfficer ? 'My outstanding portfolio' : isBranchManager ? 'Branch portfolio' : 'Gross loan portfolio';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || 'there').trim().split(/\s+/)[0]!;

  // One sentence that says what is actually waiting, rather than a generic blurb.
  const pendingForMe = queue.reduce((s, q) => s + q.count, 0);
  const welcomeLine = isAuditor
    ? 'Here is the institution as it stands today.'
    : pendingForMe > 0
      ? `You have ${pendingForMe} item${pendingForMe === 1 ? '' : 's'} waiting for your attention.`
      : m.arrears > 0
        ? `Nothing is waiting on you — ${formatUGX(m.arrears)} is in arrears and needs following up.`
        : 'Nothing is waiting on you and no loan is in arrears.';

  return (
    <div className="space-y-4 pb-16">
      {/* Welcome band. Greets by time of day and first name, then states in one
          line what this person is accountable for — the greeting earns its place
          by carrying the scope, rather than being decoration above the numbers. */}
      <div className="overflow-hidden rounded-lg bg-[#0B4394] text-white shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-blue-200">{greeting},</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-[28px]">{firstName}</h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-blue-100">{welcomeLine}</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-200">{role}</p>
            <p className="text-[13px] font-semibold">{scopeLabel}</p>
            <p className="mt-1 text-[12px] text-blue-200">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        {isAuditor && (
          <p className="border-t border-white/15 bg-white/5 px-5 py-2 text-[12px] text-blue-100">
            Auditor access — everything is visible, nothing can be changed.
          </p>
        )}
      </div>

      {/* Headline figures. Administrators and Auditors get the cash position;
          field staff get the portfolio they are accountable for. */}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${institutionWide ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <Kpi
          label={outstandingLabel}
          value={formatUGX(m.outstanding)}
          foot={`${m.open.length} open loan${m.open.length === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Collections this week"
          value={formatUGX(totalCollectionsWeekly)}
          foot={`Today ${formatUGX(totalCollectionsToday)} · Month ${formatUGX(totalCollectionsMonthly)}`}
          tone="positive"
        />
        <Kpi
          label="Portfolio at risk (30+ days)"
          value={`${m.par30Ratio.toFixed(1)}%`}
          foot={`${formatUGX(m.par30Value)} across ${m.par30Count} loan${m.par30Count === 1 ? '' : 's'}`}
          tone={m.par30Ratio > 10 ? 'negative' : m.par30Ratio > 5 ? 'warn' : 'positive'}
        />
        {institutionWide && (
          <Kpi
            label="Cash at bank"
            value={formatUGX(currentBankBalance)}
            foot={`Savings held ${formatUGX(totalSavingsBalance)}`}
          />
        )}
      </div>

      {/* Second band — operational detail. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="Collection rate" value={`${m.collectionRate.toFixed(1)}%`} hint="of instalments due to date" />
        <Mini label="Arrears" value={formatUGX(m.arrears)} hint={`${m.inArrearsCount} loan(s) behind`} tone={m.arrears > 0 ? 'negative' : undefined} />
        <Mini label="Disbursed this month" value={formatUGX(m.disbursedThisMonth)} hint="principal released" />
        <Mini
          label={isLoanOfficer ? 'My members' : 'Active members'}
          value={String(m.activeMembers)}
          hint={`${m.activeGroups} group${m.activeGroups === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Action queue */}
        <Panel title="Needs attention" className="lg:col-span-1">
          <ul className="divide-y divide-slate-100">
            {queue.every((q) => q.count === 0) && (
              <li className="px-4 py-6 text-center text-[13px] text-slate-400">Nothing is waiting on you.</li>
            )}
            {queue
              .filter((q) => q.count > 0)
              .map((q) => (
                <li key={q.label}>
                  <button
                    type="button"
                    onClick={() => navigate(q.to)}
                    disabled={isAuditor}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 truncate text-[13px] text-slate-700">{q.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-800">{q.count}</span>
                      {!isAuditor && <ArrowRight className="h-3.5 w-3.5 text-slate-400" />}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </Panel>

        {/* Disbursed vs collected */}
        <Panel title="Disbursed vs collected — last 6 months" className="lg:col-span-2">
          <div className="h-56 px-2 pb-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={disbursementTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NAVY} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64}
                  tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: number) => formatUGX(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Area type="monotone" dataKey="Disbursed" stroke={NAVY} strokeWidth={2} fill="url(#dg)" />
                <Area type="monotone" dataKey="Collected" stroke="#059669" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Arrears ageing */}
        <Panel title="Arrears ageing">
          {ageing.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">No open loans to age.</p>
          ) : (
            <div className="h-56 px-2 pb-2 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ageing} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {ageing.map((b) => <Cell key={b.name} fill={b.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [formatUGX(Number(v)), n]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {ageing.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5">
              {ageing.map((b) => (
                <span key={b.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                  {b.name}
                </span>
              ))}
            </div>
          )}
        </Panel>

        {/* Who holds the portfolio */}
        <Panel
          title={institutionWide ? 'Portfolio by branch' : isBranchManager ? 'Portfolio by loan officer' : 'My groups'}
          className="lg:col-span-2"
        >
          {isLoanOfficer ? (
            <MyGroups groups={clientGroups} clients={clients} loans={m.open} asOn={asOn} />
          ) : breakdown.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">No open loans yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">{institutionWide ? 'Branch' : 'Loan officer'}</th>
                    <th className="px-4 py-2.5 text-right">Loans</th>
                    <th className="px-4 py-2.5 text-right">Outstanding</th>
                    <th className="px-4 py-2.5 text-right">Arrears</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {breakdown.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.loans}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatUGX(r.outstanding)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.arrears > 0 ? 'text-chetu-red' : 'text-slate-400'}`}>
                        {r.arrears > 0 ? formatUGX(r.arrears) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Quick actions — an Auditor gets none, because they cannot act. */}
      {!isAuditor && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Action icon={UserPlus} label="Admit member" to="/member-admission" onGo={navigate} />
          <Action icon={Users} label="Create group" to="/group-create" onGo={navigate} />
          <Action icon={FileSpreadsheet} label="Loan application" to="/loan-applications" onGo={navigate} />
          <Action icon={Clock} label="Collections" to="/group-collection" onGo={navigate} />
        </div>
      )}

      {/* Expenses are ledger data — only the roles that can read them see the note. */}
      {institutionWide && expenses.length === 0 && (
        <p className="flex items-center gap-2 text-[12px] text-slate-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          No operating expenses recorded yet.
        </p>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const TONE: Record<string, string> = {
  positive: 'text-emerald-700',
  negative: 'text-chetu-red',
  warn: 'text-amber-600',
};

const Kpi: React.FC<{ label: string; value: string; foot?: string; tone?: string }> = ({ label, value, foot, tone }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone ? TONE[tone] : 'text-slate-900'}`}>{value}</p>
    {foot && <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[12px] text-slate-500">{foot}</p>}
  </div>
);

const Mini: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-lg font-bold tabular-nums ${tone ? TONE[tone] : 'text-slate-900'}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs ${className}`}>
    <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      {title}
    </h2>
    {children}
  </section>
);

const Action: React.FC<{ icon: React.ElementType; label: string; to: string; onGo: (to: string) => void }> = ({
  icon: Icon, label, to, onGo,
}) => (
  <button
    type="button"
    onClick={() => onGo(to)}
    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-xs transition-colors hover:border-[#0B4394] hover:bg-slate-50"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#0B4394]/10 text-[#0B4394]">
      <Icon className="h-4.5 w-4.5" />
    </span>
    <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800">{label}</span>
  </button>
);

/** An officer's own book, group by group — the unit they actually work in. */
const MyGroups: React.FC<{
  groups: ReturnType<typeof useDatabase>['clientGroups'];
  clients: ReturnType<typeof useDatabase>['clients'];
  loans: Loan[];
  asOn: string;
}> = ({ groups, clients, loans, asOn }) => {
  const rows = groups
    .filter((g) => g.approval_status === 'Approved')
    .map((g) => {
      const memberIds = new Set(clients.filter((c) => c.group_id === g.id).map((c) => c.id));
      const mine = loans.filter((l) => memberIds.has(l.client_id));
      return {
        id: g.id,
        name: g.group_name,
        code: g.group_code,
        members: memberIds.size,
        outstanding: mine.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0),
        arrears: mine.reduce((s, l) => s + arrearsOf(l, asOn), 0),
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-[13px] text-slate-400">No approved groups assigned to you yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Group</th>
            <th className="px-4 py-2.5 text-right">Members</th>
            <th className="px-4 py-2.5 text-right">Outstanding</th>
            <th className="px-4 py-2.5 text-right">Arrears</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <span className="font-semibold text-slate-900">{r.name}</span>
                <span className="block text-[11px] text-slate-400">{r.code}</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.members}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatUGX(r.outstanding)}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.arrears > 0 ? 'text-chetu-red' : 'text-slate-400'}`}>
                {r.arrears > 0 ? formatUGX(r.arrears) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
