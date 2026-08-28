import { addDays, format } from "date-fns";
import { InterestType, WeeklyScheduleRow } from "../types/database.types";

/**
 * The smallest amount that can actually change hands. Uganda has no coin below
 * UGX 100 in practical circulation, so an instalment of 4,317 cannot be
 * collected at a group meeting — every figure a borrower pays is rounded to
 * this step.
 */
export const UGX_STEP = 100;

const roundToStep = (n: number, step: number = UGX_STEP) => Math.round(n / step) * step;
const ceilToStep = (n: number, step: number = UGX_STEP) => Math.ceil(n / step) * step;
const floorToStep = (n: number, step: number = UGX_STEP) => Math.floor(n / step) * step;

/**
 * Splits `total` into `count` collectable instalments.
 *
 * Every instalment is a multiple of UGX_STEP, they differ from each other by at
 * most one step, and they sum to exactly `total` — so the schedule still closes
 * on the amount owed. The odd steps go to the earliest weeks, leaving the final
 * payment no larger than the rest.
 */
export function splitIntoSteps(total: number, count: number): number[] {
  const weeks = Math.max(1, count);
  const payable = Math.max(0, roundToStep(total));
  const base = floorToStep(payable / weeks);
  // `payable` and `base` are both multiples of the step, so the remainder is
  // too, and it is always smaller than one step per week.
  const extraSteps = Math.round((payable - base * weeks) / UGX_STEP);

  return Array.from({ length: weeks }, (_, i) => base + (i < extraSteps ? UGX_STEP : 0));
}

export interface LoanCalculationSummary {
  principalAmount: number;
  interestRate: number;
  interestType: InterestType;
  loanPeriodWeeks: number;
  processingFeePercentage: number;
  totalInterestAmount: number;
  totalAmountPayable: number;
  weeklyInstallment: number;
  processingFeeAmount: number;
  firstRepaymentDate: string;
  finalDueDate: string;
  schedule: WeeklyScheduleRow[];
}

