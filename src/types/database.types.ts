export type UserRole = "Administrator" | "Branch Manager" | "Loan Officer" | "Auditor";

export type ClientStatus = "Active" | "Inactive" | "Blacklisted";
export type ClientApprovalStatus = "Pending" | "Approved" | "Rejected";
export type ApplicationStatus = "Pending" | "Approved" | "Rejected" | "Disbursed";
export type LoanStatus =
  | "Pending"
  | "Active"
  | "Partially Paid"
  | "Fully Paid"
  | "Overdue"
  | "Defaulted"
  | "Settled"
  | "Written Off";

/** Terminal states — a loan in one of these is closed and cannot take collections. */
export const CLOSED_LOAN_STATUSES: LoanStatus[] = ["Fully Paid", "Settled", "Written Off"];

/**
 * Every state in which a disbursed loan is still carrying a receivable.
 *
 * `Partially Paid` is the one that matters: `recordRepayment` moves a loan
 * there the moment its first instalment is collected. Collection screens used
 * to filter on a hand-written `["Active", "Overdue", "Defaulted"]`, so a member
 * vanished from their group's list the week after they first paid and never
 * came back — the loan was still owed, still in arrears, and invisible.
 *
 * Define the set once and read it everywhere. A literal status array in a
 * screen is how that bug happened.
 */
export const OPEN_LOAN_STATUSES: LoanStatus[] = [
  "Active",
  "Partially Paid",
  "Overdue",
  "Defaulted",
];

/**
 * True when a loan should appear on a collection screen: still open, and still
 * owing money. `Pending` is excluded — it has not been disbursed, so there is
 * no cash out and nothing to collect.
 */
export const isCollectibleLoan = (loan: {
  status: LoanStatus;
  outstanding_balance: number | string;
}): boolean =>
  OPEN_LOAN_STATUSES.includes(loan.status) && Number(loan.outstanding_balance || 0) > 0;

export type LoanReversalType = "Disbursement" | "Repayment" | "Settlement" | "Write Off";
export type RepaymentStatus = "Pending" | "Paid" | "Partially Paid" | "Overdue";
export type InterestType = "Flat Rate" | "Reducing Balance";

export type ExpenseCategory =
  | "Salaries"
  | "Rent"
  | "Fuel"
  | "Utilities"
  | "Internet"
  | "Maintenance"
  | "Transport"
  | "Office Supplies"
  | "Other";

export type PaymentMethod = "Cash" | "Bank Transfer" | "Mobile Money";
export type TransactionType = "Deposit" | "Withdrawal";
export type SavingsTransactionType = "Deposit" | "Withdrawal" | "Interest";

export type BranchType = "Head Office" | "Main Branch" | "Satellite Branch" | "Field Office";
export type BranchApprovalLevel = "Branch" | "Regional" | "Head Office";

export interface Branch {
  id: string;
  branch_name: string;
  branch_code: string;
  location?: string;
  phone?: string;
  /** Mirrored from the manager's profile by trigger; read it, never write it. */
  manager_name?: string;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at?: string;
  branch_type: BranchType;
  region?: string | null;
  district?: string | null;
  town?: string | null;
  physical_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  alt_phone?: string | null;
  email?: string | null;
  manager_id?: string | null;
  assistant_manager_id?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  working_days?: string[] | null;
  currency?: string | null;
  max_cash_holding?: number | null;
  approval_level?: BranchApprovalLevel | null;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  deactivation_reason?: string | null;
}

export interface Profile {
  id: string;
  phone_number: string;
  full_name: string;
  role: UserRole;
  email?: string;
  password?: string;
  avatar_url?: string;
  /** Branches this staff member is attached to. Empty/undefined for Administrators and Auditors (institution-wide). */
  branch_ids?: string[];
  status: StaffStatus;
  created_at: string;
  updated_at?: string;

  /** Allocated by a database trigger on insert — never built client-side. */
  staff_code?: string | null;
  date_joined?: string | null;
  /** The branch this person reports to, drawn from `branch_ids`. */
  primary_branch_id?: string | null;
  last_login_at?: string | null;
  last_password_change_at?: string | null;
  failed_login_attempts?: number;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
  /** Why the account is Suspended or Inactive, and when it was put there. */
  status_reason?: string | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
}

