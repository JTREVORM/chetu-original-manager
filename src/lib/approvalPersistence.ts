/**
 * The write sequence that turns an approved application into a loan.
 *
 * Approving a loan touches three rows in three separate requests: the
 * application moves to Approved, the loan is created, and its repayment
 * schedule is written. PostgREST has no transaction spanning them, so the
 * sequence can stop half way.
 *
 * It used to stop silently. The schedule insert logged its error and the
 * approval carried on, leaving an Approved application and a loan with no
 * schedule at all — which disburses without the meeting-day rebase (that path
 * requires at least one existing row), shows zero arrears on every collection
 * screen for the rest of its life because `summariseSchedule([])` has nothing
 * to count, and still lets money be collected against it. A loan invisible to
 * arrears is the same class of failure as the weekday drift this system was
 * repaired for, so it fails loudly now.
 *
 * The compensation is a delete, not a rollback: the loan row is removed and the
 * application put back the way it was found. That is the strongest guarantee
 * available from the client. If the compensation itself fails, the caller is
 * told exactly what is left behind rather than being handed a generic error —
 * an operator has to finish the job by hand, and needs to know what to look
 * for.
 *
 * Dependency-injected so the failure paths can be exercised without a database:
 * `verify-schedule.mjs` drives every branch with stubs.
 */

export interface WriteResult<T = unknown> {
  data?: T | null;
  error?: { message: string } | null;
}

/**
 * `PromiseLike`, not `Promise`: a PostgREST query builder is thenable but is
 * not a Promise, so the real call sites pass builders directly rather than
 * wrapping every one in an extra `async`.
 */
export interface ApprovalPersistenceDeps<TLoan> {
  /** Creates the loan row. Its `application_id` is UNIQUE, which is what stops a second approval. */
  insertLoan: () => PromiseLike<WriteResult<TLoan>>;
  /** Writes every schedule row for the new loan. One request, so it is all-or-nothing. */
  insertSchedule: (loan: TLoan) => PromiseLike<WriteResult>;
  /** Compensation: removes the loan created moments ago. */
  deleteLoan: (loan: TLoan) => PromiseLike<WriteResult>;
  /** Compensation: puts the application back to the status it held before approval. */
  restoreApplication: () => PromiseLike<WriteResult>;
}

/**
 * Raised when the schedule could not be written AND the compensation could not
 * complete. Carries what survived so an operator can finish by hand.
 */
export class ApprovalCompensationError extends Error {
  readonly orphanLoanRemains: boolean;
  readonly applicationStillApproved: boolean;
  readonly originalError: string;

  constructor(args: {
    originalError: string;
    orphanLoanRemains: boolean;
    applicationStillApproved: boolean;
    loanLabel: string;
  }) {
    const leftovers = [
      args.orphanLoanRemains ? `the loan row (${args.loanLabel}) was NOT removed` : null,
      args.applicationStillApproved ? "the application is still marked Approved" : null,
    ].filter(Boolean);

    super(
      `The repayment schedule could not be created (${args.originalError}), ` +
        `and the approval could not be fully undone: ${leftovers.join(" and ")}. ` +
        `This loan has no schedule and must not be disbursed — ask an Administrator ` +
        `to remove it before approving the application again.`,
    );
    this.name = "ApprovalCompensationError";
    this.originalError = args.originalError;
    this.orphanLoanRemains = args.orphanLoanRemains;
    this.applicationStillApproved = args.applicationStillApproved;
  }
}

/**
 * Creates the loan and its schedule, or leaves neither behind.
 *
 * Returns the created loan only when its schedule is written too. Throws
 * otherwise — an approval that cannot produce a schedule is not an approval.
 */
export async function persistApprovedLoan<TLoan extends { id: string }>(
  deps: ApprovalPersistenceDeps<TLoan>,
  /** Used only in the message when compensation fails; the loan number if known. */
  loanLabel = "the new loan",
): Promise<TLoan> {
  const loanResult = await deps.insertLoan();
  if (loanResult.error || !loanResult.data) {
    // Nothing was created, so there is nothing to compensate beyond putting the
    // application back. A failure here is swallowed deliberately: the caller
    // needs the original reason the loan could not be created, not a secondary
    // error from the attempt to tidy up.
    try {
      await deps.restoreApplication();
    } catch {
      // reported through the original error below
    }
    throw new Error(loanResult.error?.message || "Failed to create loan");
  }
  const loan = loanResult.data;

  const scheduleResult = await deps.insertSchedule(loan);
  if (!scheduleResult.error) return loan;

  const originalError = scheduleResult.error.message;

  // Compensate. Both steps are attempted even if the first fails: leaving the
  // application Approved as well as the loan behind is strictly worse.
  let orphanLoanRemains = true;
  let applicationStillApproved = true;

  try {
    const deleted = await deps.deleteLoan(loan);
    if (!deleted.error) orphanLoanRemains = false;
  } catch {
    orphanLoanRemains = true;
  }

  try {
    const restored = await deps.restoreApplication();
    if (!restored.error) applicationStillApproved = false;
  } catch {
    applicationStillApproved = true;
  }

  if (orphanLoanRemains || applicationStillApproved) {
    throw new ApprovalCompensationError({
      originalError,
      orphanLoanRemains,
      applicationStillApproved,
      loanLabel,
    });
  }

  throw new Error(
    `The repayment schedule could not be created (${originalError}). ` +
      `The approval has been rolled back — the application is unchanged and no loan was created. ` +
      `Try again.`,
  );
}
