import React from "react";
import { AlertTriangle, Loader2, LockOpen, X } from "lucide-react";

const longDate = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <dt className="text-[12px] text-slate-500">{label}</dt>
    <dd className="text-[13px] font-bold text-slate-900">{value}</dd>
  </div>
);

/**
 * §1 — opening the day is a financial-control action, so it is confirmed
 * against a summary of exactly what is about to happen, not fired on click.
 */
export const OpenDayModal: React.FC<{
  open: boolean;
  branchName: string;
  businessDate: string;
  managerName: string;
  currentTime: string;
  currentStatus: string;
  reopening: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  open,
  branchName,
  businessDate,
  managerName,
  currentTime,
  currentStatus,
  reopening,
  busy,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {reopening ? "Reopen Business Day" : "Open Business Day"}
            </h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
              You are about to {reopening ? "reopen" : "open"} the business day for this branch.
              Once opened, authorized Loan Officers will be able to begin recording transactions.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          <dl className="divide-y divide-slate-100 rounded border border-slate-200 px-3.5 py-1">
            <Row label="Branch" value={branchName} />
            <Row label="Business Date" value={longDate(businessDate)} />
            <Row
              label="Current Status"
              value={<span className="text-slate-600">{currentStatus.replace(/_/g, " ")}</span>}
            />
            <Row label="Opened By" value={managerName} />
            <Row label="Current Time" value={<span className="tabular-nums">{currentTime}</span>} />
          </dl>

          <div className="flex gap-2.5 rounded border border-amber-300 bg-amber-50 px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[12px] leading-relaxed text-amber-900">
              Once the business day is opened, Loan Officers assigned to this branch will be able to
              perform their permitted transactions.
            </p>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B4394] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#093672] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            {busy ? "Opening…" : reopening ? "Reopen Business Day" : "Open Business Day"}
          </button>
        </footer>
      </div>
    </div>
  );
};
