/**
 * The legacy bank register.
 *
 * This screen used to be the whole Financial Ledger: one unnamed institutional
 * bank balance, computed in the browser from `bank_transactions`. The audit
 * found that no disbursement, collection or fee had ever reached it — every
 * officer-initiated posting was rejected by row level security and the error
 * discarded — so it showed UGX 2,090,000 of capital while UGX 5,250,000 had
 * already gone out to borrowers.
 *
 * `bank_transactions` is now closed to writes and superseded by the balanced
 * ledger. Its historical rows are preserved, and backfilled into that ledger,
 * so this page exists to let anyone check what the old register said. Live
 * work happens under Financial Ledger.
 */
import React from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Building2 } from "lucide-react";
import { useDatabase } from "../context/DatabaseContext";
import { MisTable, money, shortDate } from "../components/mis/MisKit";
import { formatUGX } from "../lib/loanCalculations";
import type { BankTransaction } from "../types/database.types";

export const BankManagement: React.FC = () => {
  const { bankTransactions, moneyPosition } = useDatabase();

  const registerTotal = bankTransactions.reduce(
    (total, t) => total + (t.transaction_type === "Deposit" ? Number(t.amount) : -Number(t.amount)),
    0,
  );

  return (
    <div className="space-y-5 pb-12">
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          Archive
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Legacy Bank Register</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          The old single-account register, kept read-only for reference. Live balances, capital,
          transfers and reconciliation are in the Financial Ledger.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 text-[12px] leading-relaxed text-amber-900">
            <p className="text-[13px] font-bold">This register is closed.</p>
            <p className="mt-1">
              It only ever recorded capital. Disbursements, collections and fees never reached it,
              which is why it read {formatUGX(registerTotal)} while money was moving elsewhere.
              Every row below has been carried into the balanced ledger, where the cash side sits in{" "}
              <strong>Legacy / Unclassified</strong> until the accounts are counted — because the
              old register never recorded which account a shilling was actually in.
            </p>
          </div>
        </div>
        <Link
          to="/financial-ledger"
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B4394] px-4 text-[13px] font-semibold text-white hover:bg-[#093672]"
        >
          Open the Financial Ledger
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Legacy register total" value={registerTotal} muted />
        <Tile
          label="Total available liquidity (live)"
          value={Number(moneyPosition?.total_available_liquidity ?? 0)}
        />
        <Tile
          label="Outstanding loan principal (live)"
          value={Number(moneyPosition?.outstanding_principal ?? 0)}
        />
      </div>

      <MisTable<BankTransaction>
        columns={[
          {
            key: "no",
            label: "Number",
            width: "14%",
            render: (t) => <span className="font-mono text-[11px]">{t.transaction_number}</span>,
            text: (t) => t.transaction_number,
          },
          {
            key: "date",
            label: "Date",
            width: "10%",
            render: (t) => shortDate(t.transaction_date),
          },
          {
            key: "type",
            label: "Type",
            width: "10%",
            render: (t) => t.transaction_type,
            text: (t) => t.transaction_type,
          },
          {
            key: "category",
            label: "Category",
            width: "18%",
            render: (t) => t.category,
            text: (t) => t.category,
          },
          {
            key: "desc",
            label: "Description",
            width: "24%",
            render: (t) => t.description,
            text: (t) => t.description,
          },
          {
            key: "ref",
            label: "Reference",
            width: "10%",
            render: (t) => t.reference_number || "—",
            text: (t) => t.reference_number || "—",
          },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            width: "14%",
            render: (t) => (
              <span
                className={`font-semibold ${
                  t.transaction_type === "Deposit" ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {money(Number(t.amount))}
              </span>
            ),
            text: (t) => money(Number(t.amount)),
          },
        ]}
        rows={bankTransactions}
        rowKey={(t) => t.id}
        mobileTitle={(t) => t.transaction_number}
        mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
        emptyMessage="The legacy register is empty."
      />
    </div>
  );
};

const Tile: React.FC<{ label: string; value: number; muted?: boolean }> = ({
  label,
  value,
  muted,
}) => (
  <div
    className={`rounded-xl border p-4 shadow-xs ${
      muted ? "border-slate-200 bg-slate-50" : "border-blue-900 bg-[#083475] text-white"
    }`}
  >
    <p
      className={`text-[10px] font-bold uppercase tracking-wide ${muted ? "text-slate-500" : "text-blue-200"}`}
    >
      {label}
    </p>
    <p className={`mt-1 text-lg font-black ${muted ? "text-slate-700" : "text-white"}`}>
      {formatUGX(value)}
    </p>
  </div>
);

export default BankManagement;
