import React, { useMemo, useState } from 'react';
import {
  Field,
  MisFilters,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  todayISO,
  monthStartISO,
  useMisScope,
  type MisColumn,
} from '../../components/mis/MisKit';
import { ReportExportButtons } from '../../components/mis/ReportExport';
import { useDatabase } from '../../context/DatabaseContext';
import { useSavingsRows } from '../Savings';

export interface SavingsTxRow {
  id: string;
  date: string;
  transaction_number: string;
  receipt_number: string;
  branch_id: string;
  branch_name: string;
  officer_id: string;
  officer_name: string;
  group_id: string;
  group_code: string;
  group_name: string;
  holder: string;
  member_code: string;
  account_id: string;
  account_number: string;
  account_type: string;
  kind: string;
  amount: number;
  balance_after: number;
  method: string;
  notes: string;
}

/**
 * Savings Report — every deposit and withdrawal in a period, joined to the
 * account holder, their group, branch and loan officer.
 *
 * Deposits and withdrawals are kept in one table rather than split, because
 * the figure a branch is asked to reconcile is the *net* movement against the
 * closing balance, and that only reads correctly when both sides are visible
 * on the same rows.
 */
export const SavingsReport: React.FC = () => {
  const scope = useMisScope();
  const { savingsTransactions } = useDatabase();
  const accounts = useSavingsRows(scope);

  const [from, setFrom] = useState(monthStartISO());
  const [till, setTill] = useState(todayISO());
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: '', officerId: '', groupId: '', search: '', from: '', till: '', kind: '',
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId,
      search, from, till, kind,
    });
  };

  const rows = useMemo<SavingsTxRow[]>(() => {
    const accById = new Map(accounts.map((a) => [a.account.id, a]));
    const out: SavingsTxRow[] = [];
    for (const t of savingsTransactions) {
      const a = accById.get(t.account_id);
      // A transaction whose account is outside this user's scope is not theirs
      // to see; `useSavingsRows` has already applied that scoping.
      if (!a) continue;
      out.push({
        id: t.id,
        date: (t.created_at || '').split('T')[0]!,
        transaction_number: t.transaction_number,
        receipt_number: t.receipt_number || '—',
        branch_id: a.branch_id,
        branch_name: a.branch_name,
        officer_id: a.officer_id,
        officer_name: a.officer_name,
        group_id: a.group_id,
        group_code: a.group_code,
        group_name: a.group_name,
        holder: a.holder,
        member_code: a.member_code,
        account_id: a.account.id,
        account_number: a.account.account_number,
        account_type: a.account.account_type,
        kind: t.transaction_type,
        amount: Number(t.amount || 0),
        balance_after: Number(t.balance_after || 0),
        method: t.payment_method,
        notes: t.notes || '',
      });
    }
    return out.sort((x, y) => (x.date < y.date ? 1 : -1));
  }, [savingsTransactions, accounts]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (applied.kind && r.kind !== applied.kind) return false;
      if (applied.from && r.date < applied.from) return false;
      if (applied.till && r.date > applied.till) return false;
      if (q) {
        const hay = `${r.holder} ${r.member_code} ${r.group_name} ${r.group_code} ${r.account_number} ${r.transaction_number} ${r.receipt_number}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const totals = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    const savers = new Set<string>();
    for (const r of filtered) {
      if (r.kind === 'Withdrawal') withdrawals += r.amount;
      else {
        deposits += r.amount;
        savers.add(r.account_id);
      }
    }
    return { deposits, withdrawals, net: deposits - withdrawals, savers: savers.size, count: filtered.length };
  }, [filtered]);

  const columns: MisColumn<SavingsTxRow>[] = [
    { key: 'date', label: 'Date', width: '7%', render: (r) => shortDate(r.date), text: (r) => shortDate(r.date) },
    { key: 'txn', label: 'Txn No.', width: '10%', render: (r) => r.transaction_number, text: (r) => r.transaction_number },
    { key: 'receipt', label: 'Receipt No.', width: '10%', render: (r) => r.receipt_number, text: (r) => r.receipt_number },
    { key: 'branch', label: 'Branch', width: '8%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'lo', label: 'LO', width: '9%', render: (r) => r.officer_name, text: (r) => r.officer_name },
    {
      key: 'group',
      label: 'Group',
      width: '10%',
      render: (r) => r.group_name,
      text: (r) => `${r.group_name} (${r.group_code})`,
    },
    {
      key: 'holder',
      label: 'Account Holder',
      width: '12%',
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.holder}
          <span className="block text-[10px] font-normal text-slate-400">{r.member_code}</span>
        </span>
      ),
      text: (r) => r.holder,
    },
    { key: 'acc', label: 'Account No.', width: '11%', render: (r) => r.account_number, text: (r) => r.account_number },
    { key: 'atype', label: 'Acct Type', width: '7%', render: (r) => r.account_type, text: (r) => r.account_type },
    {
      key: 'kind',
      label: 'Type',
      width: '8%',
      render: (r) => (
        <span className={`font-bold ${r.kind === 'Withdrawal' ? 'text-chetu-red' : 'text-emerald-700'}`}>{r.kind}</span>
      ),
      text: (r) => r.kind,
    },
    {
      key: 'amount',
      label: 'Amount',
      width: '9%',
      align: 'right',
      render: (r) => (
        <span className={`font-bold ${r.kind === 'Withdrawal' ? 'text-chetu-red' : 'text-emerald-700'}`}>
          {r.kind === 'Withdrawal' ? '-' : '+'}
          {money(r.amount)}
        </span>
      ),
      text: (r) => `${r.kind === 'Withdrawal' ? '-' : '+'}${money(r.amount)}`,
    },
    {
      key: 'balance',
      label: 'Balance After',
      width: '9%',
      align: 'right',
      render: (r) => <span className="font-bold text-[#0B4394]">{money(r.balance_after)}</span>,
      text: (r) => money(r.balance_after),
    },
    { key: 'method', label: 'Method', width: '8%', render: (r) => r.method, text: (r) => r.method },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Savings Report"
            period={`${shortDate(applied.from || from)} to ${shortDate(applied.till || till)}`}
            columns={columns}
            rows={filtered}
            totals={[
              ['Deposits', money(totals.deposits)],
              ['Withdrawals', money(totals.withdrawals)],
              ['Net movement', money(totals.net)],
              ['Transactions', String(totals.count)],
              ['Members who saved', String(totals.savers)],
            ]}
          />
        }
      >
        Savings Report
      </MisPageTitle>

      <MisFilters
        title="Savings Report"
        cols={6}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name, code / Group / Account, txn or receipt number"
      >
        <ScopeFields scope={scope} />
        <Field label="From Date">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-field" />
        </Field>
        <Field label="Till Date">
          <input type="date" value={till} onChange={(e) => setTill(e.target.value)} className="form-field" />
        </Field>
        <Field label="Transaction Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="form-field">
            <option value="">All</option>
            <option value="Deposit">Deposits</option>
            <option value="Withdrawal">Withdrawals</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.id}
        hasSearched={hasSearched}
        emptyMessage="No savings transactions in this period."
        idleMessage="Choose the period and scope, then press Search."
        mobileTitle={(r) => r.holder}
        mobileSubtitle={(r) => `${r.kind} • ${r.account_number} • ${money(r.amount)}`}
        footer={
          filtered.length > 0 && (
            <div className="space-y-1.5 px-4 py-3 text-xs font-bold text-slate-700">
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1">
                <span className="font-normal text-slate-500">Transactions: {totals.count}</span>
                <span className="font-normal text-slate-500">Members who saved: {totals.savers}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-200 pt-1.5">
                <span className="text-emerald-700">Deposits: {money(totals.deposits)}</span>
                <span className="text-chetu-red">Withdrawals: {money(totals.withdrawals)}</span>
                <span className="text-[#0B4394]">Net movement: {money(totals.net)}</span>
              </div>
            </div>
          )
        }
      />
    </div>
  );
};
