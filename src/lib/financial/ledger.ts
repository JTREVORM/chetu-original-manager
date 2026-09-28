/**
 * The only way money moves.
 *
 * Every function here calls a `post_*` database function rather than writing a
 * table. That is deliberate, and it is the fix for the failure this module
 * exists because of: disbursement used to insert into `bank_transactions`
 * directly, row level security rejected it because the officer was not an
 * Administrator, and the caller threw the error away —
 *
 *     if (!txError && btData) { ...update local state... }
 *
 * so fifteen loans were disbursed with no financial entry and nobody knew.
 *
 * Two rules follow from that, and neither is negotiable:
 *
 *   1. The database checks the BUSINESS permission for the action, inside a
 *      SECURITY DEFINER function. Whoever may disburse a loan may post its
 *      journal. Nobody may write the ledger by hand.
 *   2. Nothing here swallows an error. Every call raises, so the operation
 *      fails as a whole rather than half-succeeding. A loan cannot be
 *      disbursed while its journal quietly disappears.
 */
import { supabase } from "../supabase";
import type { AccountBalance, FinancialAccount, PaymentMethod } from "../../types/database.types";

/**
 * A financial posting failed.
 *
 * Carried as its own class so callers can tell "the money did not move" apart
 * from an ordinary validation complaint, and so the message the database wrote
 * — which names the account, the branch or the permission — reaches the
 * operator instead of a generic "something went wrong".
 */
export class LedgerError extends Error {
  readonly code?: string;
  readonly operation: string;

  constructor(operation: string, message: string, code?: string) {
    super(message);
    this.name = "LedgerError";
    this.operation = operation;
    this.code = code;
  }
}

/** Turns a PostgREST error into something an operator can act on. */
const friendly = (
  operation: string,
  error: { message: string; code?: string; hint?: string | null },
) => {
  const raw = error.message || "The financial posting failed";
  // The database raises with a sentence already written for a human; Postgres
  // prefixes some of them. Strip the prefix, keep the sentence.
  const message = raw.replace(/^(ERROR|error):\s*/, "").trim();
  return new LedgerError(operation, message, error.code);
};

const rpc = async <T>(operation: string, fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw friendly(operation, error);
  return data as T;
};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const listAccounts = async (): Promise<FinancialAccount[]> => {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .order("sort_order")
    .order("account_name");
  if (error) throw friendly("list accounts", error);
  return (data || []) as FinancialAccount[];
};

export const listAccountBalances = async (): Promise<AccountBalance[]> => {
  const { data, error } = await supabase
    .from("v_account_balances")
    .select("*")
    .order("sort_order")
    .order("account_name");
  if (error) throw friendly("read account balances", error);
  return (data || []) as AccountBalance[];
};

/** The accounts an operator may choose as a source or destination. */
export const listPostableAccounts = async (branchId?: string | null): Promise<AccountBalance[]> => {
  const all = await listAccountBalances();
  return all.filter(
    (a) =>
      a.account_class === "asset_liquid" &&
      a.status === "Active" &&
      !a.is_system &&
      (!branchId || !a.branch_id || a.branch_id === branchId),
  );
};

export type NewAccount = Pick<
  FinancialAccount,
  "account_code" | "account_name" | "account_type" | "account_class"
> &
  Partial<
    Pick<
      FinancialAccount,
      "branch_id" | "institution" | "account_reference" | "description" | "currency" | "sort_order"
    >
  >;

export const createAccount = async (account: NewAccount): Promise<FinancialAccount> => {
  const { data, error } = await supabase
    .from("financial_accounts")
    .insert([{ ...account, currency: account.currency || "UGX" }])
    .select()
    .single();
  if (error) throw friendly("create account", error);
  return data as FinancialAccount;
};

