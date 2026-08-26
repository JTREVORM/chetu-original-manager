import React, { useMemo, useState } from 'react';
import { CalendarDays, Receipt } from 'lucide-react';
import {
  ActionButton,
  MisFilters,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  useMisScope,
  type MisColumn,
} from '../../components/mis/MisKit';
import { ReportExportButtons } from '../../components/mis/ReportExport';
import { exportToCSV } from '../../lib/excelExporter';
import { useDatabase } from '../../context/DatabaseContext';
import { matchScope, useLoanRows, type LoanRow } from './reportData';

interface Row extends LoanRow {
  migrationCollection: number;
  runningCollection: number;
  totalCollection: number;
}

/** Outstanding Report — running balances per loan with collection breakdown. */
export const OutstandingReport: React.FC = () => {
  const scope = useMisScope();
  const { repayments } = useDatabase();
  const { rows, loading } = useLoanRows(scope);

  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '' });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search });
  };

  const filtered = useMemo<Row[]>(() => {
    const byLoan = new Map<string, { migration: number; running: number }>();
    for (const p of repayments) {
      const bucket = byLoan.get(p.loan_id) || { migration: 0, running: 0 };
      if ((p.collection_type || '').toLowerCase() === 'migration') bucket.migration += Number(p.amount_paid);
      else bucket.running += Number(p.amount_paid);
      byLoan.set(p.loan_id, bucket);
    }
    return rows
      .filter((r) => matchScope(r, applied, scope))
      .filter((r) => Number(r.loan.outstanding_balance) > 0)
      .map((r) => {
        const b = byLoan.get(r.loan.id) || { migration: 0, running: 0 };
        return {
          ...r,
          migrationCollection: b.migration,
          runningCollection: b.running,
          totalCollection: b.migration + b.running,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, repayments, applied, scope.isLoanOfficer, scope.user?.id]);

  const totalOutstanding = filtered.reduce((s, r) => s + Number(r.loan.outstanding_balance), 0);
  const totalCollected = filtered.reduce((s, r) => s + r.totalCollection, 0);

  const collectionReport = (r: Row) =>
    exportToCSV(
      `Collection_${r.loan.loan_number}`,
      ['Receipt', 'Date', 'Amount', 'Method', 'Type'],
      repayments
        .filter((p) => p.loan_id === r.loan.id)
        .map((p) => [p.receipt_number, p.payment_date, p.amount_paid, p.payment_method, p.collection_type || 'Regular']),
    );

  const scheduleReport = (r: Row) =>
    exportToCSV(
      `Schedule_${r.loan.loan_number}`,
      ['Week', 'Due Date', 'Instalment', 'Principal', 'Interest', 'Paid', 'Balance', 'Status'],
      r.schedule.map((s) => [
        s.week_number,
        s.due_date,
        s.installment_amount,
        s.principal_portion,
        s.interest_portion,
        s.paid_amount,
        s.remaining_balance,
        s.status,
      ]),
    );

  const columns: MisColumn<Row>[] = [
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => r.branch_name },
    {
      key: 'member',
      label: 'Member',
      width: '13%',
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.client.full_name}
          <span className="block text-[10px] font-normal text-slate-400">{r.group_name}</span>
        </span>
      ),
      text: (r) => r.client.full_name,
    },
    { key: 'loan', label: 'Loan no', width: '11%', render: (r) => r.loan.loan_number },
    { key: 'amount', label: 'Loan Amount', width: '9%', align: 'right', render: (r) => money(r.loan.principal_amount) },
    { key: 'interest', label: 'Interest Amount', width: '9%', align: 'right', render: (r) => money(r.loan.total_interest_amount) },
    { key: 'disb', label: 'Total Disburse', width: '9%', align: 'right', render: (r) => money(r.loan.total_amount_payable) },
    { key: 'mig', label: 'Migration Collection', width: '9%', align: 'right', render: (r) => money(r.migrationCollection) },
    { key: 'run', label: 'Running Collection', width: '9%', align: 'right', render: (r) => money(r.runningCollection) },
    { key: 'tot', label: 'Total Collection', width: '9%', align: 'right', render: (r) => money(r.totalCollection) },
    {
      key: 'out',
      label: 'Total Outstanding',
      width: '9%',
      align: 'right',
      render: (r) => <span className="font-bold text-[#0B4394]">{money(r.loan.outstanding_balance)}</span>,
      text: (r) => money(r.loan.outstanding_balance),
    },
    {
      key: 'action',
      label: 'Action',
      width: '8%',
      render: (r) => (
        <div className="flex items-center gap-1">
          <ActionButton tone="green" title="Collection report" onClick={() => collectionReport(r)}>
            <Receipt className="h-3 w-3" />
          </ActionButton>
          <ActionButton tone="blue" title="Schedule report" onClick={() => scheduleReport(r)}>
            <CalendarDays className="h-3 w-3" />
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title="Outstanding Report" columns={columns} rows={filtered} />}>
        Outstanding Report
      </MisPageTitle>

      <MisFilters
        title="Outstanding Report"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Group"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No outstanding loans for this selection."
        idleMessage="Select the scope, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • Outstanding ${money(r.loan.outstanding_balance)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-xs font-bold text-slate-700">
              <span>Total Collection: {money(totalCollected)}</span>
              <span>
                Total Outstanding: <span className="text-[#0B4394]">{money(totalOutstanding)}</span>
              </span>
            </div>
          )
        }
      />
    </div>
  );
};
