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
import { matchScope, useLoanRows, type LoanRow } from "./reportData";

interface Row {
  id: string;
  base: LoanRow;
  collectionDate: string;
  collectionAmount: number;
}

const OVERDUE_TYPES = ["overdue", "baddebt", "bad debt", "arrears"];

/** Overdue Collection List — collections recovered against arrears / bad debts. */
export const OverdueCollectionList: React.FC = () => {
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
      .filter((p) => OVERDUE_TYPES.includes((p.collection_type || "").toLowerCase()))
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
          collectionDate: p.payment_date,
          collectionAmount: Number(p.amount_paid),
        };
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => (a.collectionDate < b.collectionDate ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanRows, repayments, applied, scope.isLoanOfficer, scope.user?.id]);

  const total = filtered.reduce((s, r) => s + r.collectionAmount, 0);

  const columns: MisColumn<Row>[] = [
    {
      key: "date",
      label: "Collection date",
      width: "10%",
      render: (r) => shortDate(r.collectionDate),
    },
    { key: "lo", label: "LO", width: "11%", render: (r) => r.base.officer_name },
    { key: "group", label: "Group", width: "12%", render: (r) => r.base.group_name },
    {
      key: "member",
      label: "Member",
      width: "14%",
      render: (r) => (
        <span className="font-semibold text-slate-900">{r.base.client.full_name}</span>
      ),
      text: (r) => r.base.client.full_name,
    },
    { key: "product", label: "Product", width: "11%", render: (r) => r.base.product_name },
    { key: "day", label: "Meeting Day", width: "9%", render: (r) => r.base.meeting_day },
    { key: "loan", label: "Loan No.", width: "12%", render: (r) => r.base.loan.loan_number },
    {
      key: "amount",
      label: "Collection Amount",
      width: "11%",
      align: "right",
      render: (r) => (
        <span className="font-bold text-emerald-600">{money(r.collectionAmount)}</span>
      ),
      text: (r) => money(r.collectionAmount),
    },
    {
      key: "status",
      label: "Loan Status",
      width: "10%",
      render: (r) => (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
          {r.base.loan.status}
        </span>
      ),
      text: (r) => r.base.loan.status,
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Overdue Collection List"
            period={`${shortDate(applied.from || fromDate)} to ${shortDate(applied.till || tillDate)}`}
            columns={columns}
            rows={filtered}
          />
        }
      >
        Overdue Collection List
      </MisPageTitle>

      <MisFilters
        title="Overdue Collection List"
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
        emptyMessage="No overdue collections for this period."
        idleMessage="Select the scope and dates, then press Search."
        mobileTitle={(r) => r.base.client.full_name}
        mobileSubtitle={(r) => `${r.base.loan.loan_number} • ${money(r.collectionAmount)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex items-center justify-end px-4 py-3 text-xs font-bold text-slate-700">
              Total Overdue Collection:{" "}
              <span className="ml-2 text-emerald-600">{money(total)}</span>
            </div>
          )
        }
      />
    </div>
  );
};
