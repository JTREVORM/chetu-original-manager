/**
 * Standard Chetu Microfinance fee schedule.
 * Fixed fees are in UGX, percentage fees apply to the loan principal.
 */
export const FEES = {
  /** Charged once per member at admission. */
  admissionFee: 5000,
  /** Passbook issued at admission. */
  passbookFee: 5000,
  /** Group maintenance fee charged on every loan application. */
  groupMaintenanceFee: 2000,
  /** Loan processing fee — % of principal. */
  processingFeePct: 4,
  /** Credit Reference Bureau fee — % of principal. */
  crbFeePct: 1,
  /** Refundable security deposit — % of principal. */
  securityDepositPct: 15,
} as const;

const pct = (amount: number, percentage: number) =>
  Math.round((Math.max(0, amount) * percentage) / 100);

export const processingFeeOn = (principal: number) => pct(principal, FEES.processingFeePct);
export const crbFeeOn = (principal: number) => pct(principal, FEES.crbFeePct);
export const securityDepositOn = (principal: number) => pct(principal, FEES.securityDepositPct);

export interface LoanFeeBreakdown {
  processingFee: number;
  crbFee: number;
  securityDeposit: number;
  groupMaintenanceFee: number;
  /** Everything deducted from / collected upfront with the loan. */
  totalDeductions: number;
  /** Cash actually handed to the member. */
  netDisbursed: number;
}

/** Upfront charges for a loan of `principal`. */
export function loanFees(principal: number): LoanFeeBreakdown {
  const processingFee = processingFeeOn(principal);
  const crbFee = crbFeeOn(principal);
  const securityDeposit = securityDepositOn(principal);
  const groupMaintenanceFee = FEES.groupMaintenanceFee;
  const totalDeductions = processingFee + crbFee + securityDeposit + groupMaintenanceFee;
  return {
    processingFee,
    crbFee,
    securityDeposit,
    groupMaintenanceFee,
    totalDeductions,
    netDisbursed: Math.max(0, Math.round(principal) - totalDeductions),
  };
}

/** Fees collected when a new member is admitted (CRB is charged per loan, not at admission). */
export const admissionFees = () => ({
  admissionFee: FEES.admissionFee,
  passbookFee: FEES.passbookFee,
  total: FEES.admissionFee + FEES.passbookFee,
});

/** Label/amount pairs so every screen renders the identical breakdown. */
export function feeLines(
  principal: number,
): { label: string; amount: number; emphasis?: boolean }[] {
  const f = loanFees(principal);
  return [
    { label: `Processing Fee (${FEES.processingFeePct}%)`, amount: f.processingFee },
    { label: `CRB Fee (${FEES.crbFeePct}%)`, amount: f.crbFee },
    { label: `Security Deposit (${FEES.securityDepositPct}%)`, amount: f.securityDeposit },
    { label: "Group Maintenance Fee", amount: f.groupMaintenanceFee },
    { label: "Total Deductions", amount: f.totalDeductions, emphasis: true },
    { label: "Net Cash To Member", amount: f.netDisbursed, emphasis: true },
  ];
}

export interface LoanRequestLimits {
  min_amount?: number | null;
  max_amount?: number | null;
  min_weeks?: number | null;
  max_weeks?: number | null;
}

/**
 * Validates a loan request and guarantees the fee breakdown reconciles:
 * deductions must sum exactly and never exceed the principal.
 */
export function validateLoanRequest(
  principal: number,
  weeks: number,
  limits?: LoanRequestLimits | null,
): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(principal) || principal <= 0) errors.push("Enter a valid principal amount.");
  if (!Number.isFinite(weeks) || weeks <= 0) errors.push("Select a valid loan period.");

  const min = Number(limits?.min_amount ?? 0);
  const max = Number(limits?.max_amount ?? 0);
  if (min > 0 && principal < min)
    errors.push(`Principal must be at least UGX ${min.toLocaleString()}.`);
  if (max > 0 && principal > max)
    errors.push(`Principal cannot exceed UGX ${max.toLocaleString()}.`);

  const minW = Number(limits?.min_weeks ?? 0);
  const maxW = Number(limits?.max_weeks ?? 0);
  if (minW > 0 && weeks < minW) errors.push(`Loan period must be at least ${minW} weeks.`);
  if (maxW > 0 && weeks > maxW) errors.push(`Loan period cannot exceed ${maxW} weeks.`);

  if (errors.length === 0) {
    const f = loanFees(principal);
    const sum = f.processingFee + f.crbFee + f.securityDeposit + f.groupMaintenanceFee;
    if (sum !== f.totalDeductions)
      errors.push("Fee breakdown does not reconcile. Contact support.");
    if (f.totalDeductions >= Math.round(principal))
      errors.push("Charges and deductions exceed the principal. Increase the loan amount.");
  }
  return errors;
}

/** True when a stored loan row matches the standard fee schedule for its principal. */
export function feesMatchStored(
  principal: number,
  storedProcessingFee: number,
  storedSecurityAmount: number,
  storedCrbFee?: number,
  storedGroupMaintenanceFee?: number,
): boolean {
  if (Math.round(storedProcessingFee) !== processingFeeOn(principal)) return false;
  if (Math.round(storedSecurityAmount) !== securityDepositOn(principal)) return false;
  // Older loans predate these columns; only compare when a value is present.
  if (storedCrbFee !== undefined && Math.round(storedCrbFee) !== crbFeeOn(principal)) return false;
  if (
    storedGroupMaintenanceFee !== undefined &&
    Math.round(storedGroupMaintenanceFee) !== FEES.groupMaintenanceFee
  ) {
    return false;
  }
  return true;
}

/** Minimum shape needed to read the charges off a stored loan. */
export interface StoredLoanFees {
  principal_amount: number;
  processing_fee_amount?: number | null;
  crb_fee_amount?: number | null;
  security_amount?: number | null;
  group_maintenance_fee?: number | null;
  net_disbursed_amount?: number | null;
}

/**
 * The charges actually taken on a loan.
 *
 * Always prefer what was stored at approval — recomputing from the current
 * schedule would silently restate historical loans whenever a rate changes.
 * The schedule is only a fallback for rows written before the fee columns
 * existed.
 */
export function storedLoanFees(loan: StoredLoanFees): LoanFeeBreakdown {
  const principal = Number(loan.principal_amount || 0);
  const schedule = loanFees(principal);

  const processingFee =
    loan.processing_fee_amount != null
      ? Number(loan.processing_fee_amount)
      : schedule.processingFee;
  const crbFee = loan.crb_fee_amount != null ? Number(loan.crb_fee_amount) : schedule.crbFee;
  const securityDeposit =
    loan.security_amount != null ? Number(loan.security_amount) : schedule.securityDeposit;
  const groupMaintenanceFee =
    loan.group_maintenance_fee != null
      ? Number(loan.group_maintenance_fee)
      : schedule.groupMaintenanceFee;

  const totalDeductions = processingFee + crbFee + securityDeposit + groupMaintenanceFee;
  return {
    processingFee,
    crbFee,
    securityDeposit,
    groupMaintenanceFee,
    totalDeductions,
    netDisbursed:
      loan.net_disbursed_amount != null
        ? Number(loan.net_disbursed_amount)
        : Math.max(0, Math.round(principal) - totalDeductions),
  };
}
