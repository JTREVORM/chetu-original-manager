/**
 * Closing a branch.
 *
 * A branch is an operating unit with members, loans and money attached, so it
 * is closed to new business rather than deleted. The dialog states exactly what
 * the branch is still carrying before asking for a reason, because the counts
 * are usually the reason someone reconsiders.
 */
import React, { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import type { Branch } from "../../types/database.types";
import { branchMetrics, buildBranchSlices, emptySlice } from "../../lib/branchMetrics";
import { money } from "../mis/MisKit";

export const DeactivateBranchDialog: React.FC<{
  open: boolean;
  branch: Branch | null;
  onClose: () => void;
  onDone?: () => void;
}> = ({ open, branch, onClose, onDone }) => {
  const db = useDatabase();
  const { addToast } = useNotifications();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const metrics = useMemo(() => {
    if (!branch) return null;
    const slices = buildBranchSlices(
      {
        clients: db.clients,
        clientGroups: db.clientGroups,
        loans: db.loans,
        loanApplications: db.loanApplications,
        repayments: db.repayments,
        savingsAccounts: db.savingsAccounts,
        savingsTransactions: db.savingsTransactions,
        expenses: db.expenses,
        bankTransactions: db.bankTransactions,
      },
      [branch.id],
    );
    return branchMetrics(slices.get(branch.id) || emptySlice(branch.id), db.loanProducts);
  }, [branch, db]);

  if (!open || !branch || !metrics) return null;

  const blockers: string[] = [];
  if (metrics.loans.pending > 0)
    blockers.push(
      `${metrics.loans.pending} loan application${metrics.loans.pending === 1 ? "" : "s"} awaiting a decision`,
    );
  if (metrics.loans.approved > 0)
    blockers.push(
      `${metrics.loans.approved} approved loan${metrics.loans.approved === 1 ? "" : "s"} not yet disbursed`,
    );
  if (metrics.members.pending > 0)
    blockers.push(
      `${metrics.members.pending} member admission${metrics.members.pending === 1 ? "" : "s"} awaiting approval`,
    );

  const impact = [
    { label: "Members", value: money(metrics.members.total) },
    { label: "Active groups", value: money(metrics.groups.active) },
    { label: "Active loans", value: money(metrics.loans.active) },
    { label: "Outstanding portfolio", value: `UGX ${money(metrics.portfolio.outstanding)}` },
    { label: "Savings held", value: `UGX ${money(metrics.savings.balance)}` },
    { label: "Arrears", value: `UGX ${money(metrics.portfolio.arrears)}` },
  ];

  const handleDeactivate = async () => {
    setTouched(true);
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await db.deactivateBranch(branch.id, reason.trim());
      addToast(
        "success",
        "Branch deactivated",
        `${branch.branch_name} is closed to new operations.`,
      );
      setReason("");
      setTouched(false);
      onDone?.();
      onClose();
    } catch (error) {
      addToast(
        "error",
        "Could not deactivate",
        error instanceof Error ? error.message : "The branch was not changed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">Deactivate {branch.branch_name}?</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{branch.branch_code}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="text-[12px] leading-relaxed text-slate-600">This branch currently holds:</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {impact.map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-[13px] font-bold text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>

          {blockers.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[12px] font-bold text-amber-900">Work is still in progress here</p>
              <ul className="mt-1 list-inside list-disc text-[12px] leading-relaxed text-amber-900">
                {blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-amber-800">
                Deactivating now leaves these pending. Settle them first if they should not be
                stranded.
              </p>
            </div>
          )}

          <p className="mt-4 text-[12px] leading-relaxed text-slate-600">
            Deactivating prevents new operations from being processed under this branch. Every
            existing record — members, loans, savings and receipts — stays exactly as it is and
            remains available in reports.
          </p>

          <div className="mt-4">
            <label htmlFor="deactivation_reason" className="form-label">
              Reason for deactivation <span className="text-chetu-red">*</span>
            </label>
            <textarea
              id="deactivation_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Operations consolidated into Jinja Central from 01 September 2026."
              className="form-field resize-none"
            />
            {touched && !reason.trim() && (
              <p className="mt-1 text-[11px] font-semibold text-chetu-red">
                A reason is required to deactivate a branch.
              </p>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-[13px] font-bold text-slate-600 hover:bg-slate-100 sm:h-9"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={submitting || !reason.trim()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-chetu-red px-5 text-[13px] font-bold text-white hover:bg-chetu-darkred disabled:opacity-50 sm:h-9"
          >
            {submitting ? "Deactivating…" : "Deactivate Branch"}
          </button>
        </footer>
      </div>
    </div>
  );
};
