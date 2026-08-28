import React, { useMemo, useState } from "react";
import { useNavigate } from "../lib/router-compat";
import { Check, Printer, X } from "lucide-react";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { calculateLoanSchedule, formatUGX } from "../lib/loanCalculations";
import { FEES, feeLines, validateLoanRequest } from "../lib/fees";
import { generateLoanApplicationPDF } from "../lib/pdfGenerator";
import type { Client, LoanApplication } from "../types/database.types";
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
  app: LoanApplication;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

/**
 * Waiting for Approval — loan applications a Branch Manager has still to
 * decide on. It is the first of three screens the application moves through:
 *
 *   Waiting for Approval  →  approve  →  Waiting for Disburse
 *                         →  reject   →  Loan Rejected List
 *
 * Approving here creates the loan and its repayment schedule, so the row
 * leaves this queue and appears on the disbursement screen.
 */
export const LoanWaitingApproval: React.FC = () => {
  const scope = useMisScope();
  const navigate = useNavigate();
  const {
    loanApplications,
    clients,
    clientGroups,
    loanProducts,
    approveLoanApplication,
    rejectLoanApplication,
  } = useDatabase();
  const { addToast } = useNotifications();

  const canReview = scope.isAdmin || scope.isBranchManager;

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    return loanApplications
      .filter((a) => a.status === "Pending")
      .map<Row | null>((app) => {
        const client = clientById.get(app.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";
        return {
          app,
          client,
          group_name: group?.group_name || "—",
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          branch_id: client.branch_id || "",
        };
      })
      .filter((r): r is Row => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanApplications, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.app.submitted_by !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (
        q &&
        !`${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.app.application_number}`
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

  // Preview the schedule and charges the loan would carry if approved.
  const preview = useMemo(() => {
    if (!reviewing) return null;
    const product = loanProducts.find((p) => p.id === reviewing.app.product_id);
    if (!product) return null;
    return {
      product,
      calc: calculateLoanSchedule(
        reviewing.app.requested_amount,
        product.interest_rate,
        product.interest_type,
        reviewing.app.requested_weeks,
        FEES.processingFeePct,
      ),
      fees: feeLines(reviewing.app.requested_amount),
      errors: validateLoanRequest(
        reviewing.app.requested_amount,
        reviewing.app.requested_weeks,
        product,
      ),
    };
  }, [reviewing, loanProducts]);

  const approve = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      const loan = await approveLoanApplication(reviewing.app.id);
      addToast("success", "Loan approved", `${loan.loan_number} is now waiting for disbursement.`);
      setReviewing(null);
      navigate("/loan-waiting-disburse");
    } catch (error) {
      addToast(
        "error",
        "Approval failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (!reason.trim())
      return addToast("warning", "Reason required", "Tell the officer what to fix.");
    setBusy(true);
    try {
      await rejectLoanApplication(rejecting.app.id, reason.trim());
      addToast(
        "info",
        "Application rejected",
        `${rejecting.app.application_number} moved to the rejected list.`,
      );
      setRejecting(null);
      setReason("");
      navigate("/loan-rejected");
    } catch (error) {
      addToast(
        "error",
        "Could not reject",
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
      key: "appno",
      label: "Application No",
      width: "11%",
      render: (r) => r.app.application_number,
      text: (r) => r.app.application_number,
    },
    {
      key: "amt",
      label: "Amount",
      width: "9%",
      align: "right",
      render: (r) => money(r.app.requested_amount),
    },
    {
      key: "wks",
      label: "Weeks",
      width: "5%",
      align: "center",
      render: (r) => r.app.requested_weeks,
    },
    { key: "on", label: "Submitted", width: "8%", render: (r) => shortDate(r.app.created_at) },
    {
      key: "act",
      label: "Action",
      width: "8%",
      align: "center",
      render: (r) =>
        canReview ? (
          <div className="flex items-center justify-center gap-1">
            <ActionButton onClick={() => setReviewing(r)} title="Review and approve" tone="green">
              <Check className="h-3.5 w-3.5" />
            </ActionButton>
            <ActionButton
              onClick={() => {
                setRejecting(r);
                setReason("");
              }}
              title="Reject this application"
              tone="red"
            >
              <X className="h-3.5 w-3.5" />
            </ActionButton>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons title="Waiting for Approval" columns={columns} rows={filtered} />
        }
      >
        Waiting for Approval
      </MisPageTitle>

      {!canReview && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Approving a loan is a Branch Manager or Administrator action. These are the applications
          you submitted that are still waiting.
        </p>
      )}

      <MisFilters
        title="Waiting for Approval"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Application number"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.app.id}
        hasSearched={hasSearched}
        emptyMessage="No applications are waiting for approval."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.app.application_number} • ${money(r.app.requested_amount)}`}
      />

      {/* Review + approve */}
      <MisModal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title="Review Loan Application"
        width="max-w-2xl"
      >
        {reviewing && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{reviewing.client.full_name}</p>
              <p className="text-slate-500">
                {reviewing.app.application_number} • {reviewing.group_name} •{" "}
                {reviewing.branch_name}
              </p>
              <p className="mt-1 text-slate-600">Purpose: {reviewing.app.loan_purpose}</p>
            </div>

            {!preview ? (
              <p className="rounded border border-red-200 bg-red-50 p-3 font-bold text-red-700">
                This application's loan product no longer exists. Restore it before approving.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-slate-200 p-3 sm:grid-cols-3">
                  <Figure label="Principal" value={formatUGX(reviewing.app.requested_amount)} />
                  <Figure label="Interest" value={formatUGX(preview.calc.totalInterestAmount)} />
                  <Figure
                    label="Total payable"
                    value={formatUGX(preview.calc.totalAmountPayable)}
                  />
                  <Figure
                    label="Weekly instalment"
                    value={formatUGX(preview.calc.weeklyInstallment)}
                  />
                  <Figure
                    label="First repayment"
                    value={shortDate(preview.calc.firstRepaymentDate)}
                  />
                  <Figure label="Final due" value={shortDate(preview.calc.finalDueDate)} />
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Charges &amp; deductions
                  </p>
                  <dl className="space-y-1">
                    {preview.fees.map((f) => (
                      <div
                        key={f.label}
                        className={`flex justify-between ${f.emphasis ? "border-t border-amber-200 pt-1 font-bold" : ""}`}
                      >
                        <dt className="text-slate-600">{f.label}</dt>
                        <dd className="font-semibold text-slate-900">{formatUGX(f.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {preview.errors.length > 0 && (
                  <ul className="space-y-1 rounded border border-red-200 bg-red-50 p-3 font-bold text-red-700">
                    {preview.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => generateLoanApplicationPDF(reviewing.app)}
                className="inline-flex items-center justify-center gap-2 rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                <Printer className="h-4 w-4" />
                Print application
              </button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setReviewing(null)}
                  className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Close
                </button>
                {canReview && (
                  <button
                    type="button"
                    disabled={busy || !preview || preview.errors.length > 0}
                    onClick={approve}
                    className="rounded bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? "Approving…" : "Approve & generate schedule"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </MisModal>

      {/* Reject */}
      <MisModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject Loan Application"
        width="max-w-md"
      >
        {rejecting && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Rejecting{" "}
              <strong className="text-slate-900">{rejecting.app.application_number}</strong> for{" "}
              <strong className="text-slate-900">{rejecting.client.full_name}</strong>. It moves to
              the Loan Rejected List, where the officer can correct and resubmit it.
            </p>
            <div>
              <label className="form-label" htmlFor="why">
                Reason for rejection *
              </label>
              <textarea
                id="why"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Insufficient guarantor security, poor repayment history…"
                className="form-field resize-none"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={reject}
                className="rounded bg-chetu-red px-5 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Rejecting…" : "Confirm rejection"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{value}</p>
  </div>
);
