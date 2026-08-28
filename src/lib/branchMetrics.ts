/**
 * Branch Network figures.
 *
 * Every number the Branch Network module shows is derived here, from rows the
 * DatabaseContext has already fetched and scoped. Nothing is estimated and
 * nothing is stored: a branch's portfolio, arrears and savings are always
 * recomputed from the underlying loans, receipts and accounts, so a branch card
 * can never drift from the reports that read the same tables.
 *
 * Loans, repayments and savings accounts carry no branch_id of their own. They
 * belong to a branch through the member (or, for group accounts, the group)
 * that owns them — the same path `visibleLoans` takes in DatabaseContext.
 */
import type {
  BankTransaction,
  Client,
  ClientGroup,
  Expense,
  Loan,
  LoanApplication,
  LoanProduct,
  LoanRepayment,
  SavingsAccount,
  SavingsTransaction,
} from "../types/database.types";
import { CLOSED_LOAN_STATUSES } from "../types/database.types";
import {
  daysPastDue,
  overdueAsOf,
  realizableOn,
  type ScheduleRow,
} from "../pages/reports/reportData";

export interface BranchDataSources {
  clients: Client[];
  clientGroups: ClientGroup[];
  loans: Loan[];
  loanApplications: LoanApplication[];
  repayments: LoanRepayment[];
  savingsAccounts: SavingsAccount[];
  savingsTransactions: SavingsTransaction[];
  expenses: Expense[];
  bankTransactions: BankTransaction[];
}

export interface BranchSlice {
  branchId: string;
  clients: Client[];
  groups: ClientGroup[];
  loans: Loan[];
  applications: LoanApplication[];
  repayments: LoanRepayment[];
  savingsAccounts: SavingsAccount[];
  savingsTransactions: SavingsTransaction[];
  expenses: Expense[];
  bankTransactions: BankTransaction[];
}

export interface TrendPoint {
  date: string;
  label: string;
  collected: number;
  disbursed: number;
  deposits: number;
  withdrawals: number;
  due: number;
}

export interface ProductSlice {
  productId: string;
  name: string;
  outstanding: number;
  count: number;
}

export interface OfficerPerformance {
  officerId: string;
  members: number;
  groups: number;
  activeLoans: number;
  outstanding: number;
  collectedToday: number;
  collectedMonth: number;
  par30: number;
}

export interface BranchMetrics {
  members: { total: number; active: number; pending: number; dormant: number; new30: number };
  groups: { total: number; active: number };
  loans: {
    total: number;
    active: number;
    pending: number;
    approved: number;
    disbursedToDate: number;
    overdue: number;
    closed: number;
    writtenOff: number;
  };
  portfolio: {
    outstanding: number;
    principalDisbursed: number;
    arrears: number;
    par30Amount: number;
    par30Ratio: number;
    byProduct: ProductSlice[];
  };
  savings: {
    balance: number;
    accounts: number;
    depositsToday: number;
    withdrawalsToday: number;
    netToday: number;
    depositsYesterday: number;
    withdrawalsYesterday: number;
  };
  collections: {
    today: number;
    yesterday: number;
    week: number;
    month: number;
    dueToday: number;
    rate: number;
  };
  disbursements: { today: number; yesterday: number; month: number };
  cash: {
    bankDeposits: number;
    bankWithdrawals: number;
    bankBalance: number;
    expensesMonth: number;
    receiptsToday: number;
    paymentsToday: number;
  };
}

export const isoDay = (d: Date) => d.toISOString().split("T")[0];
export const daysAgo = (n: number, from = new Date()) =>
  isoDay(new Date(from.getTime() - n * 86400000));

const sum = <T>(rows: T[], pick: (row: T) => number | undefined | null) =>
  rows.reduce((total, row) => total + Number(pick(row) || 0), 0);

const dayOf = (timestamp?: string | null) => (timestamp ? timestamp.split("T")[0] : "");

/**
 * Split every collection into per-branch buckets in a single pass, so a network
 * of any size costs one walk of each table rather than one per branch.
 */