export const updateAccount = async (
  id: string,
  changes: Partial<
    Pick<
      FinancialAccount,
      | "account_name"
      | "institution"
      | "account_reference"
      | "description"
      | "status"
      | "sort_order"
      | "branch_id"
    >
  >,
): Promise<FinancialAccount> => {
  const { data, error } = await supabase
    .from("financial_accounts")
    .update(changes)
    .eq("id", id)
    .select()
    .single();
  if (error) throw friendly("update account", error);
  return data as FinancialAccount;
};

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

export const postCapitalInjection = (args: {
  accountId: string;
  amount: number;
  date?: string;
  reference?: string | null;
  note?: string | null;
}) =>
  rpc<string>("record capital", "post_capital_injection", {
    _account_id: args.accountId,
    _amount: args.amount,
    _transaction_date: args.date ?? new Date().toISOString().slice(0, 10),
    _reference: args.reference ?? null,
    _note: args.note ?? null,
  });

export const postCapitalWithdrawal = (args: {
  accountId: string;
  amount: number;
  date?: string;
  reference?: string | null;
  note?: string | null;
}) =>
  rpc<string>("withdraw capital", "post_capital_withdrawal", {
    _account_id: args.accountId,
    _amount: args.amount,
    _transaction_date: args.date ?? new Date().toISOString().slice(0, 10),
    _reference: args.reference ?? null,
    _note: args.note ?? null,
  });

// The single-step postings are not exposed here, on purpose.
//
// `post_disbursement`, `post_repayment`, `post_expense`, `post_member_fee`,
// `post_security_refund` and `post_writeoff` each write a journal for a
// business record that some other statement was supposed to have written.
// That is one half of a financial event: a caller that posts one without the
// other produces the same inconsistency this module exists to prevent, only
// the other way round from the original bug.
//
// Each is now called by an atomic database function instead, and migration
// 002200 revoked EXECUTE from `authenticated`, so none can be reached from a
// browser at all. Use `disburseLoan`, `recordRepayment`, `settleLoan`,
// `writeOffLoan`, `recordExpense`, `recordMemberFee` or `returnLoanSecurity` —
// each of which is one transaction.

/** Moves money between Chetu's own accounts. Never income, never expense. */
export const postInternalTransfer = (args: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date?: string;
  reference?: string | null;
  note?: string | null;
}) =>
  rpc<string>("transfer between accounts", "post_internal_transfer", {
    _from_account_id: args.fromAccountId,
    _to_account_id: args.toAccountId,
    _amount: args.amount,
    _transaction_date: args.date ?? new Date().toISOString().slice(0, 10),
    _reference: args.reference ?? null,
    _note: args.note ?? null,
  });

/**
 * Admission and passbook fees, with the journal that records them.
 *
 * Charged once per member: the database returns the existing row rather than
 * charging twice, so a retried admission cannot double-count fee income.
 */
export const recordMemberFee = (args: {
  clientId: string;
  receivingAccountId: string;
  admissionFee: number;
  passbookFee: number;
  crbFee?: number;
  paymentMethod?: PaymentMethod;
  receiptNumber?: string | null;
}) =>
  rpc<
    {
      member_fee_id: string;
      receipt_number: string;
      transaction_id: string | null;
      total_amount: number;
      already_recorded: boolean;
    }[]
  >("record member fee", "record_member_fee", {
    _client_id: args.clientId,
    _receiving_account_id: args.receivingAccountId,
    _admission_fee: args.admissionFee,
    _passbook_fee: args.passbookFee,
    _crb_fee: args.crbFee ?? 0,
    _payment_method: args.paymentMethod ?? "Cash",
    _receipt_number: args.receiptNumber ?? null,
  });

/**
 * Release a member's security deposit.
 *
 * Cash leaving the building against a liability the ledger already carries, so
 * the refund record, the loan's remaining security and the journal that pays it
 * are one transaction.
 */
