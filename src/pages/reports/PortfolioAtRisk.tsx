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
  useMisScope,
  type MisColumn,
} from '../../components/mis/MisKit';
import { ReportExportButtons } from '../../components/mis/ReportExport';
import { CLOSED_LOAN_STATUSES } from '../../types/database.types';
import {
  PAR_BUCKETS,
  bucketFor,
  daysPastDue,
  matchScope,
  overdueAsOf,
  useLoanRows,
  type LoanRow,
} from './reportData';

const BUCKET_TONE: Record<string, string> = {
  current: 'text-emerald-700',
  par1: 'text-amber-600',
  par31: 'text-orange-600',
  par61: 'text-chetu-red',
  par90: 'text-chetu-red',
};

interface Row extends LoanRow {
  days: number;
  bucket: string;
  bucket_label: string;
  overdue: number;
  outstanding: number;
}

/**
 * Portfolio at Risk — the standard microfinance arrears view. PAR counts the
 * *whole* outstanding balance of a loan that is even one instalment behind, not
 * just the missed instalment, because the entire balance is what is at risk
 * once a member stops paying.
 */
export const PortfolioAtRisk: React.FC = () => {
  const scope = useMisScope();
  const { rows, loading } = useLoanRows(scope);

  const [asOn, setAsOn] = useState(todayISO());
  const [bucket, setBucket] = useState('');
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: '', officerId: '', groupId: '', search: '', asOn: todayISO(), bucket: '',
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId,
      search, asOn, bucket,
    });
  };

  const scoped = useMemo<Row[]>(
    () =>
      rows
        .filter((r) => matchScope(r, applied, scope))
        // A closed loan carries no risk; a pending one was never disbursed.
        .filter((r) => !CLOSED_LOAN_STATUSES.includes(r.loan.status) && r.loan.status !== 'Pending')
        .filter((r) => Number(r.loan.outstanding_balance) > 0)
        .map((r) => {
          const days = daysPastDue(r.schedule, applied.asOn);
          const b = bucketFor(days);
          return {
            ...r,
            days,
            bucket: b.key,
            bucket_label: b.label,
            overdue: overdueAsOf(r.schedule, applied.asOn),
            outstanding: Number(r.loan.outstanding_balance),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, applied, scope.isLoanOfficer, scope.user?.id],
  );

  // The summary always covers the whole scoped portfolio, so the PAR ratios
  // stay meaningful even when the table below is narrowed to one bucket.
  const summary = useMemo(() => {
    const totalPortfolio = scoped.reduce((s, r) => s + r.outstanding, 0);
    const byBucket = PAR_BUCKETS.map((b) => {
      const inBucket = scoped.filter((r) => r.bucket === b.key);
      const value = inBucket.reduce((s, r) => s + r.outstanding, 0);
      return {
        key: b.key,
        label: b.label,
        count: inBucket.length,
        value,
        pct: totalPortfolio > 0 ? (value / totalPortfolio) * 100 : 0,
      };
    });
    const atRisk = byBucket.filter((b) => b.key !== 'current').reduce((s, b) => s + b.value, 0);
    return {
      totalPortfolio,
      byBucket,
      atRisk,
      parRatio: totalPortfolio > 0 ? (atRisk / totalPortfolio) * 100 : 0,
    };
  }, [scoped]);

  const filtered = useMemo(
    () => (applied.bucket ? scoped.filter((r) => r.bucket === applied.bucket) : scoped)
      .slice()
      .sort((a, b) => b.days - a.days),
    [scoped, applied.bucket],
  );

  const columns: MisColumn<Row>[] = [
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'lo', label: 'LO', width: '9%', render: (r) => r.officer_name, text: (r) => r.officer_name },
    { key: 'group', label: 'Group', width: '11%', render: (r) => r.group_name, text: (r) => r.group_name },
    {
      key: 'member',
      label: 'Member',
      width: '14%',
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.client.full_name}
          <span className="block text-[10px] font-normal text-slate-400">{r.client.client_number}</span>
        </span>
      ),
      text: (r) => r.client.full_name,
    },
    { key: 'loan', label: 'Loan No', width: '11%', render: (r) => r.loan.loan_number, text: (r) => r.loan.loan_number },
    { key: 'due', label: 'Final Due', width: '8%', render: (r) => shortDate(r.loan.final_due_date) },
    {
      key: 'days',
      label: 'Days Late',
      width: '7%',
      align: 'center',
      render: (r) => <span className={`font-bold ${BUCKET_TONE[r.bucket]}`}>{r.days}</span>,
      text: (r) => String(r.days),
    },
    {
      key: 'bucket',
      label: 'Bucket',
      width: '9%',
      render: (r) => <span className={`font-bold ${BUCKET_TONE[r.bucket]}`}>{r.bucket_label}</span>,
      text: (r) => r.bucket_label,
    },
    { key: 'overdue', label: 'Overdue', width: '10%', align: 'right', render: (r) => money(r.overdue) },
    {
      key: 'out',
      label: 'Portfolio at Risk',
      width: '12%',
      align: 'right',
      render: (r) => <span className={`font-bold ${BUCKET_TONE[r.bucket]}`}>{money(r.outstanding)}</span>,
      text: (r) => money(r.outstanding),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title="Portfolio at Risk" period={`As on ${shortDate(applied.asOn || asOn)}`} columns={columns} rows={filtered} />}>
        Portfolio at Risk
      </MisPageTitle>

      <MisFilters
        title="Portfolio at Risk"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Group"
      >
        <ScopeFields scope={scope} />
        <Field label="As On Date">
          <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} className="form-field" />
        </Field>
        <Field label="Bucket">
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="form-field">
            <option value="">All</option>
            {PAR_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      {hasSearched && scoped.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Ageing summary as on {shortDate(applied.asOn)}
            </h2>
            <p className="text-xs font-bold text-slate-700">
              PAR ratio:{' '}
              <span className={summary.parRatio > 10 ? 'text-chetu-red' : 'text-emerald-700'}>
                {summary.parRatio.toFixed(1)}%
              </span>{' '}
              <span className="font-normal text-slate-400">
                ({money(summary.atRisk)} of {money(summary.totalPortfolio)})
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {summary.byBucket.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  const next = applied.bucket === b.key ? '' : b.key;
                  setBucket(next);
                  setApplied((prev) => ({ ...prev, bucket: next }));
                }}
                className={`rounded border p-2.5 text-left transition-colors ${
                  applied.bucket === b.key
                    ? 'border-[#0B4394] bg-[#0B4394]/5'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{b.label}</p>
                <p className={`mt-0.5 text-sm font-bold ${BUCKET_TONE[b.key]}`}>{money(b.value)}</p>
                <p className="text-[10px] text-slate-400">
                  {b.count} loan{b.count === 1 ? '' : 's'} • {b.pct.toFixed(1)}%
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No open loans for this selection."
        idleMessage="Choose the as-on date and scope, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${r.bucket_label} • ${money(r.outstanding)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-xs font-bold text-slate-700">
              <span>Loans: {filtered.length}</span>
              <span>Overdue: {money(filtered.reduce((s, r) => s + r.overdue, 0))}</span>
              <span className="text-chetu-red">
                At risk: {money(filtered.reduce((s, r) => s + r.outstanding, 0))}
              </span>
            </div>
          )
        }
      />
    </div>
  );
};
