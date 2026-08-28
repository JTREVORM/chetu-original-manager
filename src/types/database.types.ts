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
