import React, { useMemo, useState } from "react";
import { CalendarDays, Download, Info, Receipt } from "lucide-react";
import {
  ActionButton,
  Field,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  SearchButton,
  money,
  shortDate,
  todayISO,
  useMisScope,
  type MisColumn,
} from "../../components/mis/MisKit";
import { ScrollArea } from "../../components/common/ScrollArea";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { exportToCSV } from "../../lib/excelExporter";
import { useDatabase } from "../../context/DatabaseContext";
import { FEES, storedLoanFees } from "../../lib/fees";
import { matchScope, useLoanRows, type LoanRow } from "./reportData";

const monthAgoISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
};

/** Master Roll — every loan disbursed in a date window, with drill-down loan details. */
export const MasterRoll: React.FC = () => {
  const scope = useMisScope();
  const { repayments } = useDatabase();
  const { rows, loading } = useLoanRows(scope);

  const [fromDate, setFromDate] = useState(monthAgoISO());
  const [tillDate, setTillDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ from: "", till: "", search: "" });
  const [detailsFor, setDetailsFor] = useState<LoanRow | null>(null);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ from: fromDate, till: tillDate, search });
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!matchScope(r, { search: applied.search }, scope)) return false;
        const disbursed = (r.loan.disbursed_at || r.loan.created_at).split("T")[0];
        if (applied.from && disbursed < applied.from) return false;
        if (applied.till && disbursed > applied.till) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, applied, scope.isLoanOfficer, scope.user?.id],
  );

  const downloadSchedule = (r: LoanRow) =>
    exportToCSV(
      `Schedule_${r.loan.loan_number}`,
      ["Week", "Due Date", "Instalment", "Principal", "Interest", "Paid", "Balance", "Status"],
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

  const downloadCollections = (r: LoanRow) =>
    exportToCSV(
      `Collections_${r.loan.loan_number}`,
      ["Receipt", "Date", "Amount", "Method", "Type"],
      repayments
        .filter((p) => p.loan_id === r.loan.id)
        .map((p) => [
          p.receipt_number,
          p.payment_date,
          p.amount_paid,
          p.payment_method,
          p.collection_type || "Regular",
        ]),
    );

  const downloadHistory = (r: LoanRow) =>
    exportToCSV(
      `History_${r.client.client_number}`,
      [
        "Loan No",
        "Disburse Date",
        "Principal",
        "Interest",
        "Total",
        "Outstanding",
        "Cycle",
        "Status",
      ],
      rows
        .filter((x) => x.client.id === r.client.id)
        .map((x) => [
          x.loan.loan_number,
          shortDate(x.loan.disbursed_at),
          x.loan.principal_amount,
          x.loan.total_interest_amount,
          x.loan.total_amount_payable,
          x.loan.outstanding_balance,
          x.loan.cycle_number || 1,
          x.loan.status,
        ]),
    );

  const totals = useMemo(() => {
    const t = {
      principal: 0,
      interest: 0,
      processing: 0,
      crb: 0,
      security: 0,
      gm: 0,
      charges: 0,
      net: 0,
    };
    for (const r of filtered) {
      const f = storedLoanFees(r.loan);
      t.principal += Number(r.loan.principal_amount || 0);
      t.interest += Number(r.loan.total_interest_amount || 0);
      t.processing += f.processingFee;
      t.crb += f.crbFee;
      t.security += f.securityDeposit;
      t.gm += f.groupMaintenanceFee;
      t.charges += f.totalDeductions;
      t.net += f.netDisbursed;
    }
    return t;
  }, [filtered]);

  const columns: MisColumn<LoanRow>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "9%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "9%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "group",
      label: "Group",
      width: "11%",
      render: (r) => `${r.group_name}`,
      text: (r) => `${r.group_name} (${r.group_code})`,
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
      key: "disb",
      label: "Disburse Date",
      width: "7%",
      render: (r) => shortDate(r.loan.disbursed_at),
    },
    {
      key: "prin",
      label: "Principal",
      width: "7%",
      align: "right",
      render: (r) => money(r.loan.principal_amount),
    },
    {
      key: "int",
      label: "Interest",
      width: "6%",
      align: "right",
      render: (r) => money(r.loan.total_interest_amount),
    },
    {
      key: "total",
      label: "Total Payable",
      width: "7%",
      align: "right",
      render: (r) => money(r.loan.total_amount_payable),
    },
    // The four charges taken at disbursement, as they were actually charged on
    // this loan rather than recomputed from today's schedule.
    {
      key: "proc",
      label: `Processing ${FEES.processingFeePct}%`,
      width: "7%",
      align: "right",
      render: (r) => money(storedLoanFees(r.loan).processingFee),
      text: (r) => money(storedLoanFees(r.loan).processingFee),
    },
    {
      key: "crb",
      label: `CRB ${FEES.crbFeePct}%`,
      width: "6%",
      align: "right",
      render: (r) => money(storedLoanFees(r.loan).crbFee),
      text: (r) => money(storedLoanFees(r.loan).crbFee),
    },
    {
      key: "sec",
      label: `Security ${FEES.securityDepositPct}%`,
      width: "7%",
      align: "right",
      render: (r) => money(storedLoanFees(r.loan).securityDeposit),
      text: (r) => money(storedLoanFees(r.loan).securityDeposit),
    },
    {
      key: "gm",
      label: "Group Maint.",
      width: "6%",
      align: "right",
      render: (r) => money(storedLoanFees(r.loan).groupMaintenanceFee),
      text: (r) => money(storedLoanFees(r.loan).groupMaintenanceFee),
    },
    {
      key: "ded",
      label: "Total Charges",
      width: "7%",
      align: "right",
      render: (r) => (
        <span className="font-semibold text-chetu-red">
          {money(storedLoanFees(r.loan).totalDeductions)}
        </span>
      ),
      text: (r) => money(storedLoanFees(r.loan).totalDeductions),
    },
    {
      key: "net",
      label: "Net Disbursed",
      width: "8%",
      align: "right",
      render: (r) => (
        <span className="font-bold text-emerald-700">
          {money(storedLoanFees(r.loan).netDisbursed)}
        </span>
      ),
      text: (r) => money(storedLoanFees(r.loan).netDisbursed),
    },
    {
      key: "cycle",
      label: "Cycle",
      width: "4%",
      align: "center",
      render: (r) => r.loan.cycle_number || 1,
    },
    {
      key: "action",
      label: "Action",
      width: "10%",
      render: (r) => (
        <div className="flex items-center gap-1">
          <ActionButton tone="amber" title="Loan details info" onClick={() => setDetailsFor(r)}>
            <Info className="h-3 w-3" />
          </ActionButton>
          <ActionButton
            tone="blue"
            title="Download schedule report"
            onClick={() => downloadSchedule(r)}
          >
            <CalendarDays className="h-3 w-3" />
          </ActionButton>
          <ActionButton
            tone="green"
            title="Download collection report"
            onClick={() => downloadCollections(r)}
          >
            <Receipt className="h-3 w-3" />
          </ActionButton>
          <ActionButton
            tone="navy"
            title="Download loan history"
            onClick={() => downloadHistory(r)}
          >
            <Download className="h-3 w-3" />
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Master Roll"
            columns={columns}
            rows={filtered}
            period={`${shortDate(applied.from || fromDate)} to ${shortDate(applied.till || tillDate)}`}
            meta={[
              ["Processing fee", `${FEES.processingFeePct}% of principal`],
              ["CRB fee", `${FEES.crbFeePct}% of principal`],
              ["Security deposit", `${FEES.securityDepositPct}% of principal, refundable`],
              ["Group maintenance", `UGX ${FEES.groupMaintenanceFee.toLocaleString()} per loan`],
            ]}
          />
        }
      >
        Master Roll
      </MisPageTitle>

      <MisFilters
        title="Master Roll"
        cols={3}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name, code / Member name / Loan no"
      >
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
        rowKey={(r) => r.loan.id}
        loading={hasSearched && loading}
        hasSearched={hasSearched}
        emptyMessage="No master roll records for this period."
        idleMessage="Choose From Date and Till Date, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${r.group_name}`}
        footer={
          filtered.length > 0 && (
            <div className="space-y-1 px-4 py-3 text-xs font-bold text-slate-700">
              <div className="flex flex-wrap justify-end gap-x-5 gap-y-1">
                <span>Principal: {money(totals.principal)}</span>
                <span>Interest: {money(totals.interest)}</span>
                <span>Processing: {money(totals.processing)}</span>
                <span>CRB: {money(totals.crb)}</span>
                <span>Security: {money(totals.security)}</span>
                <span>Group maint.: {money(totals.gm)}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 border-t border-slate-200 pt-1">
                <span className="text-chetu-red">Total charges: {money(totals.charges)}</span>
                <span className="text-emerald-700">Net disbursed: {money(totals.net)}</span>
              </div>
            </div>
          )
        }
      />

      <LoanDetailsModal row={detailsFor} onClose={() => setDetailsFor(null)} allRows={rows} />
    </div>
  );
};