export function buildBranchSlices(
  sources: BranchDataSources,
  branchIds: string[],
): Map<string, BranchSlice> {
  const slices = new Map<string, BranchSlice>();
  for (const id of branchIds) {
    slices.set(id, {
      branchId: id,
      clients: [],
      groups: [],
      loans: [],
      applications: [],
      repayments: [],
      savingsAccounts: [],
      savingsTransactions: [],
      expenses: [],
      bankTransactions: [],
    });
  }

  const branchOfClient = new Map<string, string>();
  const branchOfGroup = new Map<string, string>();
  const branchOfAccount = new Map<string, string>();

  for (const group of sources.clientGroups) {
    if (!group.branch_id) continue;
    branchOfGroup.set(group.id, group.branch_id);
    slices.get(group.branch_id)?.groups.push(group);
  }
  for (const client of sources.clients) {
    if (!client.branch_id) continue;
    branchOfClient.set(client.id, client.branch_id);
    slices.get(client.branch_id)?.clients.push(client);
  }
  for (const loan of sources.loans) {
    const branchId = branchOfClient.get(loan.client_id);
    if (branchId) slices.get(branchId)?.loans.push(loan);
  }
  for (const application of sources.loanApplications) {
    const branchId = branchOfClient.get(application.client_id);
    if (branchId) slices.get(branchId)?.applications.push(application);
  }
  for (const repayment of sources.repayments) {
    const branchId = branchOfClient.get(repayment.client_id);
    if (branchId) slices.get(branchId)?.repayments.push(repayment);
  }
  for (const account of sources.savingsAccounts) {
    const branchId = account.client_id
      ? branchOfClient.get(account.client_id)
      : account.group_id
        ? branchOfGroup.get(account.group_id)
        : undefined;
    if (!branchId) continue;
    branchOfAccount.set(account.id, branchId);
    slices.get(branchId)?.savingsAccounts.push(account);
  }
  for (const transaction of sources.savingsTransactions) {
    const branchId = branchOfAccount.get(transaction.account_id);
    if (branchId) slices.get(branchId)?.savingsTransactions.push(transaction);
  }
  for (const expense of sources.expenses) {
    if (expense.branch_id) slices.get(expense.branch_id)?.expenses.push(expense);
  }
  for (const transaction of sources.bankTransactions) {
    if (transaction.branch_id)
      slices.get(transaction.branch_id)?.bankTransactions.push(transaction);
  }

  return slices;
}

export const emptySlice = (branchId: string): BranchSlice => ({
  branchId,
  clients: [],
  groups: [],
  loans: [],
  applications: [],
  repayments: [],
  savingsAccounts: [],
  savingsTransactions: [],
  expenses: [],
  bankTransactions: [],
});

