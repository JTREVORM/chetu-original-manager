/**
 * Choose the cash, bank or wallet account a movement goes through.
 *
 * Every screen that moves money needs this, and none of them had it: the
 * system recorded amounts without ever recording where the money was. That is
 * why the Financial Ledger could show UGX 2,090,000 of capital and nothing
 * else while 5,250,000 had already gone out to borrowers.
 *
 * The field defaults to the branch's cash account so that collecting is still
 * one tap, but it is a real choice and the database rejects a posting without
 * it. `payment_method` on the surrounding form says HOW the money moved;
 * this says WHERE it went. They are not the same thing, and conflating them is
 * the guess this system refuses to make.
 */
import React, { useEffect, useMemo } from "react";
import { useDatabase } from "../../context/DatabaseContext";
import { defaultAccountFor } from "../../lib/financial/ledger";
import { formatUGX } from "../../lib/loanCalculations";
import type {
  AccountBalance,
  FinancialAccountType,
  PaymentMethod,
} from "../../types/database.types";

interface Props {
  value: string;
  onChange: (accountId: string) => void;
  /** Narrows the list, and picks the default, for this branch. */
  branchId?: string | null;
  /** Biases the default only — never used to infer where money actually went. */
  method?: PaymentMethod;
  label?: string;
  /** Shows each account's current balance. Off where balances are not the point. */
  showBalances?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Set when the account is the money leaving, so the copy reads correctly. */
  direction?: "source" | "destination";
}

export const AccountSelect: React.FC<Props> = ({
  value,
  onChange,
  branchId,
  method,
  label,
  showBalances = true,
  disabled,
  required = true,
  direction = "destination",
}) => {
  const { accountBalances } = useDatabase();

  const options = useMemo<AccountBalance[]>(
    () =>
      accountBalances
        .filter(
          (a) =>
            a.account_class === "asset_liquid" &&
            a.status === "Active" &&
            !a.is_system &&
            (!branchId || !a.branch_id || a.branch_id === branchId),
        )
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.account_name.localeCompare(b.account_name),
        ),
    [accountBalances, branchId],
  );

  // Pick a sensible default once the accounts arrive, so an officer collecting
  // in the field taps once rather than choosing every time.
  useEffect(() => {
    if (value || options.length === 0) return;
    const fallback = defaultAccountFor(accountBalances, { branchId, method });
    if (fallback) onChange(fallback.account_id);
  }, [value, options.length, accountBalances, branchId, method, onChange]);

  const heading = label ?? (direction === "source" ? "Paid from account" : "Received into account");

  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
        <p className="font-semibold">No financial account is set up yet.</p>
        <p className="mt-1 leading-relaxed">
          An Administrator needs to add at least one cash or bank account under Financial Ledger →
          Accounts &amp; Cash before money can be recorded.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {heading}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] focus:border-[#0B4394] focus:ring-1 focus:ring-[#0B4394] disabled:bg-slate-100"
      >
        <option value="">Select an account…</option>
        {options.map((a) => (
          <option key={a.account_id} value={a.account_id}>
            {a.account_name}
            {a.branch_name ? ` — ${a.branch_name}` : ""}
            {showBalances ? ` (${formatUGX(Number(a.current_balance))})` : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        {direction === "source"
          ? "The account the money actually leaves."
          : "The account the money actually arrives in."}
      </p>
    </div>
  );
};