/**
 * `Pending` is an account that has been created but never signed into. It
 * becomes `Active` by itself at the holder's first successful sign-in.
 */
export type StaffStatus = "Active" | "Pending" | "Inactive" | "Suspended";

export interface LoanOfficer {
  id: string;
  profile_id: string;
  officer_code: string;
  branch: string;
  phone: string;
  status: "Active" | "Inactive";
  registered_clients_count: number;
  active_loans_count: number;
  created_at: string;
  profile?: Profile;
}

export interface Client {
  id: string;
  client_number: string;
  full_name: string;
  passport_photo?: string;
  national_id_front?: string;
  national_id_back?: string;
  nin: string;
  gender: "Male" | "Female" | "Other";
  date_of_birth: string;
  occupation: string;
  employer?: string;
  phone_number: string;
  alt_phone_number?: string;
  email?: string;
  physical_address: string;
  village: string;
  parish: string;
  sub_county: string;
  district: string;
  group_id?: string;
  branch_id?: string;
  registered_by?: string;
  date_registered: string;
  status: ClientStatus;
  voter_id?: string;
  marital_status?: string;
  member_type?: string;
  loan_officer_id?: string;
  inactive_reason?: string;
  inactive_date?: string;
  death_date?: string;
  rejection_reason?: string | null;
  readmitted_at?: string;
  approval_status: ClientApprovalStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  uploaded_by?: string;
  uploaded_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  client_id: string;
  role_in_group: "Chairperson" | "Secretary" | "Treasurer" | "Member";
  joined_date: string;
  created_at?: string;
  client?: Client;
}

export interface ClientGroup {
  id: string;
  group_name: string;
  group_code: string;
  chairperson?: string;
  secretary?: string;
  treasurer?: string;
  village?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
  meeting_frequency?: string;
  formation_date?: string;

  branch: string;
  branch_id?: string;
  loan_officer_id?: string;
  loan_officer_name?: string;
  member_count: number;
  status: "Active" | "Inactive" | "Suspended";
  approval_status: "Pending" | "Approved" | "Rejected";
  rejection_reason?: string | null;
  reviewed_by?: string;
  reviewed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  group_savings?: number;
  group_loans?: number;
  members?: GroupMember[];
}

