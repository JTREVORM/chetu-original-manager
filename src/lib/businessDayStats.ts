import type {
  AuditRow,
  BusinessDayRow,
  OfficerDayRow,
  StaffRow,
} from "../context/BusinessDayContext";

/**
 * Everything the open/close workflow needs to state about one branch-day, in
 * one place so the status card, the confirmation modals, the timeline and the
 * dashboard tile can never disagree about the same number.
 */
export interface DayStats {
  officersTotal: number;
  officersActive: number;
  officersSubmitted: number;
  officersPendingApproval: number;
  officersApproved: number;
  officersNotStarted: number;
  loansDisbursed: number;
  totalDisbursed: number;
  repaymentCount: number;
  totalCollected: number;
  deposits: number;
  withdrawals: number;
  totalTransactions: number;
  /** Unresolved items a manager should see before closing the day. */
  outstanding: string[];
}

const onDate = (value: string | null | undefined, date: string) =>
  (value || "").split("T")[0] === date;

export interface DayStatsInput {
  branchId: string;
  date: string;
  officerDays: OfficerDayRow[];
  staff: StaffRow[];
  loans: {
    disbursed_at?: string | null;
    principal_amount?: number;
    status?: string;
    approved_by?: string | null;
  }[];
  repayments: { payment_date?: string | null; created_at?: string | null; amount_paid?: number }[];
  savings: { created_at?: string | null; amount?: number; transaction_type?: string }[];
  clients: { date_registered?: string | null; approval_status?: string }[];
}

export function computeDayStats(input: DayStatsInput): DayStats {
  const { branchId, date, officerDays, staff, loans, repayments, savings, clients } = input;

  const days = officerDays.filter((d) => d.business_date === date && d.branch_id === branchId);
  const officersTotal = staff.filter(
    (p) =>
      p.role === "Loan Officer" && p.status === "Active" && (p.branch_ids || []).includes(branchId),
  ).length;

  const countBy = (...statuses: string[]) => days.filter((d) => statuses.includes(d.status)).length;
  const officersActive = countBy("ACTIVE", "SPECIAL_ACCESS", "REJECTED");
  const officersSubmitted = countBy("SUBMITTED", "PENDING_APPROVAL", "APPROVED");
  const officersPendingApproval = countBy("SUBMITTED", "PENDING_APPROVAL");
  const officersApproved = countBy("APPROVED");
  const officersNotStarted = Math.max(0, officersTotal - days.length);

  const disbursedToday = loans.filter((l) => onDate(l.disbursed_at, date));
  const paidToday = repayments.filter(
    (r) => onDate(r.payment_date, date) || onDate(r.created_at, date),
  );
  const savedToday = savings.filter((t) => onDate(t.created_at, date));

  const deposits = savedToday
    .filter((t) => t.transaction_type !== "Withdrawal")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const withdrawals = savedToday
    .filter((t) => t.transaction_type === "Withdrawal")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  // What a manager should resolve, or at least see, before locking the date.
  const outstanding: string[] = [];
  const notSubmitted = officersNotStarted + countBy("ACTIVE", "SPECIAL_ACCESS");
  if (notSubmitted > 0) {
    outstanding.push(
      `${notSubmitted} Loan Officer${notSubmitted === 1 ? " has" : "s have"} not submitted their day.`,
    );
  }
  if (officersPendingApproval > 0) {
    outstanding.push(
      `${officersPendingApproval} submitted day${officersPendingApproval === 1 ? "" : "s"} still awaiting your approval.`,
    );
  }
  const rejected = countBy("REJECTED");
  if (rejected > 0) {
    outstanding.push(
      `${rejected} day${rejected === 1 ? "" : "s"} sent back for corrections and not yet resubmitted.`,
    );
  }
  const pendingAdmissions = clients.filter(
    (c) => onDate(c.date_registered, date) && c.approval_status === "Pending",
  ).length;
  if (pendingAdmissions > 0) {
    outstanding.push(
      `${pendingAdmissions} member admission${pendingAdmissions === 1 ? "" : "s"} awaiting approval.`,
    );
  }
  const undisbursed = loans.filter((l) => l.status === "Pending" && !!l.approved_by).length;
  if (undisbursed > 0) {
    outstanding.push(
      `${undisbursed} approved loan${undisbursed === 1 ? "" : "s"} not yet disbursed.`,
    );
  }

  return {
    officersTotal,
    officersActive,
    officersSubmitted,
    officersPendingApproval,
    officersApproved,
    officersNotStarted,
    loansDisbursed: disbursedToday.length,
    totalDisbursed: disbursedToday.reduce((s, l) => s + Number(l.principal_amount || 0), 0),
    repaymentCount: paidToday.length,
    totalCollected: paidToday.reduce((s, r) => s + Number(r.amount_paid || 0), 0),
    deposits,
    withdrawals,
    totalTransactions: disbursedToday.length + paidToday.length + savedToday.length,
    outstanding,
  };
}