export function branchMetrics(
  slice: BranchSlice,
  products: LoanProduct[] = [],
  asOn = isoDay(new Date()),
): BranchMetrics {
  const yesterday = daysAgo(1, new Date(`${asOn}T12:00:00`));
  const monthStart = `${asOn.slice(0, 7)}-01`;
  const thirtyDaysAgo = daysAgo(30, new Date(`${asOn}T12:00:00`));

  const openLoans = slice.loans.filter(
    (l) => !CLOSED_LOAN_STATUSES.includes(l.status) && l.status !== "Pending",
  );
  const outstanding = sum(openLoans, (l) => l.outstanding_balance);

  let arrears = 0;
  let par30Amount = 0;
  for (const loan of openLoans) {
    const schedule = (loan.schedule || []) as ScheduleRow[];
    arrears += overdueAsOf(schedule, asOn);
    if (daysPastDue(schedule, asOn) > 30) par30Amount += Number(loan.outstanding_balance || 0);
  }

  const productNames = new Map(products.map((p) => [p.id, p.product_name]));
  const byProductMap = new Map<string, ProductSlice>();
  for (const loan of openLoans) {
    const entry = byProductMap.get(loan.product_id) || {
      productId: loan.product_id,
      name: productNames.get(loan.product_id) || "Unassigned product",
      outstanding: 0,
      count: 0,
    };
    entry.outstanding += Number(loan.outstanding_balance || 0);
    entry.count += 1;
    byProductMap.set(loan.product_id, entry);
  }

  const dueToday = openLoans.reduce(
    (total, loan) => total + realizableOn((loan.schedule || []) as ScheduleRow[], asOn),
    0,
  );
  const collectedToday = sum(
    slice.repayments.filter((r) => r.payment_date === asOn),
    (r) => r.amount_paid,
  );

  const deposits = slice.savingsTransactions.filter((t) => t.transaction_type === "Deposit");
  const withdrawals = slice.savingsTransactions.filter((t) => t.transaction_type === "Withdrawal");
  const depositsToday = sum(
    deposits.filter((t) => dayOf(t.created_at) === asOn),
    (t) => t.amount,
  );
  const withdrawalsToday = sum(
    withdrawals.filter((t) => dayOf(t.created_at) === asOn),
    (t) => t.amount,
  );

  const disbursedLoans = slice.loans.filter((l) => l.disbursed_at);
  const disbursedToday = sum(
    disbursedLoans.filter((l) => dayOf(l.disbursed_at) === asOn),
    (l) => l.principal_amount,
  );

  const bankDeposits = sum(
    slice.bankTransactions.filter((t) => t.transaction_type === "Deposit"),
    (t) => t.amount,
  );
  const bankWithdrawals = sum(
    slice.bankTransactions.filter((t) => t.transaction_type === "Withdrawal"),
    (t) => t.amount,
  );

  return {
    members: {
      total: slice.clients.length,
      active: slice.clients.filter((c) => c.status === "Active" && c.approval_status === "Approved")
        .length,
      pending: slice.clients.filter((c) => c.approval_status === "Pending").length,
      dormant: slice.clients.filter((c) => c.status !== "Active").length,
      new30: slice.clients.filter(
        (c) => (c.date_registered || dayOf(c.created_at)) >= thirtyDaysAgo,
      ).length,
    },
    groups: {
      total: slice.groups.length,
      active: slice.groups.filter((g) => g.status === "Active" && g.approval_status === "Approved")
        .length,
    },
    loans: {
      total: slice.loans.length,
      active: openLoans.length,
      pending: slice.applications.filter((a) => a.status === "Pending").length,
      approved: slice.applications.filter((a) => a.status === "Approved").length,
      disbursedToDate: disbursedLoans.length,
      overdue: openLoans.filter((l) => daysPastDue((l.schedule || []) as ScheduleRow[], asOn) > 0)
        .length,
      closed: slice.loans.filter((l) => CLOSED_LOAN_STATUSES.includes(l.status)).length,
      writtenOff: slice.loans.filter((l) => l.status === "Written Off").length,
    },
    portfolio: {
      outstanding,
      principalDisbursed: sum(disbursedLoans, (l) => l.principal_amount),
      arrears,
      par30Amount,
      par30Ratio: outstanding > 0 ? (par30Amount / outstanding) * 100 : 0,
      byProduct: [...byProductMap.values()].sort((a, b) => b.outstanding - a.outstanding),
    },
    savings: {
      balance: sum(slice.savingsAccounts, (a) => a.balance),
      accounts: slice.savingsAccounts.length,
      depositsToday,
      withdrawalsToday,
      netToday: depositsToday - withdrawalsToday,
      depositsYesterday: sum(
        deposits.filter((t) => dayOf(t.created_at) === yesterday),
        (t) => t.amount,
      ),
      withdrawalsYesterday: sum(
        withdrawals.filter((t) => dayOf(t.created_at) === yesterday),
        (t) => t.amount,
      ),
    },
    collections: {
      today: collectedToday,
      yesterday: sum(
        slice.repayments.filter((r) => r.payment_date === yesterday),
        (r) => r.amount_paid,
      ),
      week: sum(
        slice.repayments.filter((r) => r.payment_date >= daysAgo(6, new Date(`${asOn}T12:00:00`))),
        (r) => r.amount_paid,
      ),
      month: sum(
        slice.repayments.filter((r) => r.payment_date >= monthStart),
        (r) => r.amount_paid,
      ),
      dueToday,
      rate: dueToday > 0 ? (collectedToday / dueToday) * 100 : collectedToday > 0 ? 100 : 0,
    },
    disbursements: {
      today: disbursedToday,
      yesterday: sum(
        disbursedLoans.filter((l) => dayOf(l.disbursed_at) === yesterday),
        (l) => l.principal_amount,
      ),
      month: sum(
        disbursedLoans.filter((l) => dayOf(l.disbursed_at) >= monthStart),
        (l) => l.principal_amount,
      ),
    },
    cash: {
      bankDeposits,
      bankWithdrawals,
      bankBalance: bankDeposits - bankWithdrawals,
      expensesMonth: sum(
        slice.expenses.filter((e) => e.expense_date >= monthStart),
        (e) => e.amount,
      ),
      receiptsToday: collectedToday + depositsToday,
      paymentsToday:
        disbursedToday +
        withdrawalsToday +
        sum(
          slice.expenses.filter((e) => e.expense_date === asOn),
          (e) => e.amount,
        ),
    },
  };
}

/**
 * Daily movement for the branch dashboard charts. Kept out of `branchMetrics`
 * because walking every instalment row for each of thirty days is far too much
 * work to repeat for every branch on the network list, which never plots it.
 */