export interface GroupAttendance {
  id: string;
  group_id: string;
  meeting_date: string;
  attendees: string[]; // array of client IDs
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface SavingsAccount {
  id: string;
  account_number: string;
  client_id?: string;
  group_id?: string;
  account_type: "Individual" | "Group";
  balance: number;
  status: "Active" | "Dormant" | "Closed";
  created_at: string;
  updated_at?: string;
  client?: Client;
  group?: ClientGroup;
}

export interface SavingsTransaction {
  id: string;
  transaction_number: string;
  account_id: string;
  transaction_type: SavingsTransactionType;
  amount: number;
  balance_after: number;
  payment_method: PaymentMethod;
  recorded_by?: string;
  receipt_number: string;
  notes?: string;
  created_at: string;
  account?: SavingsAccount;
}

export interface LoanProduct {
  id: string;
  product_name: string;
  description: string;
  interest_rate: number; // percentage (e.g. 15.0)
  interest_type: InterestType;
  processing_fee_percentage: number;
  penalty_rate: number; // penalty percentage per week overdue
  grace_period_weeks: number;
  min_amount: number;
  max_amount: number;
  min_weeks: number;
  max_weeks: number;
  status: "Active" | "Inactive";
  created_at: string;
}

export interface LoanApplication {
  id: string;
  application_number: string;
  client_id: string;
  product_id: string;
  requested_amount: number;
  requested_weeks: number;
  loan_purpose: string;
  guarantor_name: string;
  guarantor_phone: string;
  guarantor_relationship: string;
  guarantor_nin: string;
  guarantor_address: string;
  guarantor2_name?: string;
  guarantor2_phone?: string;
  guarantor2_relationship?: string;
  guarantor2_nin?: string;
  guarantor2_address?: string;
  client_photo?: string;
  supporting_docs?: string[];
  status: ApplicationStatus;
  submitted_by?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
  // Joined properties
  client?: Client;
  product?: LoanProduct;
}

export interface WeeklyScheduleRow {
  id?: string;
  loan_id?: string;
  week_number: number;
  due_date: string;
  installment_amount: number;
  principal_portion: number;
  interest_portion: number;
  paid_amount: number;
  /**
   * What is still owed on **this instalment alone**: `installment_amount -
   * paid_amount`, never negative.
   *
   * The column used to carry two different meanings. `calculateLoanSchedule`
   * wrote the running balance of the whole loan after each week, while
   * `recordRepayment` overwrote the same field with the shortfall on that one
   * row — so a loan read one way before its first payment and the other way
   * after. Every consumer wants the per-instalment reading: the schedule tables
   * and CSV exports put it in a column headed "Balance" beside "Paid", and the
   * Audit Dashboard *sums* it across unpaid rows, which is meaningless against a
   * descending running total.
   *
   * Treat it as derived. `summariseSchedule` recomputes it from the amounts
   * rather than trusting the stored figure, so a legacy row written under the
   * old meaning still displays correctly before any repair runs.
   */
  remaining_balance: number;
  status: RepaymentStatus;
  paid_at?: string;
}

export interface Loan {
  id: string;
  loan_number: string;
  application_id: string;
  client_id: string;
  product_id: string;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  loan_period_weeks: number;
  total_interest_amount: number;
  total_amount_payable: number;
  weekly_installment: number;
  processing_fee_amount: number;
  crb_fee_amount?: number;
  group_maintenance_fee?: number;
  net_disbursed_amount?: number | null;
  first_repayment_date: string;
  final_due_date: string;
  outstanding_balance: number;
  completion_percentage: number;
  status: LoanStatus;
  approved_by?: string;
  disbursed_by?: string;
  disbursed_at?: string;
  security_amount?: number;
  security_balance?: number;
  cycle_number?: number;
  is_bad_debt?: boolean;
  bad_debt_declared_at?: string;
  bad_debt_comment?: string;
  writeoff_status?: string;
  settled_at?: string | null;
  settlement_amount?: number | null;
  settled_by?: string | null;
  writeoff_at?: string | null;
  writeoff_amount?: number | null;
  writeoff_reason?: string | null;
  writeoff_by?: string | null;
  created_at: string;
  updated_at?: string;
  // Joined properties
  client?: Client;
  product?: LoanProduct;
  schedule?: WeeklyScheduleRow[];
}

export type TransferType = "Member Branch" | "Group Interchange" | "Group Officer";
export type TransferStatus = "Pending" | "Completed" | "Rejected";

export interface Transfer {
  id: string;
  transfer_type: TransferType;
  client_id?: string | null;
  group_id?: string | null;
  from_branch_id?: string | null;
  to_branch_id?: string | null;
  from_group_id?: string | null;
  to_group_id?: string | null;
  from_officer_id?: string | null;
  to_officer_id?: string | null;
  status: TransferStatus;
  reason?: string | null;
  rejection_reason?: string | null;
  requested_by?: string | null;
  requested_at: string;
  actioned_by?: string | null;
  actioned_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LoanReversal {
  id: string;
  loan_id: string;
  reversal_type: LoanReversalType;
  reference_number?: string | null;
  amount: number;
  reason: string;
  reversed_by?: string | null;
  created_at: string;
}

export interface LoanRepayment {
  id: string;
  repayment_number: string;
  loan_id: string;
  schedule_id?: string;
  client_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: PaymentMethod;
  recorded_by?: string;
  receipt_number: string;
  notes?: string;
  collection_type?: string;
  security_amount?: number;
  /**
   * How the receipt splits.
   *
   * Derived from the instalment's frozen principal/interest ratio and stored
   * on the row, so every screen reads the same split instead of each one
   * re-deriving it differently. The four always sum to `amount_paid`, which
   * the database enforces.
   *
   * `penalty_portion` is zero throughout: production has no penalty logic and
   * no historical penalty was invented for it.
   */
  principal_portion?: number;
  interest_portion?: number;
  penalty_portion?: number;
  fee_portion?: number;
  /** schedule_backfill | schedule_auto | posted | unallocated_principal */
  allocation_source?: string | null;
  created_at: string;
  // Joined
  loan?: Loan;
  client?: Client;
}

export interface Expense {
  id: string;
  expense_number: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: PaymentMethod;
  receipt_url?: string;
  branch_id?: string;
  recorded_by?: string;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  category: string;
  description: string;
  amount: number;
  balance_after: number;
  reference_number: string;
  transaction_date: string;
  branch_id?: string;
  recorded_by?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id?: string;
  title: string;
  message: string;
  type: "Application" | "Repayment" | "Overdue" | "Disbursement" | "Alert" | "System";
  is_read: boolean;
  link_url?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_name: string;
  user_role: UserRole;
  action: string;
  module: string;
  record_id?: string;
  details: string;
  ip_address: string;
  device_info?: string;
  created_at: string;
}

export interface SystemSettings {
  id: number;
  company_name: string;
  company_logo_url?: string;
  default_currency: string;
  branches: string[];
  default_interest_rate: number;
  default_processing_fee: number;
  receipt_footer: string;
  report_header: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Financial ledger
//
// Money moves through balanced journals: one `FinancialTransaction` per
// business event, two or more `FinancialTransactionLine`s that sum to zero.
// Balances are always derived — there is no stored balance anywhere in this
// model, which is what stops a figure drifting from the postings behind it.
// ---------------------------------------------------------------------------

/** Where money can sit, or the category it flows to. */
export type FinancialAccountType =
  // real money locations
  | "cash_at_hand"
  | "cashier_till"
  | "branch_cash"
  | "bank"
  | "mobile_money"
  | "merchant"
  // control accounts — only a posting function may touch these
  | "loans_receivable"
  | "interest_receivable"
  | "penalty_receivable"
  | "security_held"
  | "capital"
  | "income"
  | "expense"
  | "writeoff"
  // an amount whose proper classification is not yet determined
  | "suspense"
  | "other";

/** What the reports group by. */
export type FinancialAccountClass =
  "asset_liquid" | "asset_receivable" | "liability" | "equity" | "income" | "expense";

export type FinancialAccountStatus = "Active" | "Dormant" | "Closed";

export type FinancialEntryType =
  | "capital_injection"
  | "capital_withdrawal"
  | "disbursement"
  | "repayment"
  | "fee_collection"
  | "expense"
  | "internal_transfer"
  | "security_refund"
  | "writeoff"
  | "other_income"
  | "reconciliation_adjustment"
  | "opening_balance"
  | "legacy_backfill"
  | "reversal";

export type FinancialTransactionStatus = "posted" | "reversed" | "reversal";

export interface FinancialAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  account_class: FinancialAccountClass;
  branch_id?: string | null;
  institution?: string | null;
  account_reference?: string | null;
  description?: string | null;
  opening_balance: number;
  opening_balance_date?: string | null;
  currency: string;
  status: FinancialAccountStatus;
  is_system: boolean;
  is_legacy: boolean;
  allow_manual_posting: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** A row of `v_account_balances`: the account plus its derived position. */
export interface AccountBalance {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  account_class: FinancialAccountClass;
  branch_id?: string | null;
  branch_name?: string | null;
  institution?: string | null;
  account_reference?: string | null;
  currency: string;
  status: FinancialAccountStatus;
  is_system: boolean;
  is_legacy: boolean;
  opening_balance: number;
  opening_balance_date?: string | null;
  total_debits: number;
  total_credits: number;
  total_inflows: number;
  total_outflows: number;
  current_balance: number;
  natural_balance: number;
  last_transaction_at?: string | null;
  last_transaction_date?: string | null;
  posting_count: number;
  sort_order: number;
}

export interface FinancialTransactionLine {
  id: string;
  transaction_id: string;
  line_no: number;
  account_id: string;
  direction: "debit" | "credit";
  amount: number;
  signed_amount: number;
  memo?: string | null;
}

/** A row of `v_transaction_audit`. */
export interface FinancialTransactionRow {
  id: string;
  transaction_number: string;
  transaction_date: string;
  created_at: string;
  entry_type: FinancialEntryType;
  status: FinancialTransactionStatus;
  description: string;
  reference_number?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  loan_id?: string | null;
  loan_number?: string | null;
  repayment_id?: string | null;
  receipt_number?: string | null;
  expense_id?: string | null;
  expense_number?: string | null;
  member_fee_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  approval_status: string;
  approved_by?: string | null;
  approved_at?: string | null;
  reversal_of_id?: string | null;
  reverses_number?: string | null;
  reversal_reason?: string | null;
  reversed_by_number?: string | null;
  is_legacy: boolean;
  business_day_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_role?: string | null;
  amount: number;
  accounts?: string | null;
  source_account?: string | null;
  destination_account?: string | null;
}

/** The single row of `v_money_position`. */
export interface MoneyPosition {
  cash_at_hand: number;
  cash_at_bank: number;
  mobile_money: number;
  unclassified_legacy: number;
  total_available_liquidity: number;
  outstanding_principal: number;
  interest_receivable: number;
  penalties_receivable: number;
  total_loan_portfolio: number;
  overdue_portfolio: number;
  overdue_principal: number;
  par30_value: number;
  par30_count: number;
  active_loans: number;
  active_borrowers: number;
  capital_introduced: number;
  total_income: number;
  total_expenses: number;
  net_result: number;
  security_held: number;
  /** Historical funding whose source is unidentified. Not members' money, not capital. */
  unidentified_funding: number;
  /** Member security plus unidentified funding. What the net-worth figures subtract. */
  total_liabilities: number;
  /** Ledger-only assets: liquidity plus receivable control accounts. */
  total_assets_ledger: number;
  /** Ties exactly to the trial balance: capital + net result. */
  net_worth_ledger: number;
  /** Adds contracted-but-uncollected interest. Management view, not accounting. */
  total_assets: number;
  total_financial_position: number;
}

/** A row of `v_loan_portfolio`. */
export interface LoanPortfolioRow {
  loan_id: string;
  loan_number: string;
  client_id: string;
  client_name: string;
  client_number: string;
  branch_id?: string | null;
  branch_name?: string | null;
  officer_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  product_id: string;
  product_name?: string | null;
  status: LoanStatus;
  is_bad_debt: boolean;
  writeoff_status?: string | null;
  principal_amount: number;
  total_interest_amount: number;
  total_amount_payable: number;
  total_fees_charged: number;
  security_amount: number;
  security_balance: number;
  net_disbursed_amount?: number | null;
  disbursed_at?: string | null;
  first_repayment_date: string;
  final_due_date: string;
  loan_period_weeks: number;
  principal_collected: number;
  interest_collected: number;
  total_collected: number;
  principal_outstanding: number;
  interest_outstanding: number;
  total_outstanding: number;
  stored_outstanding_balance: number;
  overdue_amount: number;
  overdue_principal: number;
  overdue_interest: number;
  days_past_due: number;
  par_bucket: "Current" | "1-7" | "8-30" | "31-60" | "61-90" | "90+";
  created_at: string;
}

/** A row of `v_repayment_allocation`. */
export interface RepaymentAllocationRow {
  repayment_id: string;
  repayment_number: string;
  receipt_number: string;
  loan_id: string;
  loan_number?: string | null;
  client_id: string;
  client_name?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  officer_id?: string | null;
  payment_date: string;
  payment_method: PaymentMethod;
  collection_type: string;
  amount_paid: number;
  principal_portion: number;
  interest_portion: number;
  penalty_portion: number;
  fee_portion: number;
  security_amount: number;
  allocation_source?: string | null;
  schedule_id?: string | null;
  week_number?: number | null;
  due_date?: string | null;
  was_overdue: boolean;
  recorded_by?: string | null;
  created_at: string;
  journal_id?: string | null;
  journal_number?: string | null;
}

/** A row of `v_account_ledger`. */
export interface AccountLedgerRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_class: FinancialAccountClass;
  branch_id?: string | null;
  transaction_id: string;
  transaction_number: string;
  transaction_date: string;
  created_at: string;
  entry_type: FinancialEntryType;
  status: FinancialTransactionStatus;
  description: string;
  reference_number?: string | null;
  is_legacy: boolean;
  line_no: number;
  direction: "debit" | "credit";
  amount: number;
  signed_amount: number;
  memo?: string | null;
  running_balance: number;
  created_by?: string | null;
  loan_id?: string | null;
  repayment_id?: string | null;
  expense_id?: string | null;
}

/** A row of `v_cash_flow`. */
export interface CashFlowRow {
  transaction_date: string;
  branch_id?: string | null;
  branch_name?: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  entry_type: FinancialEntryType;
  flow_category: string;
  is_internal_transfer: boolean;
  cash_movement: number;
  cash_in: number;
  cash_out: number;
  transaction_id: string;
  transaction_number: string;
  description: string;
  is_legacy: boolean;
}

/** A row of `v_income_statement`. */
export interface IncomeStatementRow {
  account_class: "income" | "expense";
  account_code: string;
  account_name: string;
  sort_order: number;
  branch_id?: string | null;
  transaction_date: string;
  income_amount: number;
  expense_amount: number;
}

/** A row of `v_financial_position`. */
export interface FinancialPositionRow {
  section: "Assets" | "Liabilities" | "Capital & Equity" | "Result";
  account_class: FinancialAccountClass;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  branch_id?: string | null;
  branch_name?: string | null;
  amount: number;
  sort_order: number;
}

/** A row of `v_par_ageing`. */
export interface ParAgeingRow {
  par_bucket: string;
  branch_id?: string | null;
  branch_name?: string | null;
  officer_id?: string | null;
  product_name?: string | null;
  loan_count: number;
  overdue_principal: number;
  overdue_interest: number;
  overdue_total: number;
  principal_outstanding: number;
  total_outstanding: number;
}

/** A row of `v_branch_financials`. */
export interface BranchFinancialsRow {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  status: string;
  liquidity: number;
  principal_outstanding: number;
  interest_outstanding: number;
  total_outstanding: number;
  arrears: number;
  active_loans: number;
  principal_disbursed: number;
  total_collected: number;
  principal_collected: number;
  interest_collected: number;
  income: number;
  expenses: number;
  net_result: number;
}

/** A row of `v_officer_performance`. */
export interface OfficerPerformanceRow {
  officer_id: string;
  officer_name: string;
  role: UserRole;
  branch_ids?: string[] | null;
  active_loans: number;
  active_borrowers: number;
  principal_outstanding: number;
  portfolio_managed: number;
  amount_disbursed: number;
  expected_collections: number;
  actual_collections: number;
  overdue_portfolio: number;
  collection_rate?: number | null;
}

/** A row of `v_borrower_statement`. */
export interface BorrowerStatementRow {
  client_id: string;
  client_number: string;
  full_name: string;
  phone_number?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  loan_officer_id?: string | null;
  member_status: string;
  approval_status: string;
  fees_paid: number;
  loans_count: number;
  principal_disbursed: number;
  principal_outstanding: number;
  interest_outstanding: number;
  total_outstanding: number;
  overdue_amount: number;
  security_held: number;
  total_paid: number;
  principal_paid: number;
  interest_paid: number;
  last_payment_date?: string | null;
}

export interface AccountReconciliation {
  id: string;
  account_id: string;
  reconciled_on: string;
  system_balance: number;
  actual_balance: number;
  difference: number;
  statement_reference?: string | null;
  notes?: string | null;
  adjustment_reason?: string | null;
  adjustment_tx_id?: string | null;
  status: "Unresolved" | "Adjusted" | "Accepted";
  reconciled_by?: string | null;
  reconciled_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
}

/** A row of `v_account_reconciliation`. */
export interface AccountReconciliationRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  branch_id?: string | null;
  branch_name?: string | null;
  system_balance: number;
  actual_balance?: number | null;
  difference?: number | null;
  reconciled_on?: string | null;
  reconciled_at?: string | null;
  statement_reference?: string | null;
  notes?: string | null;
  adjustment_reason?: string | null;
  adjustment_tx_id?: string | null;
  reconciliation_status?: string | null;
  reconciled_by_name?: string | null;
  state: string;
}

/** A row of `v_ledger_health`. Any row is a problem. */
export interface LedgerHealthRow {
  check_name: string;
  subject_id?: string | null;
  subject_ref?: string | null;
  detail: string;
}

/** Accounts money can actually be posted through by an operator. */
export const LIQUID_ACCOUNT_TYPES: FinancialAccountType[] = [
  "cash_at_hand",
  "cashier_till",
  "branch_cash",
  "bank",
  "mobile_money",
  "merchant",
];

export const isPostableAccount = (
  a: Pick<FinancialAccount, "status" | "allow_manual_posting" | "account_class">,
) => a.status === "Active" && a.allow_manual_posting && a.account_class === "asset_liquid";
