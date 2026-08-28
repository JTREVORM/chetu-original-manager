import React, { useMemo, useState } from "react";
import { Printer, Send } from "lucide-react";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { formatUGX } from "../lib/loanCalculations";
import { FEES, feesMatchStored, loanFees, storedLoanFees } from "../lib/fees";
import { generateDisbursementVoucherPDF, generateLoanAgreementPDF } from "../lib/pdfGenerator";
import type { Client, Loan } from "../types/database.types";
import {
  ActionButton,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  useMisScope,
  type MisColumn,
} from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";

interface Row {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
  net: number;
}

/**
 * Waiting for Disburse — loans that have been approved but whose cash has not
 * yet gone out. A loan lands here the moment a Branch Manager approves the
 * application, and leaves it once the officer records the disbursement.
 *
 * The manager approves and the officer disburses, so the two steps are done by
 * different people; that separation is the reason these are two screens.
 */
export const LoanWaitingDisburse: React.FC = () => {
  const scope = useMisScope();
  const { loans, clients, clientGroups, disburseLoan } = useDatabase();
  const { addToast } = useNotifications();

  const canDisburse = scope.isAdmin || scope.isLoanOfficer;

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [active, setActive] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    return (
      loans
        // 'Pending' on a loan means approved but not yet disbursed.
        .filter((l) => l.status === "Pending")
        .map<Row | null>((loan) => {
          const client = clientById.get(loan.client_id);
          if (!client) return null;
          const group = client.group_id ? groupById.get(client.group_id) : undefined;
          const officerId = client.loan_officer_id || group?.loan_officer_id || "";
          return {
            loan,
            client,
            group_name: group?.group_name || "—",
            branch_name: scope.branchName(client.branch_id),
            officer_name: group?.loan_officer_name || scope.officerName(officerId),
            officer_id: officerId,
            group_id: group?.id || "",
            branch_id: client.branch_id || "",
            net: storedLoanFees(loan).netDisbursed,
          };
        })
        .filter((r): r is Row => r !== null)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (
        q &&
        !`${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
    });
  };

  const confirm = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await disburseLoan(active.loan.id);
      addToast(
        "success",
        "Loan disbursed",
        `${formatUGX(active.net)} released on ${active.loan.loan_number}.`,
      );
      setActive(null);
    } catch (error) {
      addToast(
        "error",
        "Disbursement failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const columns: MisColumn<Row>[] = [
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
      width: "10%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "group",
      label: "Group Name",
      width: "11%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "mcode",
      label: "Member Code",
      width: "10%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "mname",
      label: "Member Name",
      width: "13%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
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
      width: "9%",
      align: "right",
      render: (r) => money(r.loan.principal_amount),
    },
    {
      key: "net",
      label: "Net To Member",
      width: "10%",
      align: "right",
      render: (r) => <span className="font-bold text-emerald-700">{money(r.net)}</span>,
      text: (r) => money(r.net),
    },
    {
      key: "due",
      label: "First Repayment",
      width: "9%",
      render: (r) => shortDate(r.loan.first_repayment_date),
    },
    {
      key: "act",
      label: "Action",
      width: "6%",
      align: "center",
      render: (r) =>
        canDisburse ? (
          <ActionButton onClick={() => setActive(r)} title="Disburse this loan" tone="green">
            <Send className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  const taken = active ? storedLoanFees(active.loan) : null;
  const std = active ? loanFees(active.loan.principal_amount) : null;
  const matches =
    active && taken
      ? feesMatchStored(
          active.loan.principal_amount,
          taken.processingFee,
          taken.securityDeposit,
          taken.crbFee,
          taken.groupMaintenanceFee,
        )
      : true;

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons title="Waiting for Disburse" columns={columns} rows={filtered} />
        }
      >
        Waiting for Disburse
      </MisPageTitle>

      {!canDisburse && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Disbursement is recorded by the Loan Officer who will hand over the cash, or by an
          Administrator. A Branch Manager approves the loan but does not release it.
        </p>
      )}

      <MisFilters
        title="Waiting for Disburse"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage="No approved loans are waiting for disbursement."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • net ${money(r.net)}`}
      />

      <MisModal
        open={!!active}
        onClose={() => setActive(null)}
        title="Disburse Loan"
        width="max-w-lg"
      >
        {active && taken && std && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.client.full_name}</p>
              <p className="text-slate-500">
                {active.loan.loan_number} • {active.group_name} • {active.branch_name}
              </p>
            </div>

            <div className="space-y-1.5 rounded border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Charges &amp; deductions
              </p>
              <Line label="Approved principal" value={formatUGX(active.loan.principal_amount)} />
              <Line
                label={`Processing fee (${FEES.processingFeePct}%)`}
                value={formatUGX(taken.processingFee)}
              />
              <Line label={`CRB fee (${FEES.crbFeePct}%)`} value={formatUGX(taken.crbFee)} />
              <Line
                label={`Security deposit (${FEES.securityDepositPct}%)`}
                value={formatUGX(taken.securityDeposit)}
              />
              <Line label="Group maintenance fee" value={formatUGX(taken.groupMaintenanceFee)} />
              <Line label="Total deductions" value={formatUGX(taken.totalDeductions)} bold />
              <p className="border-t border-emerald-200 pt-1.5 text-sm font-bold text-emerald-800">
                Net cash to member: {formatUGX(taken.netDisbursed)}
              </p>
            </div>

            {!matches && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2.5 font-semibold text-amber-800">
                The charges stored on this loan differ from the current schedule (which would give
                processing {formatUGX(std.processingFee)}, CRB {formatUGX(std.crbFee)}, security{" "}
                {formatUGX(std.securityDeposit)}). That is expected if the schedule changed after
                approval — check before releasing cash.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => generateLoanAgreementPDF(active.loan)}
                  className="inline-flex items-center justify-center gap-2 rounded bg-slate-100 px-3 py-2 font-bold text-slate-700"
                >
                  <Printer className="h-4 w-4" /> Agreement
                </button>
                <button
                  type="button"
                  onClick={() => generateDisbursementVoucherPDF(active.loan)}
                  className="inline-flex items-center justify-center gap-2 rounded bg-slate-100 px-3 py-2 font-bold text-slate-700"
                >
                  <Printer className="h-4 w-4" /> Voucher
                </button>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                {canDisburse && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={confirm}
                    className="rounded bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? "Disbursing…" : "Execute disbursement"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};

const Line: React.FC<{ label: string; value: string; bold?: boolean }> = ({
  label,
  value,
  bold,
}) => (
  <div
    className={`flex justify-between ${bold ? "border-t border-emerald-200 pt-1 font-bold" : ""}`}
  >
    <span className={bold ? "text-slate-800" : "text-slate-600"}>{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
);