export function calculateLoanSchedule(
  principalAmount: number,
  interestRate: number, // Annual or total rate percentage (e.g. 15%)
  interestType: InterestType,
  loanPeriodWeeks: number,
  processingFeePercentage: number = 2.0,
  startDateInput?: string | Date,
): LoanCalculationSummary {
  const principal = Math.max(0, principalAmount);
  const weeks = Math.max(1, loanPeriodWeeks);
  const feePct = Math.max(0, processingFeePercentage);
  const processingFeeAmount = Math.round((principal * feePct) / 100);

  const startDate = startDateInput ? new Date(startDateInput) : new Date();
  const firstRepaymentDateObj = addDays(startDate, 7);

  let totalInterestAmount = 0;
  let totalAmountPayable = 0;
  let weeklyInstallment = 0;
  const schedule: WeeklyScheduleRow[] = [];

  if (interestType === "Flat Rate") {
    /*
     * Flat Rate: the interest is a straight percentage of the principal for
     * the whole loan cycle, not prorated by term.
     *
     *   Total Interest = Principal × Rate%
     *   e.g. UGX 100,000 at 15% owes UGX 15,000, whether the cycle runs
     *   8 weeks or 25.
     *
     * This is how the rate is quoted to a group at admission, and it is what
     * the loan product's rate means. It previously scaled by weeks/52, which
     * turned that same 15% loan into UGX 3,462 over 12 weeks — a figure no
     * officer had quoted and no borrower expected.
     */
    // The total is rounded to a collectable figure first, and the interest
    // absorbs that rounding — the principal is the cash that left the drawer,
    // so it is never adjusted to make the arithmetic tidy.
    const rawInterest = principal * (interestRate / 100);
    totalAmountPayable = ceilToStep(principal + rawInterest);
    totalInterestAmount = totalAmountPayable - principal;

    const installments = splitIntoSteps(totalAmountPayable, weeks);
    weeklyInstallment = installments[0] ?? 0;

    // Interest is spread the same way, so each row's split is collectable too.
    const interestPortions = splitIntoSteps(totalInterestAmount, weeks);

    let currentRemaining = totalAmountPayable;

    for (let i = 1; i <= weeks; i++) {
      const dueDate = addDays(startDate, i * 7);
      const installment = installments[i - 1]!;
      const interestPortion = Math.min(interestPortions[i - 1]!, installment);
      const principalPortion = installment - interestPortion;
      currentRemaining = Math.max(0, currentRemaining - installment);

      schedule.push({
        week_number: i,
        due_date: format(dueDate, "yyyy-MM-dd"),
        installment_amount: installment,
        principal_portion: principalPortion,
        interest_portion: interestPortion,
        paid_amount: 0,
        remaining_balance: currentRemaining,
        status: "Pending",
      });
    }
  } else {
    // Reducing Balance
    const weeklyRate = interestRate / 100 / 52;
    if (weeklyRate === 0) {
      totalInterestAmount = 0;
      totalAmountPayable = principal;
      weeklyInstallment = ceilToStep(principal / weeks);
    } else {
      // The annuity is rounded up to a collectable figure; the final week then
      // clears whatever is genuinely left rather than repeating this amount.
      weeklyInstallment = ceilToStep(
        (principal * weeklyRate) / (1 - Math.pow(1 + weeklyRate, -weeks)),
      );
    }

    let remainingPrincipal = principal;
    let accumulatedInterest = 0;
    let accumulatedPayable = 0;

    for (let i = 1; i <= weeks; i++) {
      const dueDate = addDays(startDate, i * 7);
      const interestPortion = Math.round(remainingPrincipal * weeklyRate);
      let principalPortion = weeklyInstallment - interestPortion;
      let installment = weeklyInstallment;

      if (i === weeks || remainingPrincipal - principalPortion < 0) {
        // Closing week: settle the balance, then round the payment to a
        // collectable figure and let the principal portion carry the change.
        principalPortion = remainingPrincipal;
        installment = roundToStep(principalPortion + interestPortion);
        principalPortion = installment - interestPortion;
      }

      remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion);
      accumulatedInterest += interestPortion;
      accumulatedPayable += installment;

      schedule.push({
        week_number: i,
        due_date: format(dueDate, "yyyy-MM-dd"),
        installment_amount: installment,
        principal_portion: principalPortion,
        interest_portion: interestPortion,
        paid_amount: 0,
        remaining_balance: 0, // Will update total remaining after loop
        status: "Pending",
      });
    }

    totalInterestAmount = accumulatedInterest;
    totalAmountPayable = accumulatedPayable;

    // Update remaining total payable balance per row
    let currentTotalRemaining = totalAmountPayable;
    for (let i = 0; i < schedule.length; i++) {
      currentTotalRemaining = Math.max(0, currentTotalRemaining - schedule[i].installment_amount);
      schedule[i].remaining_balance = currentTotalRemaining;
    }
  }

  const finalDueDate =
    schedule.length > 0
      ? schedule[schedule.length - 1].due_date
      : format(firstRepaymentDateObj, "yyyy-MM-dd");

  return {
    principalAmount: principal,
    interestRate,
    interestType,
    loanPeriodWeeks: weeks,
    processingFeePercentage: feePct,
    totalInterestAmount,
    totalAmountPayable,
    weeklyInstallment,
    processingFeeAmount,
    firstRepaymentDate: format(firstRepaymentDateObj, "yyyy-MM-dd"),
    finalDueDate,
    schedule,
  };
}

/**
 * A money amount carrying its unit, e.g. "UGX 1,092,500".
 *
 * The prefix is written out rather than left to `style: 'currency'`, which
 * resolves UGX to the locale symbol "USh". That disagreed with the rest of the
 * system — the settings record, the report headers and every MIS table all say
 * UGX — so the same figure read as "USh 1,092,500" on the dashboard and
 * "1,092,500" one screen away.
 *
 * Dense tables deliberately keep bare numbers via `money()` in MisKit and name
 * the unit once in the column header; this formatter is for standalone figures
 * and printed documents, where the amount has to stand on its own.
 */
export function formatUGX(amount: number): string {
  return `UGX ${formatNumber(amount)}`;
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(amount);
}
