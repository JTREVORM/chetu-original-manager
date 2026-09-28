/**
 * Every financial figure the application shows, read from one place.
 *
 * Before this module the same number was computed three times — in
 * DatabaseContext's derived aggregates, again in branchMetrics.ts, and again
 * inline in Reports.tsx — over different period boundaries, so the Dashboard's
 * "this month" and a branch card's "this month" were different figures by
 * construction. Each function here maps to exactly one database view, so a
 * report and the dashboard cannot disagree: they are reading the same rows.
 *
 * Nothing in this file does arithmetic on money beyond summing rows the
 * database already reconciled. The splitting, ageing and balancing all happen
 * in SQL, where the ledger's own constraints hold them honest.
 */
import { supabase } from "../supabase";
import { fetchAllRows } from "../fetchAll";
import type {
  AccountBalance,
  AccountLedgerRow,
  AccountReconciliationRow,
  BorrowerStatementRow,
  BranchFinancialsRow,
  CashFlowRow,
  FinancialPositionRow,
  FinancialTransactionRow,
  IncomeStatementRow,
  LedgerHealthRow,
  LoanPortfolioRow,
  MoneyPosition,
  OfficerPerformanceRow,
  ParAgeingRow,
  RepaymentAllocationRow,
} from "../../types/database.types";

export interface DateRange {
  from?: string | null;
  to?: string | null;
}

const failed = (what: string, message: string) => new Error(`Could not load ${what}: ${message}`);

/** Reads a whole view, paged. Reports must never silently truncate. */
const readAll = async <T>(view: string, order = "id"): Promise<T[]> => {
  const { data, error } = await fetchAllRows<T>(
    () => supabase.from(view).select("*").order(order) as never,
    view,
  );
  if (error) throw failed(view, error.message);
  return (data || []) as T[];
};

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/** Where Chetu's money is right now. One row, all of it derived. */
export const fetchMoneyPosition = async (): Promise<MoneyPosition | null> => {
  const { data, error } = await supabase.from("v_money_position").select("*").maybeSingle();
  if (error) throw failed("the money position", error.message);
  return (data as MoneyPosition) ?? null;
};

export const fetchAccountBalances = () =>
  readAll<AccountBalance>("v_account_balances", "sort_order");

export const fetchFinancialPosition = () =>
  readAll<FinancialPositionRow>("v_financial_position", "sort_order");

export const fetchTrialBalance = () =>
  readAll<FinancialPositionRow & { debit_balance: number; credit_balance: number }>(
    "v_trial_balance",
    "account_code",
  );

// ---------------------------------------------------------------------------
// Ledger and transactions
// ---------------------------------------------------------------------------

export const fetchTransactions = async (
  filters: DateRange & {
    branchId?: string | null;
    entryType?: string | null;
    accountId?: string | null;
  } = {},
): Promise<FinancialTransactionRow[]> => {
  let q = supabase
    .from("v_transaction_audit")
    .select("*")
    .order("transaction_date", { ascending: false });
  if (filters.from) q = q.gte("transaction_date", filters.from);
  if (filters.to) q = q.lte("transaction_date", filters.to);
  if (filters.branchId) q = q.eq("branch_id", filters.branchId);
  if (filters.entryType) q = q.eq("entry_type", filters.entryType);
  const { data, error } = await q;
  if (error) throw failed("transactions", error.message);
  return (data || []) as FinancialTransactionRow[];
};

export const fetchAccountLedger = async (
  accountId: string,
  range: DateRange = {},
): Promise<AccountLedgerRow[]> => {
  let q = supabase
    .from("v_account_ledger")
    .select("*")
    .eq("account_id", accountId)
    .order("transaction_date")
    .order("created_at");
  if (range.from) q = q.gte("transaction_date", range.from);
  if (range.to) q = q.lte("transaction_date", range.to);
  const { data, error } = await q;
  if (error) throw failed("the account ledger", error.message);
  return (data || []) as AccountLedgerRow[];
};

export const fetchCashFlow = async (range: DateRange = {}): Promise<CashFlowRow[]> => {
  let q = supabase.from("v_cash_flow").select("*").order("transaction_date");
  if (range.from) q = q.gte("transaction_date", range.from);
  if (range.to) q = q.lte("transaction_date", range.to);
  const { data, error } = await q;
  if (error) throw failed("the cash flow", error.message);
  return (data || []) as CashFlowRow[];
};

