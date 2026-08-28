import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
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
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useDatabase } from "../../context/DatabaseContext";
import { matchScope, useLoanRows, type LoanRow } from "./reportData";
import { MiniTable } from "./MasterRoll";

interface Row {
  id: string;
  base: LoanRow;
  collectedBy: string;
  collectionDate: string;
  collectionAmount: number;
  loanType: string;
}

/** Day Collection List — every collection captured within a date window. */
export const DayCollectionList: React.FC = () => {
  const scope = useMisScope();
  const { repayments, loanProducts } = useDatabase();
  const { rows: loanRows, loading } = useLoanRows(scope);

  const [loanType, setLoanType] = useState("");
  const [fromDate, setFromDate] = useState(todayISO());
  const [tillDate, setTillDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    search: "",
    loanType: "",
    from: "",
    till: "",
  });
  const [detail, setDetail] = useState<Row | null>(null);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
      loanType,
      from: fromDate,
      till: tillDate,
    });
  };

  const filtered = useMemo<Row[]>(() => {
    const baseByLoan = new Map(loanRows.map((r) => [r.loan.id, r]));
    return repayments
      .filter(
        (p) =>
          (!applied.from || p.payment_date >= applied.from) &&
          (!applied.till || p.payment_date <= applied.till),
      )
      .map<Row | null>((p) => {
        const base = baseByLoan.get(p.loan_id);
        if (!base) return null;
        if (!matchScope(base, applied, scope)) return null;
        if (applied.loanType && base.loan.product_id !== applied.loanType) return null;
        return {
          id: p.id,
          base,
          collectedBy:
            scope.officerName(p.recorded_by) === "—"
              ? base.officer_name
              : scope.officerName(p.recorded_by),
          collectionDate: p.payment_date,
          collectionAmount: Number(p.amount_paid),
          loanType: base.product_name,
        };
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => (a.collectionDate < b.collectionDate ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanRows, repayments, applied, scope.isLoanOfficer, scope.user?.id, scope.officers]);

  const total = filtered.reduce((s, r) => s + r.collectionAmount, 0);

  const columns: MisColumn<Row>[] = [
    { key: "branch", label: "Branch", width: "9%", render: (r) => r.base.branch_name },
    { key: "group", label: "Group", width: "11%", render: (r) => r.base.group_name },
    {
      key: "member",
      label: "Member",
      width: "13%",
      render: (r) => (
        <span className="font-semibold text-slate-900">{r.base.client.full_name}</span>
      ),
      text: (r) => r.base.client.full_name,
    },
    { key: "loan", label: "Loan No", width: "11%", render: (r) => r.base.loan.loan_number },
    { key: "by", label: "Collected By", width: "10%", render: (r) => r.collectedBy },
    { key: "type", label: "Loan Type", width: "10%", render: (r) => r.loanType },
    { key: "day", label: "Meeting Day", width: "8%", render: (r) => r.base.meeting_day },
    {
      key: "date",
      label: "Collection Date",
      width: "9%",
      render: (r) => shortDate(r.collectionDate),
    },
    {
      key: "amount",
      label: "Collection Amount",
      width: "10%",
      align: "right",
      render: (r) => (
        <span className="font-bold text-emerald-600">{money(r.collectionAmount)}</span>
      ),
      text: (r) => money(r.collectionAmount),
    },
    {
      key: "status",
      label: "Complete Status",
      width: "9%",
      render: (r) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            Number(r.base.loan.outstanding_balance) <= 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {Number(r.base.loan.outstanding_balance) <= 0 ? "Completed" : "Running"}
        </span>
      ),
      text: (r) => (Number(r.base.loan.outstanding_balance) <= 0 ? "Completed" : "Running"),
    },
    {
      key: "action",
      label: "Action",
      width: "6%",
      render: (r) => (
        <ActionButton tone="amber" title="Collection info" onClick={() => setDetail(r)}>
          <Info className="h-3 w-3" />
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Day Collection List"
            period={`${shortDate(applied.from || fromDate)} to ${shortDate(applied.till || tillDate)}`}
            columns={columns}
            rows={filtered}
          />
        }
      >
        Day Collection List
      </MisPageTitle>

      <MisFilters
        title="Day Collection List"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Group"
      >
        <ScopeFields scope={scope} />
        <Field label="Loan Type">
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value)}
            className="form-field"
          >
            <option value="">-- All --</option>
            {loanProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From Date">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="form-field"
          />
        </Field>
        <Field label="Till Date">
          <input
            type="date"
            value={tillDate}
            onChange={(e) => setTillDate(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No collections captured for this period."
        idleMessage="Select the scope and dates, then press Search."
        mobileTitle={(r) => r.base.client.full_name}
        mobileSubtitle={(r) => `${r.base.loan.loan_number} • ${money(r.collectionAmount)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex items-center justify-end px-4 py-3 text-xs font-bold text-slate-700">
              Total Collection: <span className="ml-2 text-emerald-600">{money(total)}</span>
            </div>
          )
        }
      />

      {detail && (
        <MisModal
          open
          onClose={() => setDetail(null)}
          title="Collection Details Info"
          width="max-w-3xl"
        >
          <div className="form-section-title">Loan Information</div>
          <MiniTable
            headers={[
              "Loan No",
              "Member",
              "Group",
              "Principal",
              "Total Payable",
              "Outstanding",
              "Status",
            ]}
            rows={[
              [
                detail.base.loan.loan_number,
                detail.base.client.full_name,
                detail.base.group_name,
                money(detail.base.loan.principal_amount),
                money(detail.base.loan.total_amount_payable),
                money(detail.base.loan.outstanding_balance),
                detail.base.loan.status,
              ],
            ]}
          />
          <div className="form-section-title mt-5">Repayment Schedule</div>
          <MiniTable
            headers={["Week", "Due Date", "Instalment", "Paid", "Balance", "Status"]}
            rows={detail.base.schedule.map((s) => [
              String(s.week_number),
              shortDate(s.due_date),
              money(s.installment_amount),
              money(s.paid_amount),
              money(s.remaining_balance),
              s.status,
            ])}
          />
        </MisModal>
      )}
    </div>
  );
};
