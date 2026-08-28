import React, { useMemo, useState } from "react";
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
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useDatabase } from "../../context/DatabaseContext";
import { matchScope, overdueAsOf, useLoanRows, type LoanRow } from "./reportData";

interface Row extends LoanRow {
  overdue: number;
  lastCollection: number;
  lastCollectionDate?: string;
}

/** Daily Overdue Report — loans carrying arrears as on the selected date. */
export const DailyOverdueReport: React.FC = () => {
  const scope = useMisScope();
  const { repayments } = useDatabase();
  const { rows, loading } = useLoanRows(scope);

  const [asOn, setAsOn] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    asOn: "",
    search: "",
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      asOn,
      search,
    });
  };

  const filtered = useMemo<Row[]>(() => {
    if (!applied.asOn) return [];
    const lastByLoan = new Map<string, { amount: number; date: string }>();
    for (const p of repayments) {
      if (p.payment_date > applied.asOn) continue;
      const prev = lastByLoan.get(p.loan_id);
      if (!prev || p.payment_date >= prev.date)
        lastByLoan.set(p.loan_id, { amount: Number(p.amount_paid), date: p.payment_date });
    }
    return rows
      .filter((r) => matchScope(r, applied, scope))
      .map((r) => {
        const last = lastByLoan.get(r.loan.id);
        return {
          ...r,
          overdue: overdueAsOf(r.schedule, applied.asOn),
          lastCollection: last?.amount ?? 0,
          lastCollectionDate: last?.date,
        };
      })
      .filter((r) => r.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, repayments, applied, scope.isLoanOfficer, scope.user?.id]);

  const totalOverdue = filtered.reduce((s, r) => s + r.overdue, 0);
  const totalOutstanding = filtered.reduce((s, r) => s + Number(r.loan.outstanding_balance), 0);

  const columns: MisColumn<Row>[] = [
    { key: "branch", label: "Branch", width: "11%", render: (r) => r.branch_name },
    {
      key: "member",
      label: "Member Name",
      width: "16%",
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.client.full_name}
          <span className="block text-[10px] font-normal text-slate-400">{r.group_name}</span>
        </span>
      ),
      text: (r) => r.client.full_name,
    },
    { key: "loan", label: "Loan No", width: "13%", render: (r) => r.loan.loan_number },
    {
      key: "disb",
      label: "Disbursement Date",
      width: "11%",
      render: (r) => shortDate(r.loan.disbursed_at),
    },
    {
      key: "prin",
      label: "Principal Amount",
      width: "12%",
      align: "right",
      render: (r) => money(r.loan.principal_amount),
    },
    {
      key: "overdue",
      label: "Overdue Amount",
      width: "12%",
      align: "right",
      render: (r) => <span className="font-bold text-rose-600">{money(r.overdue)}</span>,
      text: (r) => money(r.overdue),
    },
    {
      key: "out",
      label: "Outstanding Amount",
      width: "12%",
      align: "right",
      render: (r) => money(r.loan.outstanding_balance),
    },
    {
      key: "last",
      label: "Last Collection Amount",
      width: "13%",
      align: "right",
      render: (r) => (
        <span>
          {money(r.lastCollection)}
          {r.lastCollectionDate && (
            <span className="block text-[10px] text-slate-400">
              {shortDate(r.lastCollectionDate)}
            </span>
          )}
        </span>
      ),
      text: (r) => money(r.lastCollection),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Daily Overdue Report"
            period={`As on ${shortDate(applied.asOn || asOn)}`}
            columns={columns}
            rows={filtered}
          />
        }
      >
        Daily Overdue Report
      </MisPageTitle>

      <MisFilters
        title="Daily Overdue Report"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Group"
      >
        <ScopeFields scope={scope} />
        <Field label="As On Date">
          <input
            type="date"
            value={asOn}
            onChange={(e) => setAsOn(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No overdue loans as on the selected date."
        idleMessage="Select the scope and As On Date, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • Overdue ${money(r.overdue)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-xs font-bold text-slate-700">
              <span>
                Total Overdue: <span className="text-rose-600">{money(totalOverdue)}</span>
              </span>
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
