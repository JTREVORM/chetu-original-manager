import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BookOpen, ChevronRight, Download } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { generateSavingsStatementPDF } from '../lib/pdfGenerator';
import {
  ActionButton,
  Field,
  MisColumn,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  useMisScope,
} from '../components/mis/MisKit';
import { PaymentMethod, SavingsAccount, SavingsTransaction, SavingsTransactionType } from '../types/database.types';
import { ScrollArea, TableScroll } from '../components/common/ScrollArea';

interface SavingsRow {
  account: SavingsAccount;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  group_code: string;
  group_name: string;
  holder: string;
  member_code: string;
  phone: string;
  branch_id: string;
}

export const useSavingsRows = (scope: ReturnType<typeof useMisScope>): SavingsRow[] => {
  const { savingsAccounts, clients, clientGroups } = useDatabase();
  return useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    return savingsAccounts.map((acc) => {
      const client = acc.client || (acc.client_id ? clientById.get(acc.client_id) : undefined);
      const group = acc.group || (acc.group_id ? groupById.get(acc.group_id) : client?.group_id ? groupById.get(client.group_id) : undefined);
      const officerId = client?.loan_officer_id || group?.loan_officer_id || '';
      return {
        account: acc,
        branch_id: client?.branch_id || group?.branch_id || '',
        branch_name: scope.branchName(client?.branch_id || group?.branch_id || ''),
        officer_name: group?.loan_officer_name || scope.officerName(officerId),
        officer_id: officerId,
        group_id: group?.id || '',
        group_code: group?.group_code || '—',
        group_name: group?.group_name || '—',
        holder: client?.full_name || group?.group_name || '—',
        member_code: client?.client_number || '—',
        phone: client?.phone_number || '—',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savingsAccounts, clients, clientGroups, scope.officers, scope.activeBranches]);
};

export const SavingsAccountsPage: React.FC = () => {
  const scope = useMisScope();
  const { savingsTransactions, addSavingsTransaction } = useDatabase();
  const rows = useSavingsRows(scope);

  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '' });

  const [txFor, setTxFor] = useState<{ row: SavingsRow; type: SavingsTransactionType } | null>(null);
  const [passbookFor, setPassbookFor] = useState<SavingsRow | null>(null);

  const canTransact = !scope.isAuditor;

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay = `${r.account.account_number} ${r.holder} ${r.member_code} ${r.group_name} ${r.group_code} ${r.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search });
  };

  const accountTransactions = (accountId: string) =>
    savingsTransactions
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const columns: MisColumn<SavingsRow>[] = [
    { key: 'branch', label: 'Branch', width: '10%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'lo', label: 'LO', width: '10%', render: (r) => r.officer_name, text: (r) => r.officer_name },
    { key: 'gcode', label: 'Group Code', width: '10%', render: (r) => r.group_code, text: (r) => r.group_code },
    { key: 'gname', label: 'Group Name', width: '10%', render: (r) => r.group_name, text: (r) => r.group_name },
    { key: 'acc', label: 'Account No.', width: '13%', render: (r) => r.account.account_number, text: (r) => r.account.account_number },
    { key: 'mcode', label: 'Member Code', width: '10%', render: (r) => r.member_code, text: (r) => r.member_code },
    {
      key: 'holder',
      label: 'Account Holder',
      width: '13%',
      render: (r) => <span className="font-semibold text-slate-900">{r.holder}</span>,
      text: (r) => r.holder,
    },
    { key: 'type', label: 'Type', width: '7%', render: (r) => r.account.account_type, text: (r) => r.account.account_type },
    {
      key: 'balance',
      label: 'Balance',
      width: '10%',
      render: (r) => <span className="font-bold text-[#0B4394]">{money(r.account.balance)}</span>,
      text: (r) => money(r.account.balance),
    },
    {
      key: 'status',
      label: 'Status',
      width: '8%',
      render: (r) => r.account.status,
      text: (r) => r.account.status,
    },
    {
      key: 'action',
      label: 'Action',
      width: '12%',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          {canTransact && (
            <>
              <button
                type="button"
                title="Record weekly deposit"
                onClick={() => setTxFor({ row: r, type: 'Deposit' })}
                className="inline-flex h-7 items-center gap-1 rounded bg-emerald-600 px-2 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                <ArrowDownLeft className="h-3 w-3" /> Deposit
              </button>
              <button
                type="button"
                title="Record withdrawal"
                onClick={() => setTxFor({ row: r, type: 'Withdrawal' })}
                className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-[11px] font-bold text-white hover:bg-amber-600"
              >
                <ArrowUpRight className="h-3 w-3" /> Withdraw
              </button>
            </>
          )}
          <ActionButton tone="navy" title="View Passbook" onClick={() => setPassbookFor(r)}>
            <BookOpen className="h-3.5 w-3.5" />
          </ActionButton>
        </div>
      ),
    },
  ];

  const totalBalance = filtered.reduce((sum, r) => sum + Number(r.account.balance || 0), 0);

  return (
    <div className="space-y-4 pb-12">
      <MisPageTitle>Savings Accounts</MisPageTitle>

      <p className="text-[11px] text-slate-500">
        Savings are collected weekly — record each member&apos;s weekly deposit or a withdrawal below.
      </p>


      <MisFilters
        title="Savings Accounts"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by Account No. / Member name, code / Group"
        onSubmit={runSearch}
      >
        <ScopeFields scope={scope} />
        <Field label="&nbsp;">
          <SearchButton onClick={runSearch} />
        </Field>
      </MisFilters>

      <MisTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.account.id}
        hasSearched={hasSearched}
        emptyMessage="No savings accounts found!"
        idleMessage="Select branch, officer or group and press Search."
        mobileTitle={(r) => r.holder}
        mobileSubtitle={(r) => `${r.account.account_number} • ${money(r.account.balance)}`}
        footer={
          filtered.length ? (
            <div className="flex items-center justify-between px-3 py-2 text-[12px] font-bold text-slate-700">
              <span>{filtered.length} account(s)</span>
              <span>Total Balance: {money(totalBalance)}</span>
            </div>
          ) : undefined
        }
      />

      {txFor && (
        <TransactionModal
          row={txFor.row}
          type={txFor.type}
          onClose={() => setTxFor(null)}
          onSubmit={async (amount, method, notes) => {
            await addSavingsTransaction(txFor.row.account.id, amount, txFor.type, method, notes);
            setTxFor(null);
          }}
        />
      )}

      {passbookFor && (
        <MisModal open onClose={() => setPassbookFor(null)} title={`Passbook — ${passbookFor.holder}`}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Info label="Account No." value={passbookFor.account.account_number} />
            <Info label="Member Code" value={passbookFor.member_code} />
            <Info label="Group" value={passbookFor.group_name} />
            <Info label="Balance" value={money(passbookFor.account.balance)} />
          </div>
          <ScrollArea axis="x" className="rounded border border-slate-200" ariaLabel="Passbook transactions">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ref</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accountTransactions(passbookFor.account.id).map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{shortDate(t.created_at)}</td>
                    <td className="px-2 py-1.5">{t.receipt_number}</td>
                    <td className="px-2 py-1.5">{t.transaction_type}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{money(t.amount)}</td>
                    <td className="px-2 py-1.5 text-right">{money(t.balance_after)}</td>
                  </tr>
                ))}
                {accountTransactions(passbookFor.account.id).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() =>
                generateSavingsStatementPDF(
                  passbookFor.account.account_number,
                  passbookFor.holder,
                  Number(passbookFor.account.balance || 0),
                  accountTransactions(passbookFor.account.id),
                )
              }
              className="inline-flex h-9 items-center gap-2 rounded bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672]"
            >
              <Download className="h-3.5 w-3.5" />
              Download Statement
            </button>
          </div>
        </MisModal>
      )}
    </div>
  );
};

/** Savings monitoring: totals per branch (admin can pick) and per group. */
export const SavingsDashboardPage: React.FC = () => {
  const scope = useMisScope();
  const rows = useSavingsRows(scope);
  return (
    <div className="space-y-4 pb-12">
      <MisPageTitle>Savings Dashboard</MisPageTitle>
      <SavingsDashboard rows={rows} scope={scope} />
    </div>
  );
};

/** Which KPI tile the drill-down is showing, or null when it is closed. */
type Drill = 'balance' | 'savers' | 'deposits' | 'withdrawals';

const SavingsDashboard: React.FC<{ rows: SavingsRow[]; scope: ReturnType<typeof useMisScope> }> = ({ rows, scope }) => {
  const { savingsTransactions } = useDatabase();
  const [branchId, setBranchId] = useState(scope.branchLocked ? scope.activeBranches[0]?.id || '' : '');
  const [drill, setDrill] = useState<Drill | null>(null);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
        if (scope.branchLocked) {
          const mine = scope.activeBranches.map((b) => b.id);
          if (r.branch_id && mine.length && !mine.includes(r.branch_id)) return false;
        }
        if (branchId && r.branch_id !== branchId) return false;
        return true;
      }),
    [rows, branchId, scope.branchLocked, scope.isLoanOfficer, scope.user?.id, scope.activeBranches],
  );

  const accountIds = useMemo(() => new Set(visible.map((r) => r.account.id)), [visible]);

  // Savings run on a weekly cycle (week starts Monday)
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  /** This week's transactions inside the visible scope, kept so the KPI tiles
   *  can hand the underlying rows to the drill-down rather than only a total. */
  const weekTx = useMemo(
    () =>
      savingsTransactions
        .filter((t) => accountIds.has(t.account_id) && new Date(t.created_at) >= weekStart)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savingsTransactions, accountIds],
  );

  const flows = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    const savers = new Set<string>();
    for (const t of weekTx) {
      if (t.transaction_type === 'Withdrawal') withdrawals += Number(t.amount || 0);
      else {
        deposits += Number(t.amount || 0);
        savers.add(t.account_id);
      }
    }
    return { deposits, withdrawals, savers: savers.size, saverIds: savers };
  }, [weekTx]);

  const total = visible.reduce((s, r) => s + Number(r.account.balance || 0), 0);
  const activeCount = visible.filter((r) => r.account.status === 'Active').length;

  const perBranch = useMemo(() => {
    const map = new Map<string, { name: string; total: number; accounts: number }>();
    for (const r of visible) {
      const key = r.branch_id || 'none';
      const entry = map.get(key) || { name: r.branch_name || '—', total: 0, accounts: 0 };
      entry.total += Number(r.account.balance || 0);
      entry.accounts += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [visible]);

  const perGroup = useMemo(() => {
    const map = new Map<string, { name: string; code: string; branch: string; total: number; members: number }>();
    for (const r of visible) {
      const key = r.group_id || 'none';
      const entry =
        map.get(key) || { name: r.group_name || 'Unassigned', code: r.group_code || '—', branch: r.branch_name || '—', total: 0, members: 0 };
      entry.total += Number(r.account.balance || 0);
      entry.members += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [visible]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Savings Monitoring</h2>
          <p className="text-[11px] text-slate-500">
            {branchId ? scope.branchName(branchId) : scope.branchLocked ? 'Your branch(es)' : 'All branches'}
          </p>
        </div>
        {!scope.branchLocked && (
          <div className="w-full sm:w-64">
            <Field label="Monitor Branch">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="form-field">
                <option value="">All Branches</option>
                {scope.activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total Savings Balance" value={money(total)} tone="navy" onClick={() => setDrill('balance')} />
        <Kpi
          label="Saved This Week"
          value={`${flows.savers} / ${activeCount} members`}
          onClick={() => setDrill('savers')}
        />
        <Kpi
          label="Deposits (This Week)"
          value={money(flows.deposits)}
          tone="green"
          onClick={() => setDrill('deposits')}
        />
        <Kpi
          label="Withdrawals (This Week)"
          value={money(flows.withdrawals)}
          tone="amber"
          onClick={() => setDrill('withdrawals')}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BreakdownTable
          title="Savings by Branch"
          head={['Branch', 'Accounts', 'Balance']}
          rows={perBranch.map(([k, v]) => [k, v.name, String(v.accounts), money(v.total)])}
        />
        <BreakdownTable
          title="Savings by Group"
          head={['Group', 'Members', 'Balance']}
          rows={perGroup.map(([k, v]) => [k, `${v.name} (${v.code})`, String(v.members), money(v.total)])}
        />
      </div>

      <KpiDrillDown
        drill={drill}
        onClose={() => setDrill(null)}
        accounts={visible}
        weekTx={weekTx}
        weekStart={weekStart}
      />
    </div>
  );
};

/**
 * The records behind a KPI tile: which members saved this week, the individual
 * deposits and withdrawals, or every account making up the total balance.
 */
const KpiDrillDown: React.FC<{
  drill: Drill | null;
  onClose: () => void;
  accounts: SavingsRow[];
  weekTx: SavingsTransaction[];
  weekStart: Date;
}> = ({ drill, onClose, accounts, weekTx, weekStart }) => {
  const accById = useMemo(() => new Map(accounts.map((a) => [a.account.id, a])), [accounts]);
  const periodLabel = `week of ${shortDate(weekStart.toISOString())}`;

  const view = useMemo(() => {
    if (!drill) return null;

    if (drill === 'balance') {
      const rows = [...accounts]
        .sort((a, b) => Number(b.account.balance || 0) - Number(a.account.balance || 0))
        .map((a) => [
          a.account.account_number,
          a.holder,
          a.member_code,
          a.group_name,
          a.branch_name,
          a.officer_name,
          a.account.status,
          money(a.account.balance),
        ]);
      const total = accounts.reduce((s, a) => s + Number(a.account.balance || 0), 0);
      return {
        title: 'Total Savings Balance — all accounts',
        head: ['Account No.', 'Account Holder', 'Member Code', 'Group', 'Branch', 'LO', 'Status', 'Balance'],
        rows,
        summary: `${accounts.length} account${accounts.length === 1 ? '' : 's'} • ${money(total)} held`,
        empty: 'No savings accounts in this scope.',
      };
    }

    if (drill === 'savers') {
      // One line per member who made at least one deposit this week, with what
      // they actually put in — the question a field officer is really asking.
      const perAccount = new Map<string, { saved: number; count: number; last: string }>();
      for (const t of weekTx) {
        if (t.transaction_type === 'Withdrawal') continue;
        const e = perAccount.get(t.account_id) || { saved: 0, count: 0, last: t.created_at };
        e.saved += Number(t.amount || 0);
        e.count += 1;
        if (t.created_at > e.last) e.last = t.created_at;
        perAccount.set(t.account_id, e);
      }
      const rows = [...perAccount.entries()]
        .sort((a, b) => b[1].saved - a[1].saved)
        .map(([id, e]) => {
          const a = accById.get(id);
          return [
            a?.account.account_number || '—',
            a?.holder || '—',
            a?.member_code || '—',
            a?.group_name || '—',
            a?.branch_name || '—',
            a?.officer_name || '—',
            String(e.count),
            shortDate(e.last),
            money(e.saved),
            money(a?.account.balance),
          ];
        });
      const total = [...perAccount.values()].reduce((s, e) => s + e.saved, 0);
      return {
        title: `Members who saved this week (${periodLabel})`,
        head: [
          'Account No.', 'Account Holder', 'Member Code', 'Group', 'Branch', 'LO',
          'Deposits', 'Last Deposit', 'Saved This Week', 'Current Balance',
        ],
        rows,
        summary: `${rows.length} member${rows.length === 1 ? '' : 's'} saved • ${money(total)} deposited`,
        empty: 'Nobody has saved yet this week.',
      };
    }

    const wantWithdrawal = drill === 'withdrawals';
    const tx = weekTx.filter((t) => (t.transaction_type === 'Withdrawal') === wantWithdrawal);
    const rows = tx.map((t) => {
      const a = accById.get(t.account_id);
      return [
        shortDate(t.created_at),
        t.transaction_number,
        t.receipt_number || '—',
        a?.account.account_number || '—',
        a?.holder || '—',
        a?.member_code || '—',
        a?.group_name || '—',
        a?.branch_name || '—',
        a?.officer_name || '—',
        t.payment_method,
        money(t.amount),
        money(t.balance_after),
      ];
    });
    const total = tx.reduce((s, t) => s + Number(t.amount || 0), 0);
    return {
      title: `${wantWithdrawal ? 'Withdrawals' : 'Deposits'} this week (${periodLabel})`,
      head: [
        'Date', 'Txn No.', 'Receipt No.', 'Account No.', 'Account Holder', 'Member Code',
        'Group', 'Branch', 'LO', 'Method', 'Amount', 'Balance After',
      ],
      rows,
      summary: `${tx.length} transaction${tx.length === 1 ? '' : 's'} • ${money(total)} total`,
      empty: `No ${wantWithdrawal ? 'withdrawals' : 'deposits'} recorded this week.`,
    };
  }, [drill, accounts, weekTx, accById, periodLabel]);

  if (!drill || !view) return null;

  return (
    <MisModal open onClose={onClose} title={view.title} width="max-w-6xl">
      <p className="mb-3 text-[12px] font-bold text-slate-600">{view.summary}</p>
      <ScrollArea axis="x" className="rounded border border-slate-200" ariaLabel={view.title}>
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2">
              {view.head.map((h, i) => (
                <th key={h} className={i >= view.head.length - 2 ? 'text-right' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.rows.length === 0 ? (
              <tr>
                <td colSpan={view.head.length} className="px-2 py-8 text-center text-slate-400">
                  {view.empty}
                </td>
              </tr>
            ) : (
              view.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-2">
                  {r.map((cell, j) => (
                    <td
                      key={j}
                      className={
                        j >= r.length - 2 ? 'text-right font-bold text-slate-900' : 'text-slate-700'
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
    </MisModal>
  );
};

/**
 * A dashboard figure. When `onClick` is supplied the whole tile becomes a
 * button that opens the records behind the number — a total nobody can open is
 * a dead end when a branch is trying to reconcile it.
 */
const Kpi: React.FC<{
  label: string;
  value: string;
  tone?: 'navy' | 'green' | 'amber';
  onClick?: () => void;
}> = ({ label, value, tone, onClick }) => {
  const tones: Record<string, string> = {
    navy: 'text-[#0B4394]',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
  };
  const body = (
    <>
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
        {onClick && <ChevronRight className="h-3 w-3 text-slate-400" />}
      </p>
      <p className={`mt-1 text-sm font-black ${tone ? tones[tone] : 'text-slate-900'}`}>{value}</p>
    </>
  );

  if (!onClick) {
    return <div className="rounded border border-slate-200 bg-slate-50 p-3">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`View the records behind "${label}"`}
      className="rounded border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-[#0B4394] hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4394]/40"
    >
      {body}
    </button>
  );
};

const BreakdownTable: React.FC<{ title: string; head: string[]; rows: string[][] }> = ({ title, head, rows }) => (
  <div className="rounded border border-slate-200">
    <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[12px] font-bold text-slate-700">{title}</div>
    <TableScroll maxHeight="14rem" arrows={false} ariaLabel={title}>
      {/* No min-width: two short columns already fit the narrowest phone, and
          a floor here would force a scrollbar that is not needed. */}
      <table className="w-full text-[12px]">
        <thead className="text-left text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-1.5 ${i === 0 ? '' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, ...cells]) => (
            <tr key={key} className="border-t border-slate-100">
              {cells.map((c, i) => (
                <td key={i} className={`px-3 py-1.5 ${i === 0 ? 'font-semibold text-slate-800' : 'text-right'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-slate-400">
                No savings recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableScroll>
  </div>
);


const Info: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded border border-slate-200 bg-slate-50 p-2">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-[12px] font-semibold text-slate-900">{value}</p>
  </div>
);

const TransactionModal: React.FC<{
  row: SavingsRow;
  type: SavingsTransactionType;
  onClose: () => void;
  onSubmit: (amount: number, method: PaymentMethod, notes: string) => Promise<void>;
}> = ({ row, type, onClose, onSubmit }) => {
  const [amount, setAmount] = useState<number>(50000);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (amount <= 0 || saving) return;
    setSaving(true);
    try {
      await onSubmit(Number(amount), method, notes);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MisModal open onClose={onClose} title={`${type} — ${row.holder}`} width="max-w-xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Info label="Account No." value={row.account.account_number} />
        <Info label="Current Balance" value={money(row.account.balance)} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Amount (UGX)">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="form-field"
          />
        </Field>
        <Field label="Payment Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="form-field">
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Mobile Money">Mobile Money</option>
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="form-field" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded border border-slate-300 px-4 text-[12px] font-bold text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="h-9 rounded bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672] disabled:opacity-60"
        >
          {saving ? 'Saving…' : `Confirm ${type}`}
        </button>
      </div>
    </MisModal>
  );
};
