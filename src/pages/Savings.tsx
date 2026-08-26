import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BookOpen, Download } from 'lucide-react';
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
import { PaymentMethod, SavingsAccount, SavingsTransactionType } from '../types/database.types';

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
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-[12px]">
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
          </div>
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

const SavingsDashboard: React.FC<{ rows: SavingsRow[]; scope: ReturnType<typeof useMisScope> }> = ({ rows, scope }) => {
  const { savingsTransactions } = useDatabase();
  const [branchId, setBranchId] = useState(scope.branchLocked ? scope.activeBranches[0]?.id || '' : '');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, branchId, scope.branchLocked, scope.isLoanOfficer, scope.user?.id, scope.activeBranches],
  );

  const accountIds = useMemo(() => new Set(visible.map((r) => r.account.id)), [visible]);

  // Savings run on a weekly cycle (week starts Monday)
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  const flows = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    let savers = new Set<string>();
    for (const t of savingsTransactions) {
      if (!accountIds.has(t.account_id)) continue;
      if (new Date(t.created_at) < weekStart) continue;
      if (t.transaction_type === 'Withdrawal') withdrawals += Number(t.amount || 0);
      else {
        deposits += Number(t.amount || 0);
        savers.add(t.account_id);
      }
    }
    return { deposits, withdrawals, savers: savers.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savingsTransactions, accountIds]);

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
        <Kpi label="Total Savings Balance" value={money(total)} tone="navy" />
        <Kpi label="Saved This Week" value={`${flows.savers} / ${activeCount} members`} />
        <Kpi label="Deposits (This Week)" value={money(flows.deposits)} tone="green" />
        <Kpi label="Withdrawals (This Week)" value={money(flows.withdrawals)} tone="amber" />
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
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone?: 'navy' | 'green' | 'amber' }> = ({ label, value, tone }) => {
  const tones: Record<string, string> = {
    navy: 'text-[#0B4394]',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-black ${tone ? tones[tone] : 'text-slate-900'}`}>{value}</p>
    </div>
  );
};

const BreakdownTable: React.FC<{ title: string; head: string[]; rows: string[][] }> = ({ title, head, rows }) => (
  <div className="rounded border border-slate-200">
    <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[12px] font-bold text-slate-700">{title}</div>
    <div className="max-h-56 overflow-y-auto">
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
    </div>
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
