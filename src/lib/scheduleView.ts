/**
 * One derivation of "where does this loan actually stand", shared by the Loan
 * History, the collection screens and the schedule audit.
 *
 * Instalment state was previously worked out separately in each screen, and the
 * versions disagreed. The collection screen inferred arrears from elapsed weeks
 * (`weeksBetween(first_repayment_date) + 1` × the weekly instalment) rather than
 * from the schedule rows, so it double-counted whenever the stored schedule did
 * not match that assumption — which, once due dates had drifted off the group's
 * meeting day, was most of the time.
 *
 * Everything here is derived at read time from the stored rows. Nothing in this
 * module writes, and nothing re-derives an amount the database already holds:
 * `installment_amount` and `paid_amount` are read as stored.
 */
import { parseLocalDate, toISODate } from "./meetingDay";
import type { RepaymentStatus, WeeklyScheduleRow } from "../types/database.types";

/**
 * How an instalment reads on a given day.
 *
 * These are display states, not database states. `loan_repayment_schedule.status`
 * keeps its existing four values — this adds no column and no CHECK value.
 * "Due" is the refinement the stored model cannot express: an instalment falling
 * exactly today is still `Pending` in the database, but an officer collecting at
 * the meeting needs it to stand out from next month's rows.
 */
export type DerivedInstallmentStatus = "Paid" | "Partially Paid" | "Overdue" | "Due" | "Pending";

export interface DerivedInstallment {
  row: WeeklyScheduleRow;
  weekNumber: number;
  dueDate: string;
  expected: number;
  paid: number;
  /** What is still owed on this instalment alone. Never negative. */
  balance: number;
  status: DerivedInstallmentStatus;
  /** True when the due date has passed and the instalment is not settled. */
  isArrears: boolean;
}

/** Today as `yyyy-MM-dd`, in the local calendar the officers work in. */
export const todayISODate = (): string => toISODate(new Date());

/**
 * Derives one instalment's standing as of `asOf`.
 *
 * An instalment that is short by less than one shilling counts as settled —
 * schedules are split into UGX 100 steps that sum exactly to the amount owed,
 * but a repaired or hand-edited row can leave a rounding crumb behind, and a
 * member should not stay in arrears over UGX 0.4.
 */
export function deriveInstallment(
  row: WeeklyScheduleRow,
  asOf: string = todayISODate(),
): DerivedInstallment {
  const expected = Number(row.installment_amount || 0);
  const paid = Number(row.paid_amount || 0);
  const balance = Math.max(0, expected - paid);
  const settled = balance < 1;

  let status: DerivedInstallmentStatus;
  if (settled) status = "Paid";
  else if (row.due_date < asOf) status = "Overdue";
  else if (row.due_date === asOf) status = "Due";
  else status = "Pending";

  // A part-payment on a row that is not yet late reads as partial rather than
  // as an untouched future instalment.
  if (!settled && paid > 0 && status === "Pending") status = "Partially Paid";

  return {
    row,
    weekNumber: Number(row.week_number || 0),
    dueDate: row.due_date,
    expected,
    paid,
    balance,
    status,
    isArrears: !settled && row.due_date < asOf,
  };
}

export interface ScheduleSummary {
  installments: DerivedInstallment[];
  /** Instalment counts by derived state. They sum to `expectedCount`. */
  expectedCount: number;
  paidCount: number;
  partialCount: number;
  overdueCount: number;
  dueCount: number;
  pendingCount: number;
  /** Sum of every instalment in the schedule. */
  totalExpected: number;
  /** Sum of `paid_amount` across the schedule. */
  totalPaid: number;
  /** Sum of what is still owed across the whole schedule. */
  totalOutstanding: number;
  /** Owed on instalments whose due date has already passed. */
  arrearsAmount: number;
  /** Instalments whose due date has passed and which are not settled. */
  arrearsCount: number;
  /** Owed on instalments falling exactly on `asOf` — today's collectable. */
  dueTodayAmount: number;
  /** The earliest unsettled instalment, arrears included. */
  nextUnpaid?: DerivedInstallment;
  /** The earliest unsettled instalment not yet due. */
  nextDue?: DerivedInstallment;
  /** Days past the oldest unsettled due date, 0 when nothing is late. */
  daysInArrears: number;
}

