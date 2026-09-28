/**
 * Savings is closed until it can be journalled.
 *
 * The module was never used — 25 accounts, every one at zero, and not a single
 * transaction — and it could not be journalled as it stood: the reference
 * number came from an RLS-filtered array, both errors were discarded, the
 * balance was a stored total kept from the browser, and an over-withdrawal was
 * silently clamped rather than refused.
 *
 * The database is the control: `trg_guard_savings_transaction` and
 * `trg_guard_savings_balance` refuse the writes whatever the interface does.
 * This screen exists so staff meet a sentence instead of an error.
 */
import React from "react";
import { PiggyBank } from "lucide-react";
import { PageBand } from "./Settings";
import { useDatabase } from "../context/DatabaseContext";

export const SavingsClosedPage: React.FC = () => {
  const { savingsAccounts } = useDatabase();
  const open = savingsAccounts.length;
  const held = savingsAccounts.reduce((t, a) => t + Number(a.balance || 0), 0);

  return (
    <div className="space-y-4 pb-16">
      <PageBand
        title="Savings"
        subtitle="Not yet in service. Existing accounts are safe and visible; no deposit or withdrawal can be recorded."
      />

      <section className="rounded-lg border border-amber-200 bg-white shadow-xs">
        <h2 className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
          <PiggyBank className="h-3.5 w-3.5" />
          Savings is not enabled
        </h2>
        <div className="space-y-3 p-4 text-[13px] leading-relaxed text-slate-700 sm:p-5">
          <p>
            Every other way money moves through Chetu — disbursement, collection, settlement,
            write-off, fees, refunds and expenses — writes a balanced entry in the financial ledger
            at the same moment it happens. Savings does not, so a deposit taken here would be money
            the books could not account for.
          </p>
          <p>
            Rather than record it wrongly, savings is closed. The database refuses a deposit, a
            withdrawal and any change to a balance, so there is no way to take a member&apos;s money
            and lose track of it.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1 sm:max-w-sm">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Accounts open
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-slate-900">{open}</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Held in savings
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-slate-900">
                UGX {held.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-[12px] text-slate-500">
            Accounts are still opened for new members and stay readable. Nothing has been deleted.
          </p>
        </div>
      </section>
    </div>
  );
};

export default SavingsClosedPage;