const LoanDetailsModal: React.FC<{
  row: LoanRow | null;
  allRows: LoanRow[];
  onClose: () => void;
}> = ({ row, allRows, onClose }) => {
  if (!row) return null;
  const memberLoans = allRows.filter((x) => x.client.id === row.client.id);

  return (
    <MisModal open onClose={onClose} title="Loan Details Info" width="max-w-4xl">
      <div className="form-section-title">Member Information</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Info2 label="Member Code" value={row.client.client_number} />
        <Info2 label="Member Name" value={row.client.full_name} />
        <Info2 label="Admission Date" value={shortDate(row.client.date_registered)} />
        <Info2 label="Branch Name" value={row.branch_name} />
        <Info2 label="Group Name" value={row.group_name} />
        <Info2 label="Meeting Day" value={row.meeting_day} />
        <Info2 label="Security Balance" value={money(row.loan.security_balance)} />
        <Info2 label="Member Type" value={row.client.member_type || "Borrower"} />
        <Info2 label="Member Status" value={row.client.status} />
        <Info2 label="LO Name" value={row.officer_name} />
        <Info2 label="Group Code" value={row.group_code} />
        <Info2 label="Phone" value={row.client.phone_number} />
      </div>

      <div className="form-section-title mt-5">Security Info</div>
      <MiniTable
        headers={["Date", "Loan No", "Amount"]}
        rows={memberLoans
          .filter((x) => Number(x.loan.security_amount || 0) > 0)
          .map((x) => [
            shortDate(x.loan.disbursed_at),
            x.loan.loan_number,
            money(x.loan.security_amount),
          ])}
      />

      <div className="form-section-title mt-5">Loan Information</div>
      <MiniTable
        headers={[
          "Loan No",
          "Disburse Date",
          "Principal",
          "Interest",
          "Total",
          "Security",
          "Cycle",
          "Status",
        ]}
        rows={memberLoans.map((x) => [
          x.loan.loan_number,
          shortDate(x.loan.disbursed_at),
          money(x.loan.principal_amount),
          money(x.loan.total_interest_amount),
          money(x.loan.total_amount_payable),
          money(x.loan.security_balance),
          String(x.loan.cycle_number || 1),
          x.loan.status,
        ])}
      />
    </MisModal>
  );
};

const Info2: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Field label={label}>
    <input readOnly value={value} className="form-field bg-slate-100" />
  </Field>
);

export const MiniTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <ScrollArea axis="x" className="rounded border border-slate-200">
    <table className="w-full min-w-[560px] text-left text-[11px]">
      <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <tr>
          {headers.map((h) => (
            <th key={h} className="whitespace-nowrap px-2 py-2">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-2 py-6 text-center text-slate-400">
              No details found!
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-2 py-2 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </ScrollArea>
);
