/** The branch loan book: what is out, what is late and who is carrying it. */
import React, { useMemo, useState } from "react";
import { HandCoins } from "lucide-react";
import { CLOSED_LOAN_STATUSES, type Loan } from "../../../types/database.types";
import { daysPastDue, type ScheduleRow } from "../../../pages/reports/reportData";
import { useDatabase } from "../../../context/DatabaseContext";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { compactUGX, EmptyState, Panel, parTone, percent, StatTile } from "../BranchUi";
import { staffName, type BranchTabProps } from "./shared";

const STATUS_TONES: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700",
  "Partially Paid": "bg-blue-50 text-[#0B4394]",
  Overdue: "bg-amber-50 text-amber-700",
  Defaulted: "bg-red-50 text-red-700",
  "Written Off": "bg-slate-100 text-slate-600",
  "Fully Paid": "bg-slate-100 text-slate-600",
  Settled: "bg-slate-100 text-slate-600",
  Pending: "bg-slate-100 text-slate-600",
};

export const BranchLoans: React.FC<BranchTabProps> = ({ slice, metrics, staff }) => {
  const { loanProducts } = useDatabase();
  const [status, setStatus] = useState("Open");
  const [search, setSearch] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const clientName = (id: string) => slice.clients.find((c) => c.id === id)?.full_name || "—";
  const productName = (id: string) => loanProducts.find((p) => p.id === id)?.product_name || "—";
  const officerFor = (clientId: string) =>
    slice.clients.find((c) => c.id === clientId)?.loan_officer_id;

  const arrearsOf = (loan: Loan) => daysPastDue((loan.schedule || []) as ScheduleRow[], today);
  const nextDue = (loan: Loan) => {
    const upcoming = (loan.schedule || [])
      .filter((row) => Number(row.installment_amount || 0) - Number(row.paid_amount || 0) > 0)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0];
    return upcoming?.due_date;
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return slice.loans
      .filter((loan) => {
        const open = !CLOSED_LOAN_STATUSES.includes(loan.status) && loan.status !== "Pending";
        if (status === "Open" && !open) return false;
        if (status === "Arrears" && (!open || arrearsOf(loan) === 0)) return false;
        if (status === "Closed" && !CLOSED_LOAN_STATUSES.includes(loan.status)) return false;
        if (!["All", "Open", "Arrears", "Closed"].includes(status) && loan.status !== status)
          return false;
        if (!term) return true;
        return [loan.loan_number, clientName(loan.client_id)].some((field) =>
          String(field).toLowerCase().includes(term),
        );
      })
      .sort(
        (a, b) =>
          arrearsOf(b) - arrearsOf(a) ||
          Number(b.outstanding_balance) - Number(a.outstanding_balance),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.loans, slice.clients, status, search]);

  const columns: MisColumn<Loan>[] = [
    {
      key: "number",
      label: "Loan ID",
      width: "13%",
      render: (r) => r.loan_number,
      text: (r) => r.loan_number,
    },
    {
      key: "member",
      label: "Member",
      width: "17%",
      render: (r) => (
        <span className="font-semibold text-slate-800">{clientName(r.client_id)}</span>
      ),
      text: (r) => clientName(r.client_id),
    },
    {
      key: "product",
      label: "Product",
      width: "13%",
      render: (r) => productName(r.product_id),
      text: (r) => productName(r.product_id),
    },
    {
      key: "principal",
      label: "Principal",
      width: "11%",
      align: "right",
      render: (r) => money(r.principal_amount),
      text: (r) => `UGX ${money(r.principal_amount)}`,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      width: "11%",
      align: "right",
      render: (r) => <span className="font-bold">{money(r.outstanding_balance)}</span>,
      text: (r) => `UGX ${money(r.outstanding_balance)}`,
    },
    {
      key: "due",
      label: "Next Due",
      width: "10%",
      render: (r) => shortDate(nextDue(r)),
      text: (r) => shortDate(nextDue(r)),
    },
    {
      key: "arrears",
      label: "Days in Arrears",
      width: "10%",
      align: "right",
      render: (r) => {
        const days = arrearsOf(r);
        return days > 0 ? (
          <span className={days > 30 ? "font-bold text-red-600" : "font-bold text-amber-600"}>
            {days}
          </span>
        ) : (
          "—"
        );
      },
      text: (r) => String(arrearsOf(r)),
    },
    {
      key: "status",
      label: "Status",
      width: "10%",
      render: (r) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_TONES[r.status] || "bg-slate-100 text-slate-600"}`}
        >
          {r.status}
        </span>
      ),
      text: (r) => r.status,
    },
    {
      key: "officer",
      label: "Loan Officer",
      width: "15%",
      render: (r) =>
        staffName(staff, officerFor(r.client_id)) || (
          <span className="text-slate-400">Unassigned</span>
        ),
      text: (r) => staffName(staff, officerFor(r.client_id)) || "Unassigned",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Active loans" value={money(metrics.loans.active)} />
        <StatTile
          label="Pending applications"
          value={money(metrics.loans.pending)}
          tone={metrics.loans.pending > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <StatTile label="Approved, not disbursed" value={money(metrics.loans.approved)} />
        <StatTile label="Disbursed to date" value={money(metrics.loans.disbursedToDate)} />
        <StatTile
          label="In arrears"
          value={money(metrics.loans.overdue)}
          tone={metrics.loans.overdue > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <StatTile
          label="Outstanding"
          value={compactUGX(metrics.portfolio.outstanding)}
          hint={`UGX ${money(metrics.portfolio.outstanding)}`}
        />
        <StatTile
          label="PAR 30"
          value={percent(metrics.portfolio.par30Ratio)}
          tone={parTone(metrics.portfolio.par30Ratio)}
          hint={`UGX ${money(metrics.portfolio.par30Amount)}`}
        />
      </div>

      <Panel title="Loan portfolio" subtitle={`${rows.length} loans shown`}>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="form-field sm:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by loan number or member…"
            aria-label="Search loans"
          />
          <select
            className="form-field"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter loans"
          >
            <option value="Open">Open loans</option>
            <option value="Arrears">In arrears</option>
            <option value="Active">Active</option>
            <option value="Overdue">Overdue</option>
            <option value="Defaulted">Defaulted</option>
            <option value="Closed">Closed</option>
            <option value="All">All loans</option>
          </select>
        </div>

        {slice.loans.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No loans at this branch yet"
            message="Loans disbursed to members here will appear in this list."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            emptyMessage="No loans match these filters."
            mobileTitle={(r) => clientName(r.client_id)}
            mobileSubtitle={(r) => r.loan_number}
            maxHeight="60vh"
          />
        )}
      </Panel>
    </div>
  );
};
