/**
 * A member's complete loan and repayment history.
 *
 * Opened from the History action on the Member List and its sibling screens.
 * It used to be a single line per loan — number, status, principal, payable,
 * outstanding — with no schedule, no receipts, and no way to see which week a
 * member had missed. An officer standing in front of a borrower could not
 * answer "what have I paid and what do I still owe?" from it.
 *
 * Everything shown here is read from what the database already holds. No amount
 * is recomputed from the current fee schedule: charges come back through
 * `storedLoanFees`, so a later change to the standard fees cannot restate a
 * historical loan. Instalment state is derived once, in `summariseSchedule`,
 * the same derivation the collection screens use.
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { money, shortDate } from "./MisKit";
import { ScrollArea } from "../common/ScrollArea";
import { storedLoanFees } from "../../lib/fees";
import { CLOSED_LOAN_STATUSES, type Loan, type LoanRepayment } from "../../types/database.types";
import {
  summariseSchedule,
  todayISODate,
  type DerivedInstallment,
  type DerivedInstallmentStatus,
} from "../../lib/scheduleView";

/** Colour per instalment state. Paid reads calm, arrears read loud. */
const INSTALLMENT_TONE: Record<DerivedInstallmentStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-800",
  "Partially Paid": "bg-amber-100 text-amber-800",
  Overdue: "bg-red-100 text-red-700",
  Due: "bg-[#0B4394] text-white",
  Pending: "bg-slate-100 text-slate-600",
};

const LOAN_TONE: Record<string, string> = {
  Active: "bg-blue-50 text-[#0B4394]",
  "Partially Paid": "bg-blue-50 text-[#0B4394]",
  Overdue: "bg-amber-100 text-amber-800",
  Defaulted: "bg-red-100 text-red-700",
  "Fully Paid": "bg-emerald-100 text-emerald-800",
  Settled: "bg-emerald-100 text-emerald-800",
  "Written Off": "bg-slate-200 text-slate-700",
  Pending: "bg-slate-100 text-slate-600",
};

