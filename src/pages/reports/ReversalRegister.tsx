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
import { matchScope, useLoanReversals, useLoanRows, useStaffNames, type LoanRow } from './reportData';

const TYPE_TONE: Record<string, string> = {
  Disbursement: 'text-amber-700',
  Repayment: 'text-chetu-red',
  Settlement: 'text-chetu-red',
  'Write Off': 'text-slate-700',
};

interface Row {
  id: string;
  loanRow: LoanRow;
  type: string;
  reference: string;
  amount: number;
  reason: string;
  by: string;
  on: string;
}

/**
 * Reversal Register — every disbursement or receipt an Administrator has rolled
 * back. Because a rollback deletes the receipt it undoes, this register is the
 * only surviving record that the money ever moved, which makes it the first
 * thing an Auditor should read.
 */
export const ReversalRegister: React.FC = () => {
  const scope = useMisScope();
  const { rows: loanRows, loading: loansLoading } = useLoanRows(scope);
  const { reversals, loading: reversalsLoading } = useLoanReversals();
  const staffName = useStaffNames();

  const [from, setFrom] = useState(monthStartISO());
  const [till, setTill] = useState(todayISO());
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: '', officerId: '', groupId: '', search: '', from: '', till: '', type: '',
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId,
      search, from, till, type,
    });
  };

  const filtered = useMemo<Row[]>(() => {
    const loanById = new Map(loanRows.map((r) => [r.loan.id, r]));

    return reversals
      .map<Row | null>((rev) => {
        const loanRow = loanById.get(rev.loan_id);
        // A reversal on a loan outside this user's scope is not theirs to see.
        if (!loanRow) return null;
        return {
          id: rev.id,
          loanRow,
          type: rev.reversal_type,
          reference: rev.reference_number || '—',
          amount: Number(rev.amount || 0),
          reason: rev.reason,
          by: staffName(rev.reversed_by),
          on: rev.created_at.split('T')[0]!,
        };
      })
      .filter((r): r is Row => r !== null)
      .filter((r) => {
        if (applied.type && r.type !== applied.type) return false;
        if (applied.from && r.on < applied.from) return false;
        if (applied.till && r.on > applied.till) return false;
        // Branch / officer / group scoping only — the text search is applied
        // below so it can also reach the receipt number and the reason.
        if (!matchScope(r.loanRow, { ...applied, search: '' }, scope)) return false;
        const q = applied.search.trim().toLowerCase();
        if (q) {
          const hay = `${r.loanRow.group_name} ${r.loanRow.client.full_name} ${r.loanRow.client.client_number} ${r.loanRow.loan.loan_number} ${r.reference} ${r.reason}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reversals, loanRows, applied, scope.isLoanOfficer, scope.user?.id]);

  const totals = useMemo(() => {
    const t = { count: filtered.length, amount: 0, disbursements: 0, receipts: 0 };
    for (const r of filtered) {
      t.amount += r.amount;
      if (r.type === 'Disbursement') t.disbursements += 1;
      else t.receipts += 1;
    }
    return t;
  }, [filtered]);

  const columns: MisColumn<Row>[] = [
    { key: 'on', label: 'Reversed On', width: '9%', render: (r) => shortDate(r.on) },
    {
      key: 'type',
      label: 'Transaction',
      width: '10%',
      render: (r) => <span className={`font-bold ${TYPE_TONE[r.type] || 'text-slate-700'}`}>{r.type}</span>,
      text: (r) => r.type,
    },
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => r.loanRow.branch_name, text: (r) => r.loanRow.branch_name },
    { key: 'group', label: 'Group', width: '10%', render: (r) => r.loanRow.group_name, text: (r) => r.loanRow.group_name },
    {
      key: 'member',
      label: 'Member',
      width: '13%',
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.loanRow.client.full_name}
          <span className="block text-[10px] font-normal text-slate-400">{r.loanRow.client.client_number}</span>
        </span>
      ),
      text: (r) => r.loanRow.client.full_name,
    },
    { key: 'loan', label: 'Loan No', width: '10%', render: (r) => r.loanRow.loan.loan_number, text: (r) => r.loanRow.loan.loan_number },
    { key: 'ref', label: 'Reference', width: '10%', render: (r) => r.reference, text: (r) => r.reference },
    {
      key: 'amt',
      label: 'Amount',
      width: '9%',
      align: 'right',
      render: (r) => <span className="font-bold text-chetu-red">{money(r.amount)}</span>,
      text: (r) => money(r.amount),
    },
    { key: 'by', label: 'Reversed By', width: '10%', render: (r) => r.by, text: (r) => r.by },
    { key: 'why', label: 'Reason', width: '13%', render: (r) => r.reason, text: (r) => r.reason },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title="Reversal Register" period={`${shortDate(applied.from || from)} to ${shortDate(applied.till || till)}`} columns={columns} rows={filtered} />}>
        Reversal Register
      </MisPageTitle>

      <MisFilters
        title="Reversal Register"
        cols={6}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Receipt no / Reason"
      >
        <ScopeFields scope={scope} />
        <Field label="From Date">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-field" />
        </Field>
        <Field label="Till Date">
          <input type="date" value={till} onChange={(e) => setTill(e.target.value)} className="form-field" />
        </Field>
        <Field label="Transaction">
          <select value={type} onChange={(e) => setType(e.target.value)} className="form-field">
            <option value="">All</option>
            <option value="Disbursement">Disbursement</option>
            <option value="Repayment">Repayment</option>
            <option value="Settlement">Settlement</option>
            <option value="Write Off">Write Off</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.id}
        loading={hasSearched && (loansLoading || reversalsLoading)}
        hasSearched={hasSearched}
        emptyMessage="No transactions were reversed in this period."
        idleMessage="Choose the period and scope, then press Search."
        mobileTitle={(r) => r.loanRow.client.full_name}
        mobileSubtitle={(r) => `${r.type} • ${r.reference} • ${money(r.amount)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-xs font-bold text-slate-700">
              <span>Reversals: {totals.count}</span>
              <span>Disbursements: {totals.disbursements}</span>
              <span>Receipts: {totals.receipts}</span>
              <span className="text-chetu-red">Value reversed: {money(totals.amount)}</span>
            </div>
          )
        }
      />
    </div>
  );
};
