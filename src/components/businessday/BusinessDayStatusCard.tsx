import React from 'react';
import { Clock, Lock, LockOpen } from 'lucide-react';
import { formatUGX } from '../../lib/loanCalculations';
import { formatDuration, type DayStats } from '../../lib/businessDayStats';
import type { BusinessDayRow } from '../../context/BusinessDayContext';

const time = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const longDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const Fact: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={`mt-0.5 text-[13px] ${strong ? 'font-black text-slate-900' : 'font-semibold text-slate-800'}`}>
      {value}
    </dd>
  </div>
);

/**
 * The state of one branch-day, stated the way a banking system states it:
 * a named status, who is accountable, when it happened, and what it means.
 *
 * This card — not a toast — is the primary confirmation that opening or
 * closing worked.
 */
export const BusinessDayStatusCard: React.FC<{
  day?: BusinessDayRow;
  branchName: string;
  openedByName: string;
  closedByName?: string;
  stats: DayStats;
  /** Server clock, so the live duration ticks without trusting the device. */
  now: Date;
  businessDate: string;
  action?: React.ReactNode;
}> = ({ day, branchName, openedByName, closedByName, stats, now, businessDate, action }) => {
  const status = day?.status ?? 'NOT_OPENED';
  const isOpen = status === 'OPEN';
  const isClosed = status === 'CLOSED' || status === 'APPROVED' || status === 'LOCKED';

  const tone = isOpen
    ? { ring: 'border-emerald-300', head: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-800' }
    : isClosed
      ? { ring: 'border-red-300', head: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-800' }
      : { ring: 'border-slate-300', head: 'bg-slate-50', dot: 'bg-slate-400', text: 'text-slate-700' };

  const headline = isOpen ? 'BUSINESS DAY OPEN' : isClosed ? 'BUSINESS DAY CLOSED' : 'BUSINESS DAY NOT OPENED';
  const blurb = isOpen
    ? 'Business day is currently active and ready for operations.'
    : isClosed
      ? 'Business operations for this date have been completed.'
      : 'Today has not been opened yet. Loan Officers cannot record transactions.';

  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-xs ${tone.ring}`}>
      <header className={`flex flex-wrap items-start justify-between gap-4 px-5 py-4 ${tone.head}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${tone.text}`}>
            {isOpen ? <LockOpen className="h-5 w-5" /> : isClosed ? <Lock className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </span>
          <div>
            <p className={`flex items-center gap-2 text-[13px] font-black tracking-wide ${tone.text}`}>
              <span className="relative flex h-2.5 w-2.5">
                {isOpen && (
                  <span className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} opacity-70 motion-safe:animate-ping`} />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              </span>
              {headline}
            </p>
            <p className="mt-1 text-[13px] text-slate-700">{blurb}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-slate-600">{longDate(businessDate)} · {branchName}</p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-4">
        {isClosed ? (
          <>
            <Fact label="Opened at" value={time(day?.opened_at)} />
            <Fact label="Closed at" value={time(day?.closed_at)} />
            <Fact label="Duration" value={formatDuration(day?.opened_at, day?.closed_at)} />
            <Fact label="Closed by" value={closedByName || '—'} />
            <Fact label="Total transactions" value={stats.totalTransactions} strong />
            <Fact label="Total collections" value={formatUGX(stats.totalCollected)} strong />
            <Fact label="Total disbursements" value={formatUGX(stats.totalDisbursed)} strong />
            <Fact label="Officers submitted" value={`${stats.officersSubmitted} of ${stats.officersTotal}`} />
          </>
        ) : isOpen ? (
          <>
            <Fact label="Opened by" value={openedByName} />
            <Fact label="Opened at" value={time(day?.opened_at)} />
            <Fact label="Duration" value={formatDuration(day?.opened_at, now)} strong />
            <Fact label="Loan officers" value={stats.officersTotal} />
            <Fact label="Active" value={stats.officersActive} strong />
            <Fact label="Submitted" value={stats.officersSubmitted} />
            <Fact label="Pending approval" value={stats.officersPendingApproval} strong />
            <Fact label="Not started" value={stats.officersNotStarted} />
          </>
        ) : (
          <>
            <Fact label="Status" value="Not opened" />
            <Fact label="Loan officers" value={stats.officersTotal} />
            <Fact label="Branch" value={branchName} />
            <Fact label="Date" value={longDate(businessDate)} />
          </>
        )}
      </dl>

      {isClosed && (
        <p className="border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-[12px] font-semibold text-slate-700">
          All transaction entry is now locked for this business date.
        </p>
      )}
    </section>
  );
};
