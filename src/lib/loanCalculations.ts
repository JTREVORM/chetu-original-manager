import { addDays, format } from 'date-fns';
import { InterestType, WeeklyScheduleRow } from '../types/database.types';

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
  startDateInput?: string | Date
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

  if (interestType === 'Flat Rate') {
    // Flat Rate Interest: Annualized based on weeks proportion or flat duration
    // Formula: Total Interest = Principal * (Rate / 100) * (Weeks / 52)
    // If interest rate is simplified for microfinance flat period: Total Interest = Principal * (Rate / 100) * (Weeks / 52)
    const annualFactor = weeks / 52;
    totalInterestAmount = Math.round(principal * (interestRate / 100) * annualFactor);
    totalAmountPayable = principal + totalInterestAmount;
    weeklyInstallment = Math.round(totalAmountPayable / weeks);

    const weeklyPrincipal = Math.round(principal / weeks);
    const weeklyInterest = Math.round(totalInterestAmount / weeks);

    let currentRemaining = totalAmountPayable;

    for (let i = 1; i <= weeks; i++) {
      const dueDate = addDays(startDate, i * 7);
      const isLastWeek = i === weeks;
      
      const installment = isLastWeek ? currentRemaining : weeklyInstallment;
      const principalPortion = isLastWeek ? Math.max(0, installment - weeklyInterest) : weeklyPrincipal;
      const interestPortion = installment - principalPortion;
      currentRemaining = Math.max(0, currentRemaining - installment);

      schedule.push({
        week_number: i,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        installment_amount: installment,
        principal_portion: principalPortion,
        interest_portion: interestPortion,
        paid_amount: 0,
        remaining_balance: currentRemaining,
        status: 'Pending'
      });
    }
  } else {
    // Reducing Balance
    const weeklyRate = (interestRate / 100) / 52;
    if (weeklyRate === 0) {
      totalInterestAmount = 0;
      totalAmountPayable = principal;
      weeklyInstallment = Math.round(principal / weeks);
    } else {
      weeklyInstallment = Math.round(
        (principal * weeklyRate) / (1 - Math.pow(1 + weeklyRate, -weeks))
      );
    }

    let remainingPrincipal = principal;
    let accumulatedInterest = 0;
    let accumulatedPayable = 0;

    for (let i = 1; i <= weeks; i++) {
      const dueDate = addDays(startDate, i * 7);
      const interestPortion = Math.round(remainingPrincipal * weeklyRate);
      let principalPortion = weeklyInstallment - interestPortion;

      if (i === weeks || remainingPrincipal - principalPortion < 0) {
        principalPortion = remainingPrincipal;
      }

      const installment = principalPortion + interestPortion;
      remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion);
      accumulatedInterest += interestPortion;
      accumulatedPayable += installment;

      schedule.push({
        week_number: i,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        installment_amount: installment,
        principal_portion: principalPortion,
        interest_portion: interestPortion,
        paid_amount: 0,
        remaining_balance: 0, // Will update total remaining after loop
        status: 'Pending'
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

  const finalDueDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : format(firstRepaymentDateObj, 'yyyy-MM-dd');

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
    firstRepaymentDate: format(firstRepaymentDateObj, 'yyyy-MM-dd'),
    finalDueDate,
    schedule
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
  return new Intl.NumberFormat('en-UG', {
    maximumFractionDigits: 0
  }).format(amount);
}
