import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  LockOpen,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { useBusinessDayControl, type OfficerDayRow } from '../context/BusinessDayContext';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/notify';
import { formatUGX } from '../lib/loanCalculations';
import { TableScroll } from '../components/common/ScrollArea';
import { buildTimeline, computeDayStats } from '../lib/businessDayStats';
import { BusinessDayStatusCard } from '../components/businessday/BusinessDayStatusCard';
import { BusinessDayTimeline } from '../components/businessday/BusinessDayTimeline';
import { OpenDayModal } from '../components/businessday/OpenDayModal';
import { CloseDayModal } from '../components/businessday/CloseDayModal';

const shortDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const shortTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

/** Status pill shared by both the business day and each officer's day. */
const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const tone: Record<string, string> = {
    OPEN: 'bg-emerald-100 text-emerald-800',
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    SPECIAL_ACCESS: 'bg-amber-100 text-amber-800',
    SUBMITTED: 'bg-amber-100 text-amber-800',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
    REJECTED: 'bg-red-100 text-red-800',
    CLOSED: 'bg-slate-200 text-slate-700',
    LOCKED: 'bg-slate-200 text-slate-700',
    NOT_OPENED: 'bg-slate-200 text-slate-700',
    Pending: 'bg-amber-100 text-amber-800',
    Approved: 'bg-emerald-100 text-emerald-800',
    Rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tone[status] || 'bg-slate-200 text-slate-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

/** A compact three-column list used throughout the reviewer's drill-down. */
const ReviewList: React.FC<{ title: string; rows: (string | number)[][] }> = ({ title, rows }) => (
  <div className="rounded border border-slate-200">
    <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      {title}
    </p>
    {rows.length === 0 ? (
      <p className="px-3 py-3 text-[12px] text-slate-400">Nothing recorded.</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {rows.slice(0, 25).map((r, i) => (
          <li key={i} className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[12px]">
            <span className="truncate font-semibold text-slate-900">{r[0]}</span>
            <span className="truncate text-slate-700">{r[1]}</span>
            <span className="truncate text-right text-slate-600">{r[2]}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const BusinessDayControl: React.FC = () => {
  const { user, role, isAdmin, isBranchManager, isAuditor } = useAuth();
  const { branches, clients, loans, repayments, savingsTransactions, logAudit } = useDatabase();
  const { addToast } = useNotifications();
  const {
    now, serverDate, isWeekend, canTransact, lockReason,
    businessDayStatus, officerDayStatus, businessDays, officerDays, accessRequests,
    audit, staffNames, staff, refresh,
  } = useBusinessDayControl();

  const isManagement = isAdmin || isBranchManager;
  const isOfficer = role === 'Loan Officer';

  const [busy, setBusy] = useState('');
  const [openBranch, setOpenBranch] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [rejectFor, setRejectFor] = useState<OfficerDayRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [reviewing, setReviewing] = useState<OfficerDayRow | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);

  const today = serverDate;
  const todaysDays = useMemo(() => businessDays.filter((d) => d.business_date === today), [businessDays, today]);
  const todaysOfficerDays = useMemo(() => officerDays.filter((d) => d.business_date === today), [officerDays, today]);
  const myDay = useMemo(
    () => todaysOfficerDays.find((d) => d.officer_id === user?.id),
    [todaysOfficerDays, user?.id],
  );
  const pendingRequests = accessRequests.filter((r) => r.status === 'Pending');
  const awaitingApproval = todaysOfficerDays.filter((d) => d.status === 'SUBMITTED' || d.status === 'PENDING_APPROVAL');

  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.branch_name || '—';

  /** Totals for the officer's own day, from what they actually recorded today. */
  const mySummary = useMemo(() => {
    const mine = (officerId?: string) => officerId === user?.id;
    const onToday = (v?: string | null) => (v || '').split('T')[0] === today;
    const todaysRepayments = repayments.filter((r) => onToday(r.payment_date) || onToday(r.created_at));
    const todaysSavings = savingsTransactions.filter((t) => onToday(t.created_at));
    return {
      clients: clients.filter((c) => onToday(c.date_registered) && mine(c.loan_officer_id)).length,
      loans: loans.filter((l) => onToday(l.created_at)).length,
      disbursed: loans.filter((l) => onToday(l.disbursed_at)).length,
      repayments: todaysRepayments.length,
      collected: todaysRepayments.reduce((s, r) => s + Number(r.amount_paid || 0), 0),
      deposits: todaysSavings.filter((t) => t.transaction_type !== 'Withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0),
      withdrawals: todaysSavings.filter((t) => t.transaction_type === 'Withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0),
    };
  }, [clients, loans, repayments, savingsTransactions, today, user?.id]);

  const officerName = (id?: string | null) => (id && staffNames[id]) || '—';

  /**
   * The branch the manager is acting on. After their own attachment, prefer a
   * branch that already has a day today — an Administrator has no branch_ids,
   * and landing them on an arbitrary branch made an open day read as "not
   * opened" purely because the lists loaded in a different order.
   */
  const selectedBranchId =
    openBranch || user?.branch_ids?.[0] || todaysDays[0]?.branch_id || branches[0]?.id || '';
  const selectedDay = todaysDays.find((d) => d.branch_id === selectedBranchId);

  const selectedStats = useMemo(
    () =>
      computeDayStats({
        branchId: selectedBranchId,
        date: today,
        officerDays,
        staff,
        loans,
        repayments,
        savings: savingsTransactions,
        clients,
      }),
    [selectedBranchId, today, officerDays, staff, loans, repayments, savingsTransactions, clients],
  );

  const timeline = useMemo(
    () => buildTimeline(selectedDay, officerDays, audit, staffNames),
    [selectedDay, officerDays, audit, staffNames],
  );

  /**
   * §5 — work that would be stranded if the day were closed now. Each item is
   * something the officer still owns; the day can still be submitted, but they
   * are told first rather than discovering it after they are locked out.
   */
  const pending = useMemo(() => {
    const mineOnly = <T extends { loan_officer_id?: string | null }>(rows: T[]) =>
      rows.filter((r) => !r.loan_officer_id || r.loan_officer_id === user?.id);
    const items: string[] = [];

    const unapprovedClients = mineOnly(clients.filter((c) => c.approval_status === 'Pending'));
    if (unapprovedClients.length) items.push(`${unapprovedClients.length} member admission(s) still awaiting approval`);

    // Approved but never paid out: the borrower is still waiting on this officer.
    const undisbursed = loans.filter((l) => l.status === 'Pending' && !!l.approved_by);
    if (undisbursed.length) items.push(`${undisbursed.length} approved loan(s) not yet disbursed`);

    return items;
  }, [clients, loans, user?.id]);

  /** §6 — everything one officer recorded on their day, for the reviewer. */
  const reviewData = useMemo(() => {
    if (!reviewing) return null;
    const day = reviewing.business_date;
    const on = (v?: string | null) => (v || '').split('T')[0] === day;
    return {
      clients: clients.filter((c) => on(c.date_registered) && c.loan_officer_id === reviewing.officer_id),
      loans: loans.filter((l) => on(l.created_at) || on(l.disbursed_at)),
      repayments: repayments.filter((r) => on(r.payment_date) || on(r.created_at)),
      savings: savingsTransactions.filter((t) => on(t.created_at)),
      audit: audit.filter((a) => a.subject_id === reviewing.officer_id || a.business_date === day),
    };
  }, [reviewing, clients, loans, repayments, savingsTransactions, audit]);

  const run = async (key: string, fn: () => Promise<void>, failMsg: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await refresh();
    } catch (err) {
      addToast('error', 'Action failed', err instanceof Error ? err.message : failMsg);
    } finally {
      setBusy('');
    }
  };

  // ---------- Manager: open the day ----------
  const openDay = () =>
    run('open', async () => {
      const branchId = selectedBranchId;
      if (!branchId) throw new Error('Select a branch first.');
      setOpenModal(false);
      // Read the row fresh rather than trusting the cached list: pressing the
      // button twice must not announce a second opening, and must not fan a
      // "you may now begin working" alert out to every member of staff again.
      const { data: existing, error: readError } = await supabase
        .from('business_days')
        .select('id, status')
        .eq('branch_id', branchId)
        .eq('business_date', today)
        .maybeSingle();
      if (readError) throw readError;

      if (existing?.status === 'OPEN') {
        // Belt and braces: the button is hidden once the day is open, so this
        // only fires on a stale tab. Say so rather than re-announcing.
        addToast(
          'info',
          'Business day already active',
          `${branchName(branchId)} is already open for ${shortDate(today)}.`,
        );
        return;
      }

      // A day that exists but was closed is being reopened — a different event
      // from opening the first time, and worth saying so.
      const reopening = !!existing;

      const { error } = await supabase.from('business_days').upsert(
        {
          branch_id: branchId,
          business_date: today,
          status: 'OPEN',
          // Clear the previous closure, otherwise the status card and timeline
          // keep showing a "closed at" for a day that is open again. The audit
          // trail keeps the full history, which is where it belongs.
          closed_at: null,
          closed_by: null,
        },
        { onConflict: 'branch_id,business_date' },
      );
      if (error) throw error;

      await logAudit(
        reopening ? 'Business Day Reopened' : 'Business Day Opened',
        'Business Day',
        `${reopening ? 'Reopened' : 'Opened'} ${today} for ${branchName(branchId)}.`,
        branchId,
      );
      await sendNotification({
        title: reopening ? 'Business day reopened' : 'Business day opened',
        message: `Business Day ${shortDate(today)} has been ${reopening ? 'reopened' : 'opened'} for ${branchName(branchId)}. You may now begin working.`,
        type: 'System',
        audience: 'all-staff',
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast(
        'success',
        reopening ? 'Business day reopened' : 'Business day opened',
        `${branchName(branchId)} is now open for ${shortDate(today)}.`,
      );
    }, 'Could not open the business day.');

  const closeDay = (branchId: string, id: string) =>
    run(`close-${id}`, async () => {
      setCloseModal(false);
      const { error } = await supabase.from('business_days').update({ status: 'CLOSED' }).eq('id', id);
      if (error) throw error;
      await logAudit('Business Day Closed', 'Business Day', `Closed ${today} for ${branchName(branchId)}.`, branchId);
      await sendNotification({
        title: 'Business day closed',
        message: `Business Day ${shortDate(today)} has been closed for ${branchName(branchId)}.`,
        type: 'System',
        audience: 'all-staff',
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast('info', 'Business day closed', `${branchName(branchId)} is closed.`);
    }, 'Could not close the business day.');

  // ---------- Officer: start / submit my day ----------
  const startMyDay = () =>
    run('start', async () => {
      const day = todaysDays.find((d) => d.status === 'OPEN');
      if (!day) throw new Error('No open business day for your branch yet.');
      const { error } = await supabase.from('officer_days').upsert(
        {
          business_day_id: day.id,
          officer_id: user!.id,
          branch_id: day.branch_id,
          business_date: today,
          status: 'ACTIVE',
        },
        { onConflict: 'business_day_id,officer_id' },
      );
      if (error) throw error;
      await logAudit('Working Day Started', 'Business Day', `${user?.full_name} started work on ${today}.`);
      addToast('success', 'You are active', 'You can now record transactions for today.');
    }, 'Could not start your working day.');

  const submitMyDay = () =>
    run('submit', async () => {
      if (!myDay) throw new Error('You have no working day to submit.');
      const { error } = await supabase
        .from('officer_days')
        .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString(), summary: mySummary })
        .eq('id', myDay.id);
      if (error) throw error;

      await logAudit('Working Day Submitted', 'Business Day', `${user?.full_name} closed their day for ${today}.`, myDay.id);
      await sendNotification({
        title: 'Working day closed',
        message: `${user?.full_name} has closed their working day and is awaiting approval.`,
        type: 'Alert',
        audience: 'managers',
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast('success', 'Day submitted', 'Your day is now with your Branch Manager for approval.');
    }, 'Could not submit your day.');

  // ---------- Manager: approve / reject an officer's day ----------
  const approveDay = (d: OfficerDayRow) =>
    run(`approve-${d.id}`, async () => {
      const { error } = await supabase
        .from('officer_days')
        .update({ status: 'APPROVED', approved_by: user!.id, approved_at: new Date().toISOString() })
        .eq('id', d.id);
      if (error) throw error;
      await logAudit('Working Day Approved', 'Business Day', `Approved ${d.business_date} for officer ${d.officer_id}.`, d.id);
      await sendNotification({
        title: 'Working day approved',
        message: `Your working day for ${shortDate(d.business_date)} has been approved.`,
        type: 'System',
        recipientIds: [d.officer_id],
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast('success', 'Day approved', 'The officer has been notified.');
    }, 'Could not approve the day.');

  const rejectDay = () =>
    run('reject', async () => {
      if (!rejectFor) return;
      if (!rejectReason.trim()) throw new Error('Give a reason so the officer knows what to correct.');
      const { error } = await supabase
        .from('officer_days')
        .update({
          status: 'REJECTED',
          rejected_by: user!.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectReason.trim(),
        })
        .eq('id', rejectFor.id);
      if (error) throw error;
      await logAudit('Working Day Rejected', 'Business Day', `Sent back ${rejectFor.business_date}: ${rejectReason}`, rejectFor.id);
      await sendNotification({
        title: 'Working day needs corrections',
        message: `Your working day requires corrections. Reason: ${rejectReason.trim()}`,
        type: 'Alert',
        recipientIds: [rejectFor.officer_id],
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast('info', 'Sent back', 'The officer can now make corrections.');
      setRejectFor(null);
      setRejectReason('');
    }, 'Could not send the day back.');

  // ---------- Officer: request special access ----------
  const requestAccess = () =>
    run('request', async () => {
      if (!requestReason.trim()) throw new Error('Explain why you need access.');
      const { error } = await supabase.from('access_requests').insert({
        requester_id: user!.id,
        branch_id: user?.branch_ids?.[0] || null,
        business_date: today,
        reason: requestReason.trim(),
      });
      if (error) throw error;
      await sendNotification({
        title: 'Special access requested',
        message: `${user?.full_name} is asking to work on ${shortDate(today)}. Reason: ${requestReason.trim()}`,
        type: 'Alert',
        audience: 'managers',
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      setRequestReason('');
      addToast('success', 'Request sent', 'Your Branch Manager has been notified.');
    }, 'Could not send the request.');

  const decideRequest = (id: string, requesterId: string, approve: boolean) =>
    run(`decide-${id}`, async () => {
      const { error } = await supabase
        .from('access_requests')
        .update({ status: approve ? 'Approved' : 'Rejected' })
        .eq('id', id);
      if (error) throw error;
      await logAudit(
        approve ? 'Special Access Approved' : 'Special Access Rejected',
        'Business Day',
        `${approve ? 'Approved' : 'Rejected'} access request ${id}.`,
        id,
      );
      await sendNotification({
        title: approve ? 'Special access approved' : 'Special access rejected',
        message: approve
          ? 'Your account has been temporarily opened. You may now perform system activities.'
          : 'Your special access request has been rejected.',
        type: approve ? 'System' : 'Alert',
        recipientIds: [requesterId],
        link_url: '/business-day',
        excludeId: user?.id,
        includeActor: true,
      });
      addToast(approve ? 'success' : 'info', approve ? 'Access granted' : 'Request rejected', 'The officer has been notified.');
    }, 'Could not record the decision.');

  return (
    <div className="space-y-5 pb-12">
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <CalendarCheck className="h-3.5 w-3.5 text-amber-400" />
          Business Day Control
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Business Day</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Work is only permitted inside a business day a manager has opened. All times below are the server's,
          not this device's.
        </p>
      </div>

      {/* ---------- Status card ---------- */}
      <section
        className={`rounded-lg border p-5 shadow-xs ${
          canTransact ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-300 bg-amber-50/70'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                canTransact ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {canTransact ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {canTransact ? 'System Open — you may record transactions' : 'System Locked'}
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-700">{lockReason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-slate-600">
                <span>Date: <strong className="text-slate-900">{shortDate(today)}</strong></span>
                <span>Server time: <strong className="tabular-nums text-slate-900">{now.toLocaleTimeString('en-GB')}</strong></span>
                <span>Business day: <StatusPill status={businessDayStatus} /></span>
                {isOfficer && <span>My day: <StatusPill status={officerDayStatus} /></span>}
                {isWeekend && <span className="font-bold text-amber-700">Weekend</span>}
              </div>
            </div>
          </div>

          {/* Officer actions */}
          {isOfficer && (
            <div className="flex flex-wrap gap-2">
              {officerDayStatus === 'LOCKED' && businessDayStatus === 'OPEN' && (
                <button onClick={startMyDay} disabled={!!busy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B4394] px-4 text-[13px] font-semibold text-white hover:bg-[#093672] disabled:opacity-60">
                  {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                  Start my day
                </button>
              )}
              {(officerDayStatus === 'ACTIVE' || officerDayStatus === 'REJECTED' || officerDayStatus === 'SPECIAL_ACCESS') && (
                <button onClick={() => setConfirmClose(true)} disabled={!!busy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-[13px] font-bold text-blue-950 hover:bg-amber-400 disabled:opacity-60">
                  {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Close my day
                </button>
              )}
            </div>
          )}
        </div>

        {myDay?.status === 'REJECTED' && myDay.rejection_reason && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-800">
            Sent back for corrections: {myDay.rejection_reason}
          </p>
        )}
      </section>

      {/* ---------- Officer: today's totals + request access ---------- */}
      {isOfficer && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white shadow-xs lg:col-span-2">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">My day so far</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">These totals are submitted with your day for approval.</p>
            </header>
            <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
              {[
                ['Clients served', String(mySummary.clients)],
                ['Loans created', String(mySummary.loans)],
                ['Loans disbursed', String(mySummary.disbursed)],
                ['Repayments', String(mySummary.repayments)],
                ['Total collected', formatUGX(mySummary.collected)],
                ['Deposits', formatUGX(mySummary.deposits)],
                ['Withdrawals', formatUGX(mySummary.withdrawals)],
                ['Started', shortTime(myDay?.started_at)],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-1 text-[13px] font-bold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldQuestion className="h-4 w-4 text-[#0B4394]" />
                Request access
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">For weekends or before the day is opened.</p>
            </header>
            <div className="space-y-3 p-5">
              <textarea
                rows={3}
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Why do you need to work now?"
                className="form-field"
              />
              <button onClick={requestAccess} disabled={!!busy || !requestReason.trim()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy === 'request' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldQuestion className="h-4 w-4" />}
                Send request
              </button>
              {accessRequests.filter((r) => r.requester_id === user?.id).slice(0, 3).map((r) => (
                <p key={r.id} className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                  <span className="truncate">{shortDate(r.business_date)}</span>
                  <StatusPill status={r.status} />
                </p>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ---------- Management ---------- */}
      {isManagement && !isAuditor && (
        <>
          {/* §2/§3/§7 — the state of the selected branch's day, with the one
              action that state permits. The card is the confirmation, not a toast. */}
          <BusinessDayStatusCard
            day={selectedDay}
            branchName={branchName(selectedBranchId)}
            openedByName={staffNames[selectedDay?.opened_by || ''] || '—'}
            closedByName={staffNames[(selectedDay as { closed_by?: string } | undefined)?.closed_by || ''] || '—'}
            stats={selectedStats}
            now={now}
            businessDate={today}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {branches.length > 1 && (
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setOpenBranch(e.target.value)}
                    aria-label="Branch"
                    className="form-field w-auto min-w-44"
                  >
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                  </select>
                )}
                {selectedDay?.status === 'OPEN' ? (
                  <button onClick={() => setCloseModal(true)} disabled={!!busy}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-chetu-red px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60">
                    <Lock className="h-4 w-4" />
                    Close Business Day
                  </button>
                ) : (
                  <button onClick={() => setOpenModal(true)} disabled={!!busy}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B4394] px-4 text-[13px] font-bold text-white hover:bg-[#093672] disabled:opacity-60">
                    <LockOpen className="h-4 w-4" />
                    {selectedDay ? 'Reopen Business Day' : 'Open Business Day'}
                  </button>
                )}
              </div>
            }
          />

          {/* §8 — the day's lifecycle, so the audit log is not the only record. */}
          <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">Business day timeline</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">{branchName(selectedBranchId)} · {shortDate(today)}</p>
            </header>
            <BusinessDayTimeline events={timeline} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">All branches today</h2>
            </header>

            <TableScroll ariaLabel="Business days today">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                    <th>Branch</th><th>Date</th><th>Status</th><th>Opened</th><th>Officers active</th><th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysDays.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No branch has been opened for {shortDate(today)}.</td></tr>
                  )}
                  {todaysDays.map((d) => (
                    <tr key={d.id} className="[&>td]:whitespace-nowrap [&>td]:px-4 [&>td]:py-2.5">
                      <td className="font-semibold text-slate-900">{branchName(d.branch_id)}</td>
                      <td>{shortDate(d.business_date)}</td>
                      <td><StatusPill status={d.status} /></td>
                      <td>{shortTime(d.opened_at)}</td>
                      <td>{todaysOfficerDays.filter((o) => o.business_day_id === d.id && o.status === 'ACTIVE').length}</td>
                      <td className="text-right">
                        {d.status === 'OPEN' && (
                          <button onClick={() => closeDay(d.branch_id, d.id)} disabled={!!busy}
                            className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                            Close day
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">
                Officer days {awaitingApproval.length > 0 && <span className="ml-1 text-amber-600">({awaitingApproval.length} awaiting approval)</span>}
              </h2>
            </header>
            <TableScroll ariaLabel="Officer working days">
              <table className="w-full min-w-[880px] text-left text-[12px]">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                    <th>Officer</th><th>Branch</th><th>Status</th><th>Started</th><th>Submitted</th>
                    <th className="text-right">Collected</th><th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysOfficerDays.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No officer has started work today.</td></tr>
                  )}
                  {todaysOfficerDays.map((d) => (
                    <tr key={d.id} className="[&>td]:whitespace-nowrap [&>td]:px-4 [&>td]:py-2.5">
                      <td className="font-semibold text-slate-900">{officerName(d.officer_id)}</td>
                      <td>{branchName(d.branch_id)}</td>
                      <td><StatusPill status={d.status} /></td>
                      <td>{shortTime(d.started_at)}</td>
                      <td>{shortTime(d.submitted_at)}</td>
                      <td className="text-right font-bold">{d.summary?.collected != null ? formatUGX(Number(d.summary.collected)) : '—'}</td>
                      <td className="text-right">
                        {(d.status === 'SUBMITTED' || d.status === 'PENDING_APPROVAL') && (
                          <span className="inline-flex gap-1.5">
                            <button onClick={() => setReviewing(d)}
                              className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                              Review
                            </button>
                            <button onClick={() => approveDay(d)} disabled={!!busy}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button onClick={() => { setRejectFor(d); setRejectReason(''); }} disabled={!!busy}
                              className="inline-flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50">
                              <XCircle className="h-3.5 w-3.5" /> Send back
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">
                Special access requests {pendingRequests.length > 0 && <span className="ml-1 text-amber-600">({pendingRequests.length} pending)</span>}
              </h2>
            </header>
            <TableScroll ariaLabel="Access requests">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                    <th>Requested</th><th>Date</th><th>Reason</th><th>Status</th><th>Expires</th><th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accessRequests.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No access requests.</td></tr>
                  )}
                  {accessRequests.slice(0, 20).map((r) => (
                    <tr key={r.id} className="[&>td]:px-4 [&>td]:py-2.5">
                      <td className="whitespace-nowrap">{shortTime(r.created_at)}</td>
                      <td className="whitespace-nowrap">{shortDate(r.business_date)}</td>
                      <td className="max-w-72 truncate" title={r.reason}>{r.reason}</td>
                      <td><StatusPill status={r.status} /></td>
                      <td className="whitespace-nowrap">{r.expires_at ? shortTime(r.expires_at) : '—'}</td>
                      <td className="whitespace-nowrap text-right">
                        {r.status === 'Pending' && (
                          <span className="inline-flex gap-1.5">
                            <button onClick={() => decideRequest(r.id, r.requester_id, true)} disabled={!!busy}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">Approve</button>
                            <button onClick={() => decideRequest(r.id, r.requester_id, false)} disabled={!!busy}
                              className="rounded border border-red-300 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50">Reject</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>
        </>
      )}

      {/* §1 / §4–§6 — both control actions are confirmed against a summary. */}
      <OpenDayModal
        open={openModal}
        branchName={branchName(selectedBranchId)}
        businessDate={today}
        managerName={user?.full_name || '—'}
        currentTime={now.toLocaleTimeString('en-GB')}
        currentStatus={selectedDay?.status || 'NOT_OPENED'}
        reopening={!!selectedDay}
        busy={busy === 'open'}
        onCancel={() => setOpenModal(false)}
        onConfirm={openDay}
      />

      <CloseDayModal
        open={closeModal && !!selectedDay}
        branchName={branchName(selectedBranchId)}
        businessDate={today}
        stats={selectedStats}
        busy={busy.startsWith('close-')}
        onCancel={() => setCloseModal(false)}
        onConfirm={() => selectedDay && closeDay(selectedDay.branch_id, selectedDay.id)}
      />

      {/* §11 — audit trail */}
      {(isManagement || isAuditor) && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
          <header className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Business day audit trail</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Append-only. Entries cannot be edited or removed by anyone.</p>
          </header>
          <TableScroll ariaLabel="Business day audit trail" maxHeight="22rem">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                  <th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Branch</th><th>Status change</th><th>Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No control actions recorded yet.</td></tr>
                )}
                {audit.slice(0, 60).map((a) => (
                  <tr key={a.id} className="[&>td]:px-4 [&>td]:py-2">
                    <td className="whitespace-nowrap">{shortDate(a.created_at)} {shortTime(a.created_at)}</td>
                    <td className="whitespace-nowrap font-semibold text-slate-900">{a.actor_name || '—'}</td>
                    <td className="whitespace-nowrap">{a.actor_role || '—'}</td>
                    <td className="whitespace-nowrap">{a.action}</td>
                    <td className="whitespace-nowrap">{branchName(a.branch_id)}</td>
                    <td className="whitespace-nowrap">
                      {a.previous_status ? `${a.previous_status} → ${a.new_status}` : a.new_status || '—'}
                    </td>
                    <td className="max-w-64 truncate" title={a.reason || ''}>{a.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}

      {/* §5 — confirm before locking yourself out for the day */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-slate-900">Close my day</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Once submitted you cannot record anything else for {shortDate(today)}.
              </p>
            </div>
            <div className="space-y-4 p-5">
              {pending.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <p className="text-[12px] font-bold text-amber-900">Still outstanding</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-amber-800">
                    {pending.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    You can still submit — your manager will see this too.
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-slate-200 bg-slate-100 sm:grid-cols-3">
                {[
                  ['Clients served', String(mySummary.clients)],
                  ['Loans created', String(mySummary.loans)],
                  ['Loans disbursed', String(mySummary.disbursed)],
                  ['Repayments', String(mySummary.repayments)],
                  ['Total collected', formatUGX(mySummary.collected)],
                  ['Deposits', formatUGX(mySummary.deposits)],
                  ['Withdrawals', formatUGX(mySummary.withdrawals)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-0.5 text-[13px] font-bold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                I confirm that my day's activities are complete and I am submitting this day for approval.
              </p>

              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmClose(false)}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700">Cancel</button>
                <button
                  onClick={async () => { setConfirmClose(false); await submitMyDay(); }}
                  disabled={!!busy}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-[13px] font-bold text-blue-950 disabled:opacity-60">
                  Confirm and submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* §6 — reviewer's drill-down into one officer's day */}
      {reviewing && reviewData && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {officerName(reviewing.officer_id)} — {shortDate(reviewing.business_date)}
                </h3>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Submitted {shortTime(reviewing.submitted_at)} · {branchName(reviewing.branch_id)}
                </p>
              </div>
              <button onClick={() => setReviewing(null)} aria-label="Close review"
                className="rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-slate-200 bg-slate-100 sm:grid-cols-4">
                {Object.entries(reviewing.summary || {}).map(([k, v]) => (
                  <div key={k} className="bg-white px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</dt>
                    <dd className="mt-0.5 text-[13px] font-bold text-slate-900">
                      {['collected', 'deposits', 'withdrawals'].includes(k) ? formatUGX(Number(v)) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>

              <ReviewList title={`Members registered (${reviewData.clients.length})`}
                rows={reviewData.clients.map((c) => [c.client_number, c.full_name, c.status])} />
              <ReviewList title={`Loans touched (${reviewData.loans.length})`}
                rows={reviewData.loans.map((l) => [l.loan_number, formatUGX(l.principal_amount), l.status])} />
              <ReviewList title={`Repayments (${reviewData.repayments.length})`}
                rows={reviewData.repayments.map((r) => [r.receipt_number, formatUGX(r.amount_paid), r.payment_method])} />
              <ReviewList title={`Savings movements (${reviewData.savings.length})`}
                rows={reviewData.savings.map((t) => [t.transaction_number, formatUGX(t.amount), t.transaction_type])} />
              <ReviewList title={`Audit entries (${reviewData.audit.length})`}
                rows={reviewData.audit.map((a) => [shortTime(a.created_at), a.action, a.new_status || '—'])} />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
              <button onClick={() => { setRejectFor(reviewing); setRejectReason(''); setReviewing(null); }}
                className="rounded-lg border border-red-300 px-4 py-2 text-[13px] font-bold text-red-700 hover:bg-red-50">
                Send back
              </button>
              <button onClick={async () => { const d = reviewing; setReviewing(null); await approveDay(d); }}
                disabled={!!busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">
                Approve day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send-back reason */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-slate-900">Send the day back for corrections</h3>
            </div>
            <div className="space-y-3 p-5">
              <textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="What needs correcting?" className="form-field" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejectFor(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700">Cancel</button>
                <button onClick={rejectDay} disabled={!!busy || !rejectReason.trim()}
                  className="rounded-lg bg-chetu-red px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">Send back</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
