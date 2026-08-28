import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Lock, X } from 'lucide-react';
import { formatUGX } from '../../lib/loanCalculations';
import type { DayStats } from '../../lib/businessDayStats';

const longDate = (v: string) =>
  new Date(v).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'amber' | 'plain' }> = ({ label, value, tone = 'plain' }) => (
  <div className="bg-white px-3 py-2">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-0.5 text-[13px] font-black ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
  </div>
);

/**
 * §4–§6 — closing runs in two deliberate steps: review the day's figures and
 * whatever is unresolved, then confirm the consequence. A manager should never
 * be able to lock a date with one click.
 */
export const CloseDayModal: React.FC<{
  open: boolean;
  branchName: string;
  businessDate: string;
  stats: DayStats;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, branchName, businessDate, stats, busy, onCancel, onConfirm }) => {
  const [step, setStep] = useState<'review' | 'confirm'>('review');
  const [acknowledged, setAcknowledged] = useState(false);

  if (!open) return null;

  const hasOutstanding = stats.outstanding.length > 0;
  const cancel = () => {
    setStep('review');
    setAcknowledged(false);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Close Business Day</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {branchName} · {longDate(businessDate)}
            </p>
          </div>
          <button type="button" onClick={cancel} aria-label="Cancel"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === 'review' ? (
          <>
            <div className="space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Today's operations</p>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 sm:grid-cols-3">
                  <Stat label="Loan officers" value={stats.officersTotal} />
                  <Stat label="Active" value={stats.officersActive} />
                  <Stat label="Days submitted" value={stats.officersSubmitted} />
                  <Stat label="Awaiting approval" value={stats.officersPendingApproval}
                    tone={stats.officersPendingApproval ? 'amber' : 'plain'} />
                  <Stat label="Loans disbursed" value={stats.loansDisbursed} />
                  <Stat label="Total disbursed" value={formatUGX(stats.totalDisbursed)} />
                  <Stat label="Repayments" value={stats.repaymentCount} />
                  <Stat label="Total collected" value={formatUGX(stats.totalCollected)} />
                  <Stat label="Savings deposits" value={formatUGX(stats.deposits)} />
                  <Stat label="Withdrawals" value={formatUGX(stats.withdrawals)} />
                  <Stat label="Total transactions" value={stats.totalTransactions} />
                </div>
              </div>

              {hasOutstanding && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3.5 py-3">
                  <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    Attention required
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-amber-900">
                    {stats.outstanding.map((o) => <li key={o}>{o}</li>)}
                  </ul>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-amber-200 pt-2.5 text-[12px] font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5 shrink-0 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span>I have reviewed these outstanding items and still want to close the business day.</span>
                  </label>
                </div>
              )}

              <p className="text-[12px] text-slate-600">
                Please review today's activities before closing the business day.
              </p>
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
              <button type="button" onClick={cancel}
                className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={hasOutstanding && !acknowledged}
                title={hasOutstanding && !acknowledged ? 'Acknowledge the outstanding items first' : undefined}
                className="rounded-lg bg-[#0B4394] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#093672] disabled:opacity-50"
              >
                Continue to Close
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="space-y-4 p-5">
              <div className="flex gap-2.5 rounded border border-red-300 bg-red-50 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chetu-red" />
                <div>
                  <p className="text-[13px] font-black text-red-900">
                    Are you sure you want to close this business day?
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-red-900">
                    Closing the business day will prevent further transactions for this business date. Loan Officers
                    will no longer be able to record new activities until the next business day is opened.
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-slate-100 rounded border border-slate-200 px-3.5 py-1">
                <div className="flex justify-between py-1.5">
                  <dt className="text-[12px] text-slate-500">Branch</dt>
                  <dd className="text-[13px] font-bold text-slate-900">{branchName}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-[12px] text-slate-500">Business date</dt>
                  <dd className="text-[13px] font-bold text-slate-900">{longDate(businessDate)}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-[12px] text-slate-500">Transactions locked</dt>
                  <dd className="text-[13px] font-bold text-slate-900">{stats.totalTransactions}</dd>
                </div>
              </dl>
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
              <button type="button" onClick={() => setStep('review')} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </button>
              <button type="button" onClick={onConfirm} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-chetu-red px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {busy ? 'Closing…' : 'Close Business Day'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};