/** "3h 42m" — how long the day has been open, or ran for once closed. */
export function formatDuration(from?: string | null, to?: Date | string | null): string {
  if (!from) return "—";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface TimelineEvent {
  at: string;
  label: string;
  detail?: string;
  tone: "green" | "amber" | "red" | "slate";
}

/**
 * The day's lifecycle as a reviewable sequence, assembled from the control
 * rows and the audit trail so a manager does not have to read logs.
 */
export function buildTimeline(
  day: BusinessDayRow | undefined,
  officerDays: OfficerDayRow[],
  audit: AuditRow[],
  staffNames: Record<string, string>,
): TimelineEvent[] {
  if (!day) return [];
  const events: TimelineEvent[] = [];
  const mine = officerDays.filter((d) => d.business_day_id === day.id);

  if (day.opened_at) {
    events.push({
      at: day.opened_at,
      label: "Business Day Opened",
      detail: `Opened by ${staffNames[day.opened_by || ""] || "a manager"}`,
      tone: "green",
    });
  }

  const firstStart = mine
    .map((d) => d.started_at)
    .filter(Boolean)
    .sort()[0];
  if (firstStart) {
    events.push({
      at: firstStart,
      label: "Loan Officers Started Working",
      detail: `${mine.filter((d) => d.started_at).length} started`,
      tone: "green",
    });
  }

  const submitted = mine
    .filter((d) => d.submitted_at)
    .sort((a, b) => (a.submitted_at! < b.submitted_at! ? -1 : 1));
  const lastSubmitted = submitted[submitted.length - 1];
  if (lastSubmitted?.submitted_at) {
    const total = mine.length || submitted.length;
    events.push({
      at: lastSubmitted.submitted_at,
      label: "Loan Officer Submissions",
      detail: `${submitted.length} of ${total} submitted`,
      tone: submitted.length === total ? "green" : "amber",
    });
  }

  const approved = mine
    .filter((d) => d.approved_at)
    .sort((a, b) => (a.approved_at! < b.approved_at! ? -1 : 1));
  if (approved.length && approved.length === mine.length) {
    events.push({
      at: approved[approved.length - 1]!.approved_at!,
      label: "All Days Approved",
      detail: `${approved.length} approved`,
      tone: "green",
    });
  } else if (approved.length) {
    events.push({
      at: approved[approved.length - 1]!.approved_at!,
      label: "Days Approved",
      detail: `${approved.length} of ${mine.length} approved`,
      tone: "amber",
    });
  }

  for (const a of audit) {
    if (
      a.action?.toLowerCase().includes("special access") &&
      a.business_date === day.business_date
    ) {
      events.push({
        at: a.created_at,
        label: a.action,
        detail: a.actor_name ? `by ${a.actor_name}` : undefined,
        tone: a.new_status === "Approved" ? "amber" : "slate",
      });
    }
  }

  if (day.closed_at) {
    events.push({
      at: day.closed_at,
      label: "Business Day Closed",
      detail: "Transaction entry locked for this date",
      tone: "red",
    });
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : 1));
}