const Pill: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${tone}`}>
    {children}
  </span>
);

/** A label above its value. The dense pairing the MIS screens use throughout. */
const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">{label}</p>
    <p className="truncate text-[12px] text-slate-900">{value}</p>
  </div>
);

/** One counter in the repayment-progress strip. */
const Counter: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = "text-slate-900",
}) => (
  <div className="rounded border border-slate-200 px-2 py-1.5 text-center">
    <p className={`text-[15px] leading-tight font-bold ${tone}`}>{value}</p>
    <p className="text-[9px] font-bold tracking-wide text-slate-500 uppercase">{label}</p>
  </div>
);

/**
 * The instalment table.
 *
 * Dense rows on desktop, stacked label/value cards on mobile — the same split
 * `MisTable` makes, done locally because this table lives inside a modal and
 * carries its own per-row receipt expansion.
 *
 * Missed instalments are never hidden and never re-dated: a week that came and
 * went unpaid keeps its original due date and shows as Overdue.
 */
const InstallmentTable: React.FC<{
  installments: DerivedInstallment[];
  receiptsByScheduleId: Map<string, LoanRepayment[]>;
  officerName: (id?: string | null) => string;
}> = ({ installments, receiptsByScheduleId, officerName }) => {
  if (installments.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 py-4 text-center text-[11px] text-slate-400">
        No instalment schedule recorded for this loan.
      </p>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:block">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#0B4394] text-left text-white">
              <th className="px-2 py-1.5 font-bold">#</th>
              <th className="px-2 py-1.5 font-bold">Due Date</th>
              <th className="px-2 py-1.5 text-right font-bold">Expected</th>
              <th className="px-2 py-1.5 text-right font-bold">Paid</th>
              <th className="px-2 py-1.5 text-right font-bold">Balance</th>
              <th className="px-2 py-1.5 font-bold">Status</th>
              <th className="px-2 py-1.5 font-bold">Receipts</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((i) => {
              const receipts = i.row.id ? receiptsByScheduleId.get(i.row.id) || [] : [];
              return (
                <tr
                  key={`${i.weekNumber}-${i.dueDate}`}
                  className={`border-b border-slate-100 ${i.isArrears ? "bg-red-50/60" : ""}`}
                >
                  <td className="px-2 py-1.5 font-bold text-slate-700">{i.weekNumber}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{shortDate(i.dueDate)}</td>
                  <td className="px-2 py-1.5 text-right">{money(i.expected)}</td>
                  <td className="px-2 py-1.5 text-right">{money(i.paid)}</td>
                  <td
                    className={`px-2 py-1.5 text-right ${i.balance > 0 ? "font-bold text-slate-900" : "text-slate-400"}`}
                  >
                    {money(i.balance)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Pill tone={INSTALLMENT_TONE[i.status]}>{i.status}</Pill>
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-slate-600">
                    {receipts.length === 0
                      ? "—"
                      : receipts.map((r) => (
                          <span key={r.id} className="block whitespace-nowrap">
                            {r.receipt_number} · {shortDate(r.payment_date)} ·{" "}
                            {money(r.amount_paid)} · {r.payment_method}
                            {r.recorded_by ? ` · ${officerName(r.recorded_by)}` : ""}
                          </span>
                        ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile — the pale-blue Label : Value cards used across the MIS */}
      <div className="space-y-2 sm:hidden">
        {installments.map((i) => {
          const receipts = i.row.id ? receiptsByScheduleId.get(i.row.id) || [] : [];
          return (
            <div
              key={`${i.weekNumber}-${i.dueDate}`}
              className={`rounded-lg px-3 py-2 ${i.isArrears ? "bg-red-50" : "bg-[#eaf1f8]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-900">
                  Week {i.weekNumber} · {shortDate(i.dueDate)}
                </span>
                <Pill tone={INSTALLMENT_TONE[i.status]}>{i.status}</Pill>
              </div>
              <p className="mt-1 text-[12px] text-slate-900">
                <span className="font-bold">Expected :</span> {money(i.expected)}
                <span className="ml-2 font-bold">Paid :</span> {money(i.paid)}
                <span className="ml-2 font-bold">Balance :</span> {money(i.balance)}
              </p>
              {receipts.map((r) => (
                <p key={r.id} className="mt-0.5 text-[11px] text-slate-600">
                  {r.receipt_number} · {shortDate(r.payment_date)} · {money(r.amount_paid)} ·{" "}
                  {r.payment_method}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

/** One loan: summary, progress counters, instalment schedule, unlinked receipts. */
const LoanPanel: React.FC<{
  loan: Loan;
  repayments: LoanRepayment[];
  productName: string;
  applicationDate?: string | null;
  officerName: (id?: string | null) => string;
  defaultOpen: boolean;
}> = ({ loan, repayments, productName, applicationDate, officerName, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const today = todayISODate();
  const summary = useMemo(() => summariseSchedule(loan.schedule, today), [loan.schedule, today]);
  const fees = storedLoanFees(loan);

  // Receipts grouped by the instalment they were applied to. `schedule_id` was
  // never populated before this release, so historical receipts have none —
  // they are listed separately rather than being attributed to a guess.
  const receiptsByScheduleId = useMemo(() => {
    const map = new Map<string, LoanRepayment[]>();
    for (const r of repayments) {
      if (!r.schedule_id) continue;
      const list = map.get(r.schedule_id);
      if (list) list.push(r);
      else map.set(r.schedule_id, [r]);
    }
    return map;
  }, [repayments]);

  const unlinkedReceipts = repayments.filter((r) => !r.schedule_id);

  // Paid is the sum of the receipts actually recorded against this loan —
  // the financial record — rather than the schedule's `paid_amount`, which is
  // bookkeeping laid over it.
  const totalPaid = repayments.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const isClosed = CLOSED_LOAN_STATUSES.includes(loan.status);

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg bg-slate-50 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          )}
          <span className="truncate text-[12px] font-bold text-slate-900">{loan.loan_number}</span>
          <span className="hidden truncate text-[11px] text-slate-500 sm:inline">
            {productName} · Cycle {loan.cycle_number || 1}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {summary.arrearsCount > 0 && !isClosed && (
            <Pill tone="bg-red-100 text-red-700">
              {summary.arrearsCount} overdue · {money(summary.arrearsAmount)}
            </Pill>
          )}
          <Pill tone={LOAN_TONE[loan.status] || "bg-slate-100 text-slate-600"}>{loan.status}</Pill>
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 py-3">
          {/* Where the loan stands right now. Pinned above the detail so an
              officer at a meeting reads the live position first. */}
          {!isClosed && (
            <div className="rounded-lg bg-[#eaf1f8] px-3 py-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Detail label="Outstanding" value={money(loan.outstanding_balance)} />
                <Detail
                  label="Next Due"
                  value={
                    summary.nextUnpaid
                      ? `${shortDate(summary.nextUnpaid.dueDate)} · ${money(summary.nextUnpaid.balance)}`
                      : "—"
                  }
                />
                <Detail
                  label="Overdue"
                  value={
                    summary.arrearsCount > 0
                      ? `${summary.arrearsCount} wk · ${money(summary.arrearsAmount)}`
                      : "None"
                  }
                />
                <Detail
                  label="Remaining"
                  value={`${summary.expectedCount - summary.paidCount} of ${summary.expectedCount}`}
                />
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[#0B4394]"
                  style={{
                    width: `${Math.min(100, Math.max(0, Number(loan.completion_percentage || 0)))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Loan summary */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
            <Detail label="Product" value={productName} />
            <Detail label="Principal" value={money(loan.principal_amount)} />
            <Detail label="Applied" value={shortDate(applicationDate)} />
            <Detail label="Approved" value={shortDate(loan.created_at)} />
            <Detail label="Disbursed" value={shortDate(loan.disbursed_at)} />
            <Detail label="Term" value={`${loan.loan_period_weeks} weeks`} />
            <Detail label="Frequency" value="Weekly" />
            <Detail label="Instalment" value={money(loan.weekly_installment)} />
            <Detail
              label="Interest"
              value={`${money(loan.total_interest_amount)} (${loan.interest_rate}% ${loan.interest_type})`}
            />
            <Detail label="Total Payable" value={money(loan.total_amount_payable)} />
            <Detail label="Total Paid" value={money(totalPaid)} />
            <Detail label="Outstanding" value={money(loan.outstanding_balance)} />
            <Detail label="Processing Fee" value={money(fees.processingFee)} />
            <Detail label="CRB Fee" value={money(fees.crbFee)} />
            <Detail label="Security Deposit" value={money(fees.securityDeposit)} />
            <Detail label="Net Disbursed" value={money(fees.netDisbursed)} />
            <Detail label="First Repayment" value={shortDate(loan.first_repayment_date)} />
            <Detail label="Final Due" value={shortDate(loan.final_due_date)} />
            {loan.settled_at && <Detail label="Settled" value={shortDate(loan.settled_at)} />}
            {loan.writeoff_at && (
              <Detail
                label="Written Off"
                value={`${shortDate(loan.writeoff_at)} · ${money(loan.writeoff_amount)}`}
              />
            )}
          </div>

          {/* Repayment progress */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-700">Repayment progress</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              <Counter label="Expected" value={summary.expectedCount} />
              <Counter label="Paid" value={summary.paidCount} tone="text-emerald-700" />
              <Counter label="Partial" value={summary.partialCount} tone="text-amber-700" />
              <Counter label="Overdue" value={summary.overdueCount} tone="text-red-700" />
              <Counter label="Due" value={summary.dueCount} tone="text-[#0B4394]" />
              <Counter label="Pending" value={summary.pendingCount} />
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <Counter label="Total Expected" value={money(summary.totalExpected)} />
              <Counter
                label="Total Paid"
                value={money(summary.totalPaid)}
                tone="text-emerald-700"
              />
              <Counter
                label="Total Outstanding"
                value={money(summary.totalOutstanding)}
                tone={summary.totalOutstanding > 0 ? "text-red-700" : "text-slate-900"}
              />
            </div>
          </div>

          {/* Detailed schedule */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-700">Repayment schedule</p>
            <InstallmentTable
              installments={summary.installments}
              receiptsByScheduleId={receiptsByScheduleId}
              officerName={officerName}
            />
          </div>

          {/* Receipts that predate instalment linking, or that could not be
              attributed to one. Shown in full rather than dropped: they are
              real money the member paid. */}
          {unlinkedReceipts.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold text-slate-700">
                Payments not linked to an instalment ({unlinkedReceipts.length})
              </p>
              <div className="space-y-1">
                {unlinkedReceipts.map((r) => (
                  <p
                    key={r.id}
                    className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700"
                  >
                    <span className="font-bold">{r.receipt_number}</span> ·{" "}
                    {shortDate(r.payment_date)} · {money(r.amount_paid)} · {r.payment_method}
                    {r.collection_type ? ` · ${r.collection_type}` : ""}
                    {r.recorded_by ? ` · ${officerName(r.recorded_by)}` : ""}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface LoanHistoryProps {
  memberName: string;
  loans: Loan[];
  repayments: LoanRepayment[];
  productName: (productId: string) => string;
  applicationDate: (applicationId?: string | null) => string | null | undefined;
  officerName: (id?: string | null) => string;
}

/**
 * The whole history for one member.
 *
 * Loans are listed newest first and never merged: each keeps its own schedule
 * and its own receipts, so a member on their third cycle cannot have last
 * year's payments counted against this year's loan. The open loan is expanded
 * on arrival; closed cycles stay collapsed until asked for.
 */
export const LoanHistory: React.FC<LoanHistoryProps> = ({
  memberName,
  loans,
  repayments,
  productName,
  applicationDate,
  officerName,
}) => {
  const ordered = useMemo(
    () =>
      [...loans].sort((a, b) => {
        const aOpen = !CLOSED_LOAN_STATUSES.includes(a.status);
        const bOpen = !CLOSED_LOAN_STATUSES.includes(b.status);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return (b.created_at || "") < (a.created_at || "") ? -1 : 1;
      }),
    [loans],
  );

  // Receipts split by loan up front, so no panel can see another loan's money.
  const repaymentsByLoan = useMemo(() => {
    const map = new Map<string, LoanRepayment[]>();
    for (const r of repayments) {
      const list = map.get(r.loan_id);
      if (list) list.push(r);
      else map.set(r.loan_id, [r]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1));
    }
    return map;
  }, [repayments]);

  if (ordered.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">{memberName} has no loan history.</p>
    );
  }

  const openCount = ordered.filter((l) => !CLOSED_LOAN_STATUSES.includes(l.status)).length;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        {ordered.length} loan{ordered.length === 1 ? "" : "s"} · {openCount} open
      </p>
      <ScrollArea className="max-h-[70vh] pr-1">
        <div className="space-y-2">
          {ordered.map((loan, index) => (
            <LoanPanel
              key={loan.id}
              loan={loan}
              repayments={repaymentsByLoan.get(loan.id) || []}
              productName={productName(loan.product_id)}
              applicationDate={applicationDate(loan.application_id)}
              officerName={officerName}
              // The current cycle opens; older ones wait to be asked for.
              defaultOpen={index === 0 && !CLOSED_LOAN_STATUSES.includes(loan.status)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