export const returnLoanSecurity = (args: {
  loanId: string;
  amount: number;
  sourceAccountId: string;
  returnDate?: string;
}) =>
  rpc<{ security_return_id: string; transaction_id: string; remaining_security: number }[]>(
    "return security",
    "return_loan_security",
    {
      _loan_id: args.loanId,
      _amount: args.amount,
      _source_account_id: args.sourceAccountId,
      _return_date: args.returnDate ?? null,
    },
  );

/**
 * Reverses a posted journal by mirroring every one of its lines and linking
 * back to the original, which is marked `reversed` rather than deleted.
 *
 * This replaces the old rollback, which posted an unrelated Deposit of the
 * principal. Because the matching debit had been silently rejected at
 * disbursement, that would have credited the ledger with money that never left.
 */
export const reverseTransaction = (transactionId: string, reason: string) =>
  rpc<string>("reverse transaction", "reverse_financial_transaction", {
    _transaction_id: transactionId,
    _reason: reason,
  });

export const postReconciliationAdjustment = (args: {
  accountId: string;
  amount: number;
  reason: string;
  date?: string;
  reference?: string | null;
}) =>
  rpc<string>("adjust for reconciliation", "post_reconciliation_adjustment", {
    _account_id: args.accountId,
    _amount: args.amount,
    _reason: args.reason,
    _transaction_date: args.date ?? new Date().toISOString().slice(0, 10),
    _reference: args.reference ?? null,
  });

/** Sets a real account's counted balance at cut-over. Once only, per account. */
export const postOpeningBalance = (args: {
  accountId: string;
  amount: number;
  asAt: string;
  note?: string | null;
}) =>
  rpc<string>("set opening balance", "post_opening_balance", {
    _account_id: args.accountId,
    _amount: args.amount,
    _as_at: args.asAt,
    _note: args.note ?? null,
  });

export const recordReconciliation = (args: {
  accountId: string;
  actualBalance: number;
  reconciledOn?: string;
  statementReference?: string | null;
  notes?: string | null;
  postAdjustment?: boolean;
  adjustmentReason?: string | null;
}) =>
  rpc<unknown>("record reconciliation", "record_account_reconciliation", {
    _account_id: args.accountId,
    _actual_balance: args.actualBalance,
    _reconciled_on: args.reconciledOn ?? new Date().toISOString().slice(0, 10),
    _statement_ref: args.statementReference ?? null,
    _notes: args.notes ?? null,
    _post_adjustment: args.postAdjustment ?? false,
    _adjustment_reason: args.adjustmentReason ?? null,
  });

// ---------------------------------------------------------------------------
// Picking a default account
// ---------------------------------------------------------------------------

/**
 * The account a collection or disbursement should default to, so an officer
 * taps once rather than choosing every time: their branch's cash account if
 * there is one, otherwise the institution-wide cash account, otherwise
 * whatever liquid account is available.
 *
 * `Cash`, `Bank Transfer` and `Mobile Money` on the existing forms describe the
 * INSTRUMENT, not the account. They are used only to bias this default —
 * never to infer where money ended up, which is the guess this whole
 * programme refuses to make.
 */
export const defaultAccountFor = (
  accounts: AccountBalance[],
  opts: { branchId?: string | null; method?: PaymentMethod } = {},
): AccountBalance | undefined => {
  const preferred: Record<PaymentMethod, string[]> = {
    Cash: ["branch_cash", "cashier_till", "cash_at_hand"],
    "Bank Transfer": ["bank"],
    "Mobile Money": ["mobile_money", "merchant"],
  };
  const order = opts.method ? preferred[opts.method] : ["branch_cash", "cash_at_hand", "bank"];
  const usable = accounts.filter(
    (a) => a.account_class === "asset_liquid" && a.status === "Active" && !a.is_system,
  );
  const inBranch = usable.filter(
    (a) => !opts.branchId || !a.branch_id || a.branch_id === opts.branchId,
  );
  const pool = inBranch.length > 0 ? inBranch : usable;

  for (const type of order) {
    const hit = pool.find((a) => a.account_type === type);
    if (hit) return hit;
  }
  return pool[0];
};