/**
 * Summarises a loan's schedule as of `asOf`.
 *
 * Rows are sorted by due date, then week number, so a schedule that was
 * repaired out of order still reads chronologically.
 */
export function summariseSchedule(
  schedule: WeeklyScheduleRow[] | undefined | null,
  asOf: string = todayISODate(),
): ScheduleSummary {
  const installments = (schedule || [])
    .map((row) => deriveInstallment(row, asOf))
    .sort((a, b) =>
      a.dueDate === b.dueDate ? a.weekNumber - b.weekNumber : a.dueDate < b.dueDate ? -1 : 1,
    );

  const sum = (pick: (i: DerivedInstallment) => number) =>
    installments.reduce((total, i) => total + pick(i), 0);
  const count = (status: DerivedInstallmentStatus) =>
    installments.filter((i) => i.status === status).length;

  const arrears = installments.filter((i) => i.isArrears);
  const oldestArrear = arrears[0];

  return {
    installments,
    expectedCount: installments.length,
    paidCount: count("Paid"),
    partialCount: count("Partially Paid"),
    overdueCount: count("Overdue"),
    dueCount: count("Due"),
    pendingCount: count("Pending"),
    totalExpected: sum((i) => i.expected),
    totalPaid: sum((i) => i.paid),
    totalOutstanding: sum((i) => i.balance),
    arrearsAmount: arrears.reduce((total, i) => total + i.balance, 0),
    arrearsCount: arrears.length,
    dueTodayAmount: installments
      .filter((i) => i.dueDate === asOf)
      .reduce((total, i) => total + i.balance, 0),
    nextUnpaid: installments.find((i) => i.balance > 0),
    nextDue: installments.find((i) => i.balance > 0 && i.dueDate >= asOf),
    daysInArrears: oldestArrear
      ? Math.max(
          0,
          Math.floor(
            (parseLocalDate(asOf).getTime() - parseLocalDate(oldestArrear.dueDate).getTime()) /
              86_400_000,
          ),
        )
      : 0,
  };
}

/**
 * Applies `amount` across a schedule oldest-instalment-first and reports where
 * each shilling landed.
 *
 * This is the allocation rule the system has always used — `recordRepayment`
 * walked the schedule in order and filled each row before moving on. It is
 * stated once here so that recording a payment, backfilling
 * `loan_repayments.schedule_id` and auditing an existing loan all agree.
 *
 * Nothing is mutated: the caller gets the amounts to write.
 */
export interface Allocation {
  scheduleId?: string;
  weekNumber: number;
  applied: number;
  /** `paid_amount` this row should carry once the payment is applied. */
  paidAmount: number;
  /** Still owed on the row afterwards. */
  balance: number;
  status: RepaymentStatus;
}

export function allocatePayment(
  schedule: WeeklyScheduleRow[],
  amount: number,
): { allocations: Allocation[]; unapplied: number } {
  let remaining = Math.max(0, amount);
  const allocations: Allocation[] = [];

  const ordered = [...schedule].sort((a, b) =>
    a.due_date === b.due_date
      ? Number(a.week_number) - Number(b.week_number)
      : a.due_date < b.due_date
        ? -1
        : 1,
  );

  for (const row of ordered) {
    if (remaining <= 0) break;
    const expected = Number(row.installment_amount || 0);
    const alreadyPaid = Number(row.paid_amount || 0);
    const owed = expected - alreadyPaid;
    if (owed <= 0) continue;

    const applied = Math.min(remaining, owed);
    remaining -= applied;
    const paidAmount = alreadyPaid + applied;

    allocations.push({
      scheduleId: row.id,
      weekNumber: Number(row.week_number || 0),
      applied,
      paidAmount,
      balance: Math.max(0, expected - paidAmount),
      status: expected - paidAmount < 1 ? "Paid" : "Partially Paid",
    });
  }

  // Anything left over is an advance beyond the schedule, or a payment on a
  // loan whose schedule rows are missing. The caller decides what that means —
  // the collection screens treat it as an overpayment, the audit flags it.
  return { allocations, unapplied: remaining };
}
