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
  monthStartISO,
  useMisScope,
  type MisColumn,
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useDatabase } from "../../context/DatabaseContext";
import { matchScope, useLoanRows, useStaffNames, type LoanRow } from "./reportData";

type Closure = "Fully Paid" | "Settled" | "Written Off";

const CLOSURE_TONE: Record<Closure, string> = {
  "Fully Paid": "text-emerald-700",
  Settled: "text-[#0B4394]",
  "Written Off": "text-chetu-red",
};

interface Row extends LoanRow {
  closure: Closure;
  closed_on: string;
  closed_by: string;
  closure_amount: number;
  collected: number;
  reason: string;
}

/**
 * Loan Closure Report — every loan that left the portfolio in a period and how
 * it left: repaid to term, settled early, or written off. The three routes have
 * very different meanings for the books, so they are reported side by side
 * rather than lumped together as "closed".
 */
export const LoanClosureReport: React.FC = () => {
  const scope = useMisScope();
  const { repayments } = useDatabase();
  const { rows, loading } = useLoanRows(scope);
  const staffName = useStaffNames();

  const [from, setFrom] = useState(monthStartISO());
  const [till, setTill] = useState(todayISO());
  const [closure, setClosure] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    search: "",
    from: "",
    till: "",
    closure: "",
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
      from,
      till,
      closure,
    });
  };

  const filtered = useMemo<Row[]>(() => {
    const collectedByLoan = new Map<string, number>();
    for (const p of repayments) {
      collectedByLoan.set(p.loan_id, (collectedByLoan.get(p.loan_id) || 0) + Number(p.amount_paid));
    }

    return rows
      .filter((r) => matchScope(r, applied, scope))
      .map<Row | null>((r) => {
        const { loan } = r;
        let closureType: Closure;
        let closedOn: string;
        let closedBy: string;
        let amount: number;
        let reason: string;

        if (loan.status === "Written Off") {
          closureType = "Written Off";
          closedOn = (loan.writeoff_at || loan.updated_at || loan.created_at).split("T")[0]!;
          closedBy = staffName(loan.writeoff_by);
          amount = Number(loan.writeoff_amount || 0);
          reason = loan.writeoff_reason || "—";
        } else if (loan.status === "Settled") {
          closureType = "Settled";
          closedOn = (loan.settled_at || loan.updated_at || loan.created_at).split("T")[0]!;
          closedBy = staffName(loan.settled_by);
          amount = Number(loan.settlement_amount || 0);
          reason = "Early settlement";
        } else if (loan.status === "Fully Paid") {
          closureType = "Fully Paid";
          closedOn = (loan.updated_at || loan.created_at).split("T")[0]!;
          closedBy = "—";
          amount = Number(loan.total_amount_payable);
          reason = "Repaid to term";
        } else {
          return null;
        }

        return {
          ...r,
          closure: closureType,
          closed_on: closedOn,
          closed_by: closedBy,
          closure_amount: amount,
          collected: collectedByLoan.get(loan.id) || 0,
          reason,
        };
      })
      .filter((r): r is Row => r !== null)
      .filter((r) => {
        if (applied.closure && r.closure !== applied.closure) return false;
        if (applied.from && r.closed_on < applied.from) return false;
        if (applied.till && r.closed_on > applied.till) return false;
        return true;
      })
      .sort((a, b) => (a.closed_on < b.closed_on ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, repayments, applied, scope.isLoanOfficer, scope.user?.id]);

  const totals = useMemo(() => {
    const t = { paid: 0, settled: 0, written: 0, collected: 0 };
    for (const r of filtered) {
      t.collected += r.collected;
      if (r.closure === "Fully Paid") t.paid += r.closure_amount;
      else if (r.closure === "Settled") t.settled += r.closure_amount;
      else t.written += r.closure_amount;
    }
    return t;
  }, [filtered]);

  const columns: MisColumn<Row>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "8%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "8%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "group",
      label: "Group",
      width: "9%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "member",
      label: "Member",
      width: "13%",
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.client.full_name}
          <span className="block text-[10px] font-normal text-slate-400">
            {r.client.client_number}
          </span>
        </span>
      ),
      text: (r) => r.client.full_name,
    },
    {
      key: "loan",
      label: "Loan No",
      width: "10%",
      render: (r) => r.loan.loan_number,
      text: (r) => r.loan.loan_number,
    },
    {
      key: "prin",
      label: "Principal",
      width: "8%",
      align: "right",
      render: (r) => money(r.loan.principal_amount),
    },
    {
      key: "coll",
      label: "Total Collected",
      width: "9%",
      align: "right",
      render: (r) => money(r.collected),
    },
    {
      key: "closure",
      label: "Closed As",
      width: "8%",
      render: (r) => <span className={`font-bold ${CLOSURE_TONE[r.closure]}`}>{r.closure}</span>,
      text: (r) => r.closure,
    },
    {
      key: "amt",
      label: "Closure Amount",
      width: "9%",
      align: "right",
      render: (r) => (
        <span className={`font-bold ${CLOSURE_TONE[r.closure]}`}>{money(r.closure_amount)}</span>
      ),
      text: (r) => money(r.closure_amount),
    },
    { key: "on", label: "Closed On", width: "8%", render: (r) => shortDate(r.closed_on) },
    {
      key: "by",
      label: "Closed By",
      width: "9%",
      render: (r) => r.closed_by,
      text: (r) => r.closed_by,
    },
    { key: "why", label: "Reason", width: "11%", render: (r) => r.reason, text: (r) => r.reason },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Loan Closure Report"
            period={`${shortDate(applied.from || from)} to ${shortDate(applied.till || till)}`}
            columns={columns}
            rows={filtered}
          />
        }
      >
        Loan Closure Report
      </MisPageTitle>

      <MisFilters
        title="Loan Closure Report"
        cols={6}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name / Loan no / Group"
      >
        <ScopeFields scope={scope} />
        <Field label="From Date">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="form-field"
          />
        </Field>
        <Field label="Till Date">
          <input
            type="date"
            value={till}
            onChange={(e) => setTill(e.target.value)}
            className="form-field"
          />
        </Field>
        <Field label="Closed As">
          <select
            value={closure}
            onChange={(e) => setClosure(e.target.value)}
            className="form-field"
          >
            <option value="">All</option>
            <option value="Fully Paid">Fully Paid</option>
            <option value="Settled">Settled</option>
            <option value="Written Off">Written Off</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No loans were closed in this period."
        idleMessage="Choose the period and scope, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${r.closure} • ${money(r.closure_amount)}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-xs font-bold text-slate-700">
              <span>Loans closed: {filtered.length}</span>
              <span>Collected: {money(totals.collected)}</span>
              <span className="text-emerald-700">Repaid: {money(totals.paid)}</span>
              <span className="text-[#0B4394]">Settled: {money(totals.settled)}</span>
              <span className="text-chetu-red">Written off: {money(totals.written)}</span>
            </div>
          )
        }
      />
    </div>
  );
};
