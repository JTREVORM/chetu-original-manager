import React from 'react';
import { Link } from '../../lib/router-compat';
import { CalendarCheck, Lock, LockOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useBusinessDayControl } from '../../context/BusinessDayContext';
import { computeDayStats, formatDuration } from '../../lib/businessDayStats';
import { formatUGX } from '../../lib/loanCalculations';

const longDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const shortTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

const Tile: React.FC<{ label: string; value: string | number; tone?: 'amber' | 'red' | 'plain' }> = ({
  label, value, tone = 'plain',
}) => (
  <div className="rounded border border-white/15 bg-white/10 px-3 py-2">
    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-200">{label}</p>
    <p className={`mt-0.5 text-lg font-black ${tone === 'amber' ? 'text-amber-300' : tone === 'red' ? 'text-red-300' : 'text-white'}`}>
      {value}
    </p>
  </div>
);

/**
 * §13 — the day's state, stated where it is unavoidable.
 *
 * An officer sees whether they may work and why not; a manager sees how many
 * officers are active, waiting on them, or sent back.
 */
export const BusinessDayBanner: React.FC = () => {
  const { user, role, isAdmin, isBranchManager } = useAuth();
  const { clients, loans, repayments, savingsTransactions } = useDatabase();
  const {
    now, serverDate, lockReason, officerDayStatus,
    businessDays, officerDays, accessRequests, staffNames, staff, loading,
  } = useBusinessDayControl();

  if (loading) return null;

  const isManagement = isAdmin || isBranchManager;
  const isOfficer = role === 'Loan Officer';
  if (!isManagement && !isOfficer) return null;

  const todaysOfficerDays = officerDays.filter((d) => d.business_date === serverDate);
  const myDay = todaysOfficerDays.find((d) => d.officer_id === user?.id);

  // The branch this person is accountable for; managers with several see the
  // first, and the control page is where they switch.
  const branchId = user?.branch_ids?.[0] || todaysOfficerDays[0]?.branch_id || '';
  const day =
    businessDays.find((d) => d.business_date === serverDate && d.branch_id === branchId) ||
    businessDays.find((d) => d.business_date === serverDate);

  const isDayOpen = day?.status === 'OPEN';
  const isDayClosed = day?.status === 'CLOSED' || day?.status === 'APPROVED' || day?.status === 'LOCKED';

  const stats = computeDayStats({
    branchId: day?.branch_id || branchId,
    date: serverDate,
    officerDays,
    staff,
    loans,
    repayments,
    savings: savingsTransactions,
    clients,
  });

  const pendingRequests = accessRequests.filter((r) => r.status === 'Pending').length;

  // §11 — what the officer is told, in their words, the moment it changes.
  const officerHeadline = isDayOpen
    ? 'Today’s operations are now open. You can begin recording your transactions.'
    : isDayClosed
      ? 'Today’s operations have been closed by the Branch Manager. Transaction entry is no longer available.'
      : lockReason;

  const tone = isDayOpen
    ? { bg: 'bg-[#0B4394]', dot: 'bg-emerald-400', label: 'OPEN' }
    : isDayClosed
      ? { bg: 'bg-[#7f1d1d]', dot: 'bg-red-400', label: 'CLOSED' }
      : { bg: 'bg-[#8a5a00]', dot: 'bg-amber-400', label: 'NOT OPENED' };

  return (
    <div className={`overflow-hidden rounded-lg text-white shadow-xs ${tone.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
            {isDayOpen ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-white/80">
              <span className="relative flex h-2.5 w-2.5">
                {isDayOpen && (
                  <span className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} opacity-70 motion-safe:animate-ping`} />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              </span>
              Business Day · {tone.label}
            </p>
            <h2 className="mt-1 text-lg font-bold">{longDate(serverDate)}</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-white/85">
              {isOfficer ? officerHeadline : isDayOpen || isDayClosed ? officerHeadline : lockReason}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/75">
              {isDayOpen && day?.opened_at && (
                <span>
                  Opened {shortTime(day.opened_at)} · <strong className="text-white">{formatDuration(day.opened_at, now)} active</strong>
                </span>
              )}
              {isDayClosed && day?.closed_at && <span>Closed at <strong className="text-white">{shortTime(day.closed_at)}</strong></span>}
              {day?.opened_by && <span>By <strong className="text-white">{staffNames[day.opened_by] || '—'}</strong></span>}
              {isOfficer && <span>My status: <strong className="text-white">{officerDayStatus.replace(/_/g, ' ')}</strong></span>}
              {isOfficer && myDay?.submitted_at && <span>Submitted {shortTime(myDay.submitted_at)}</span>}
            </div>
          </div>
        </div>

        <Link
          to="/business-day"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white/15 px-3.5 text-[12px] font-bold text-white hover:bg-white/25"
        >
          <CalendarCheck className="h-4 w-4" />
          {isManagement ? (isDayOpen ? 'Close Business Day' : 'Manage Business Day') : 'My working day'}
        </Link>
      </div>

      {isManagement && (
        <div className="grid grid-cols-2 gap-2 border-t border-white/15 bg-white/5 px-5 py-3 sm:grid-cols-5">
          {isDayClosed ? (
            <>
              <Tile label="Total transactions" value={stats.totalTransactions} />
              <Tile label="Total collections" value={formatUGX(stats.totalCollected)} />
              <Tile label="Total disbursements" value={formatUGX(stats.totalDisbursed)} />
              <Tile label="Deposits" value={formatUGX(stats.deposits)} />
              <Tile label="Withdrawals" value={formatUGX(stats.withdrawals)} />
            </>
          ) : (
            <>
              <Tile label="Loan officers" value={stats.officersTotal} />
              <Tile label="Active" value={stats.officersActive} />
              <Tile label="Submitted" value={stats.officersSubmitted} />
              <Tile label="Pending approval" value={stats.officersPendingApproval}
                tone={stats.officersPendingApproval ? 'amber' : 'plain'} />
              <Tile label="Access requests" value={pendingRequests} tone={pendingRequests ? 'amber' : 'plain'} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