// ---------------------------------------------------------------------------
// Income and expenses
// ---------------------------------------------------------------------------

export const fetchIncomeStatement = async (
  range: DateRange = {},
): Promise<IncomeStatementRow[]> => {
  let q = supabase.from("v_income_statement").select("*").order("sort_order");
  if (range.from) q = q.gte("transaction_date", range.from);
  if (range.to) q = q.lte("transaction_date", range.to);
  const { data, error } = await q;
  if (error) throw failed("the income statement", error.message);
  return (data || []) as IncomeStatementRow[];
};

export interface ProfitAndLoss {
  income: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
}

/**
 * Income less operating expenses.
 *
 * Returned loan principal cannot appear here. It is a balance-sheet movement
 * and never touches an income account, so it is excluded structurally rather
 * than by remembering to filter it — which the previous report did not, and so
 * reported every shilling collected as revenue.
 */
export const buildProfitAndLoss = (rows: IncomeStatementRow[]): ProfitAndLoss => {
  const byCode = new Map<
    string,
    { code: string; name: string; amount: number; kind: string; sort: number }
  >();
  for (const r of rows) {
    const key = r.account_code;
    const entry = byCode.get(key) ?? {
      code: r.account_code,
      name: r.account_name,
      amount: 0,
      kind: r.account_class,
      sort: r.sort_order,
    };
    entry.amount += Number(r.income_amount || 0) + Number(r.expense_amount || 0);
    byCode.set(key, entry);
  }
  const all = [...byCode.values()].sort((a, b) => a.sort - b.sort);
  const income = all.filter((r) => r.kind === "income" && r.amount !== 0);
  const expenses = all.filter((r) => r.kind === "expense" && r.amount !== 0);
  const totalIncome = income.reduce((t, r) => t + r.amount, 0);
  const totalExpenses = expenses.reduce((t, r) => t + r.amount, 0);
  return {
    income: income.map(({ code, name, amount }) => ({ code, name, amount })),
    expenses: expenses.map(({ code, name, amount }) => ({ code, name, amount })),
    totalIncome,
    totalExpenses,
    netResult: totalIncome - totalExpenses,
  };
};

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const fetchLoanPortfolio = () =>
  readAll<LoanPortfolioRow>("v_loan_portfolio", "loan_number");

export const fetchRepaymentAllocations = async (
  range: DateRange = {},
): Promise<RepaymentAllocationRow[]> => {
  let q = supabase
    .from("v_repayment_allocation")
    .select("*")
    .order("payment_date", { ascending: false });
  if (range.from) q = q.gte("payment_date", range.from);
  if (range.to) q = q.lte("payment_date", range.to);
  const { data, error } = await q;
  if (error) throw failed("collections", error.message);
  return (data || []) as RepaymentAllocationRow[];
};

export const fetchParAgeing = () => readAll<ParAgeingRow>("v_par_ageing", "par_bucket");
export const fetchBranchFinancials = () =>
  readAll<BranchFinancialsRow>("v_branch_financials", "branch_name");
export const fetchOfficerPerformance = () =>
  readAll<OfficerPerformanceRow>("v_officer_performance", "officer_name");
export const fetchBorrowerStatements = () =>
  readAll<BorrowerStatementRow>("v_borrower_statement", "full_name");

// ---------------------------------------------------------------------------
// Reconciliation and health
// ---------------------------------------------------------------------------

export const fetchReconciliations = () =>
  readAll<AccountReconciliationRow>("v_account_reconciliation", "account_code");

/**
 * Any row here is a financial fact the ledger has lost track of — the failure
 * that started this programme. It should always be empty, and the Financial
 * Ledger surfaces it rather than waiting for an audit to find it.
 */
export const fetchLedgerHealth = async (): Promise<LedgerHealthRow[]> => {
  const { data, error } = await supabase.from("v_ledger_health").select("*");
  if (error) throw failed("the ledger health check", error.message);
  return (data || []) as LedgerHealthRow[];
};

