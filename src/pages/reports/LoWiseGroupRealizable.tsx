import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  ActionButton,
  Field,
  MisFilters,
  MisModal,
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
import { MiniTable } from './MasterRoll';
import { matchScope, overdueAsOf, realizableOn, useLoanRows, type LoanRow } from './reportData';

interface GroupRow {
  key: string;
  branch_name: string;
  officer_name: string;
  group_id: string;
  group_name: string;
  group_code: string;
  meeting_day: string;
  members: number;
  loans: number;
  outstanding: number;
  realizable: number;
  overdue: number;
  total: number;
  rows: LoanRow[];
}

/** LO Wise Group Realizable — per-group realizable / overdue totals for a loan officer. */
export const LoWiseGroupRealizable: React.FC = () => {
  const scope = useMisScope();
  const { rows, loading } = useLoanRows(scope);

  const [asOn, setAsOn] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ asOn: '', search: '', branchId: '', officerId: '', groupId: '' });
  const [detailsFor, setDetailsFor] = useState<GroupRow | null>(null);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      asOn,
      search,
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
    });
  };

  const groupRows = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    for (const r of rows) {
      if (!matchScope(r, applied, scope)) continue;
      if (r.loan.status === 'Fully Paid' || Number(r.loan.outstanding_balance) <= 0) continue;
      const key = `${r.officer_id}|${r.group_id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          branch_name: r.branch_name,
          officer_name: r.officer_name,
          group_id: r.group_id,
          group_name: r.group_name,
          group_code: r.group_code,
          meeting_day: r.meeting_day,
          members: 0,
          loans: 0,
          outstanding: 0,
          realizable: 0,
          overdue: 0,
          total: 0,
          rows: [],
        };
        map.set(key, g);
      }
      g.loans += 1;
      g.outstanding += Number(r.loan.outstanding_balance || 0);
      g.realizable += realizableOn(r.schedule, applied.asOn || asOn);
      g.overdue += overdueAsOf(r.schedule, applied.asOn || asOn);
      g.rows.push(r);
    }
    for (const g of map.values()) {
      g.members = new Set(g.rows.map((r) => r.client.id)).size;
      g.total = g.realizable + g.overdue;
    }
    return [...map.values()].sort(
      (a, b) => a.officer_name.localeCompare(b.officer_name) || a.group_name.localeCompare(b.group_name),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const totals = useMemo(
    () =>
      groupRows.reduce(
        (acc, g) => ({
          outstanding: acc.outstanding + g.outstanding,
          realizable: acc.realizable + g.realizable,
          overdue: acc.overdue + g.overdue,
          total: acc.total + g.total,
        }),
        { outstanding: 0, realizable: 0, overdue: 0, total: 0 },
      ),
    [groupRows],
  );

  const columns: MisColumn<GroupRow>[] = [
    { key: 'branch', label: 'Branch', width: '11%', render: (g) => g.branch_name, text: (g) => g.branch_name },
    { key: 'officer', label: 'Loan Officer', width: '13%', render: (g) => g.officer_name, text: (g) => g.officer_name },
    {
      key: 'group',
      label: 'Group',
      width: '16%',
      render: (g) => (
        <span>
          <span className="font-semibold text-[#0B4394]">{g.group_code}</span> — {g.group_name}
        </span>
      ),
      text: (g) => `${g.group_code} — ${g.group_name}`,
    },
    { key: 'day', label: 'Meeting Day', width: '9%', render: (g) => g.meeting_day, text: (g) => g.meeting_day },
    { key: 'members', label: 'Members', width: '7%', align: 'right', render: (g) => g.members, text: (g) => String(g.members) },
    { key: 'loans', label: 'Loans', width: '6%', align: 'right', render: (g) => g.loans, text: (g) => String(g.loans) },
    {
      key: 'outstanding',
      label: 'Outstanding',
      width: '11%',
      align: 'right',
      render: (g) => money(g.outstanding),
      text: (g) => money(g.outstanding),
    },
    {
      key: 'realizable',
      label: "Today's Realizable",
      width: '11%',
      align: 'right',
      render: (g) => <span className="font-semibold text-emerald-600">{money(g.realizable)}</span>,
      text: (g) => money(g.realizable),
    },
    {
      key: 'overdue',
      label: 'Overdue',
      width: '10%',
      align: 'right',
      render: (g) => <span className="font-semibold text-chetu-red">{money(g.overdue)}</span>,
      text: (g) => money(g.overdue),
    },
    {
      key: 'total',
      label: 'Total Realizable',
      width: '11%',
      align: 'right',
      render: (g) => <span className="font-bold">{money(g.total)}</span>,
      text: (g) => money(g.total),
    },
    {
      key: 'actions',
      label: 'Info',
      width: '5%',
      align: 'center',
      render: (g) => (
        <ActionButton onClick={() => setDetailsFor(g)} title="Group loan details" tone="navy">
          <Info className="h-3.5 w-3.5" />
        </ActionButton>
      ),
      text: () => '',
    },
  ];

  return (
    <div className="space-y-4">
      <MisPageTitle right={<ReportExportButtons title="LO Wise Group Realizable" period={`As on ${shortDate(applied.asOn || asOn)}`} columns={columns} rows={groupRows} />}>
        LO Wise Group Realizable
      </MisPageTitle>

      <MisFilters
        title="LO Wise Group Realizable"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search group, member or loan number…"
        onSubmit={runSearch}
      >
        <ScopeFields scope={scope} />
        <Field label="As On Date">
          <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} className="form-field" />
        </Field>
        <Field label="&nbsp;">
          <SearchButton onClick={runSearch} />
        </Field>
      </MisFilters>

      <MisTable
        columns={columns}
        rows={groupRows}
        rowKey={(g) => g.key}
        loading={loading}
        hasSearched={hasSearched}
        mobileTitle={(g) => `${g.group_code} — ${g.group_name}`}
        mobileSubtitle={(g) => `${g.officer_name} · ${g.meeting_day}`}
        footer={
          groupRows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700">
              <span>Outstanding: {money(totals.outstanding)}</span>
              <span className="text-emerald-600">Realizable: {money(totals.realizable)}</span>
              <span className="text-chetu-red">Overdue: {money(totals.overdue)}</span>
              <span>Total: {money(totals.total)}</span>
            </div>
          ) : undefined
        }
      />

      <MisModal
        open={!!detailsFor}
        onClose={() => setDetailsFor(null)}
        title={detailsFor ? `${detailsFor.group_code} — ${detailsFor.group_name}` : ''}
      >
        {detailsFor && (
          <MiniTable
            headers={['Member', 'Loan #', 'Disbursed', 'Principal', 'Outstanding', "Today's Realizable", 'Overdue']}
            rows={detailsFor.rows.map((r) => [
              r.client.full_name,
              r.loan.loan_number,
              shortDate(r.loan.disbursed_at || r.loan.created_at),
              money(r.loan.principal_amount),
              money(r.loan.outstanding_balance),
              money(realizableOn(r.schedule, applied.asOn || asOn)),
              money(overdueAsOf(r.schedule, applied.asOn || asOn)),
            ])}
          />
        )}
      </MisModal>
    </div>
  );
};