export function branchTrend(
  slice: BranchSlice,
  days = 30,
  asOn = isoDay(new Date()),
): TrendPoint[] {
  const anchor = new Date(`${asOn}T12:00:00`);
  const openLoans = slice.loans.filter(
    (l) => !CLOSED_LOAN_STATUSES.includes(l.status) && l.status !== "Pending",
  );
  const disbursedLoans = slice.loans.filter((l) => l.disbursed_at);
  const deposits = slice.savingsTransactions.filter((t) => t.transaction_type === "Deposit");
  const withdrawals = slice.savingsTransactions.filter((t) => t.transaction_type === "Withdrawal");

  const points: TrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = daysAgo(offset, anchor);
    points.push({
      date,
      label: new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      collected: sum(
        slice.repayments.filter((r) => r.payment_date === date),
        (r) => r.amount_paid,
      ),
      disbursed: sum(
        disbursedLoans.filter((l) => dayOf(l.disbursed_at) === date),
        (l) => l.principal_amount,
      ),
      deposits: sum(
        deposits.filter((t) => dayOf(t.created_at) === date),
        (t) => t.amount,
      ),
      withdrawals: sum(
        withdrawals.filter((t) => dayOf(t.created_at) === date),
        (t) => t.amount,
      ),
      due: openLoans.reduce(
        (total, loan) => total + realizableOn((loan.schedule || []) as ScheduleRow[], date),
        0,
      ),
    });
  }
  return points;
}

export interface NetworkMetrics {
  branchesTotal: number;
  branchesActive: number;
  activeShare: number;
  members: number;
  outstanding: number;
  savings: number;
  par30Amount: number;
  par30Ratio: number;
  collectionsToday: number;
  groups: number;
}

export function networkMetrics(
  branchStates: { status: string; metrics: BranchMetrics }[],
): NetworkMetrics {
  const outstanding = branchStates.reduce((t, b) => t + b.metrics.portfolio.outstanding, 0);
  const par30Amount = branchStates.reduce((t, b) => t + b.metrics.portfolio.par30Amount, 0);
  const active = branchStates.filter((b) => b.status === "Active").length;
  return {
    branchesTotal: branchStates.length,
    branchesActive: active,
    activeShare: branchStates.length > 0 ? (active / branchStates.length) * 100 : 0,
    members: branchStates.reduce((t, b) => t + b.metrics.members.total, 0),
    groups: branchStates.reduce((t, b) => t + b.metrics.groups.total, 0),
    outstanding,
    savings: branchStates.reduce((t, b) => t + b.metrics.savings.balance, 0),
    par30Amount,
    par30Ratio: outstanding > 0 ? (par30Amount / outstanding) * 100 : 0,
    collectionsToday: branchStates.reduce((t, b) => t + b.metrics.collections.today, 0),
  };
}

/** Per-officer figures for the branch Collections tab. */
export function officerPerformance(
  slice: BranchSlice,
  asOn = isoDay(new Date()),
): OfficerPerformance[] {
  const monthStart = `${asOn.slice(0, 7)}-01`;
  const byOfficer = new Map<string, OfficerPerformance>();
  const branchOfClient = new Map(slice.clients.map((c) => [c.id, c.loan_officer_id || ""]));

  const ensure = (officerId: string) => {
    const existing = byOfficer.get(officerId);
    if (existing) return existing;
    const created: OfficerPerformance = {
      officerId,
      members: 0,
      groups: 0,
      activeLoans: 0,
      outstanding: 0,
      collectedToday: 0,
      collectedMonth: 0,
      par30: 0,
    };
    byOfficer.set(officerId, created);
    return created;
  };

  for (const client of slice.clients) ensure(client.loan_officer_id || "").members += 1;
  for (const group of slice.groups) ensure(group.loan_officer_id || "").groups += 1;

  for (const loan of slice.loans) {
    if (CLOSED_LOAN_STATUSES.includes(loan.status) || loan.status === "Pending") continue;
    const officer = ensure(branchOfClient.get(loan.client_id) || "");
    officer.activeLoans += 1;
    officer.outstanding += Number(loan.outstanding_balance || 0);
    if (daysPastDue((loan.schedule || []) as ScheduleRow[], asOn) > 30) {
      officer.par30 += Number(loan.outstanding_balance || 0);
    }
  }

  for (const repayment of slice.repayments) {
    const officer = ensure(branchOfClient.get(repayment.client_id) || "");
    if (repayment.payment_date === asOn)
      officer.collectedToday += Number(repayment.amount_paid || 0);
    if (repayment.payment_date >= monthStart)
      officer.collectedMonth += Number(repayment.amount_paid || 0);
  }

  return [...byOfficer.values()].sort((a, b) => b.outstanding - a.outstanding);
}

/** Percentage change against a prior period, guarding the divide-by-zero case. */
export const changeVs = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
};