// ---------------------------------------------------------------------------
// Shared shaping used by more than one report
// ---------------------------------------------------------------------------

export const PAR_BUCKET_ORDER = ["Current", "1-7", "8-30", "31-60", "61-90", "90+"] as const;

export interface CashFlowSummary {
  openingBalance: number;
  capitalIntroduced: number;
  capitalWithdrawn: number;
  loanRepayments: number;
  feeIncome: number;
  otherIncome: number;
  loanDisbursements: number;
  expenses: number;
  securityRefunds: number;
  adjustments: number;
  /** Shown for transparency; nets to nil and is excluded from the movement. */
  internalTransfersIn: number;
  internalTransfersOut: number;
  netMovement: number;
  closingBalance: number;
}

/**
 * Folds cash-flow rows into a statement.
 *
 * Internal transfers are reported but excluded from the net movement: moving
 * money from the bank to the till changes nothing about how much Chetu has,
 * and letting it through would inflate both sides.
 */
export const summariseCashFlow = (rows: CashFlowRow[], openingBalance = 0): CashFlowSummary => {
  const sum = (predicate: (r: CashFlowRow) => boolean) =>
    rows.filter(predicate).reduce((t, r) => t + Number(r.cash_movement || 0), 0);

  const internalIn = rows
    .filter((r) => r.is_internal_transfer)
    .reduce((t, r) => t + Number(r.cash_in || 0), 0);
  const internalOut = rows
    .filter((r) => r.is_internal_transfer)
    .reduce((t, r) => t + Number(r.cash_out || 0), 0);

  const capitalIntroduced = sum((r) => r.entry_type === "capital_injection");
  const capitalWithdrawn = -sum((r) => r.entry_type === "capital_withdrawal");
  const loanRepayments = sum((r) => r.entry_type === "repayment");
  const feeIncome = sum((r) => r.entry_type === "fee_collection");
  const otherIncome = sum((r) => r.entry_type === "other_income");
  const loanDisbursements = -sum((r) => r.entry_type === "disbursement");
  const expenses = -sum((r) => r.entry_type === "expense");
  const securityRefunds = -sum((r) => r.entry_type === "security_refund");
  const adjustments = sum(
    (r) =>
      r.entry_type === "reconciliation_adjustment" ||
      r.entry_type === "opening_balance" ||
      r.entry_type === "reversal",
  );

  const netMovement = sum((r) => !r.is_internal_transfer);

  return {
    openingBalance,
    capitalIntroduced,
    capitalWithdrawn,
    loanRepayments,
    feeIncome,
    otherIncome,
    loanDisbursements,
    expenses,
    securityRefunds,
    adjustments,
    internalTransfersIn: internalIn,
    internalTransfersOut: internalOut,
    netMovement,
    closingBalance: openingBalance + netMovement,
  };
};

/** Collections folded into expected, actual and rate. */
export interface CollectionsSummary {
  expected: number;
  actual: number;
  principal: number;
  interest: number;
  penalties: number;
  fees: number;
  missed: number;
  partial: number;
  overdueCollections: number;
  rate: number | null;
}

export const summariseCollections = (
  receipts: RepaymentAllocationRow[],
  portfolio: LoanPortfolioRow[],
): CollectionsSummary => {
  const actual = receipts.reduce((t, r) => t + Number(r.amount_paid || 0), 0);
  const overdueDue = portfolio.reduce((t, l) => t + Number(l.overdue_amount || 0), 0);
  const expected = actual + overdueDue;
  return {
    expected,
    actual,
    principal: receipts.reduce((t, r) => t + Number(r.principal_portion || 0), 0),
    interest: receipts.reduce((t, r) => t + Number(r.interest_portion || 0), 0),
    penalties: receipts.reduce((t, r) => t + Number(r.penalty_portion || 0), 0),
    fees: receipts.reduce((t, r) => t + Number(r.fee_portion || 0), 0),
    missed: overdueDue,
    partial: receipts.filter((r) => r.was_overdue).length,
    overdueCollections: receipts
      .filter((r) => r.was_overdue)
      .reduce((t, r) => t + Number(r.amount_paid || 0), 0),
    rate: expected > 0 ? (actual / expected) * 100 : null,
  };
};
