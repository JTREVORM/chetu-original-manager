import React, { useState } from "react";
import { TableScroll } from "../components/common/ScrollArea";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { generateBankTransactionPDF } from "../lib/pdfGenerator";
import { formatUGX } from "../lib/loanCalculations";
import { TransactionType } from "../types/database.types";
import { Building2, Plus, ArrowUpRight, ArrowDownRight, Printer, X } from "lucide-react";
import {
  DesktopOnly,
  MobileOnly,
  RecordCard,
  CardList,
  EmptyState,
} from "../components/mobile/Responsive";

export const BankManagement: React.FC = () => {
  const { isAdmin, isAuditor } = useAuth();
  const {
    bankTransactions,
    addBankTransaction,
    currentBankBalance,
    totalDeposits,
    totalWithdrawals,
    branches,
  } = useDatabase();
  const { addToast } = useNotifications();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    transaction_type: "Deposit" as TransactionType,
    category: "Capital Equity Injection",
    description: "",
    amount: 10000000,
    reference_number: "",
    transaction_date: new Date().toISOString().split("T")[0],
    branch_id: "",
  });

  // Building the voucher is asynchronous (the brand mark is rasterized on
  // first use), so a failure would otherwise be a silently rejected promise.
  const printVoucher = async (tx: Parameters<typeof generateBankTransactionPDF>[0]) => {
    try {
      await generateBankTransactionPDF(tx);
    } catch {
      addToast("error", "Voucher Failed", "Could not build the transaction voucher PDF.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await addBankTransaction(formData);
      addToast(
        "success",
        "Transaction Posted",
        `Recorded ${created.transaction_type} of ${formatUGX(created.amount)}`,
      );
      setIsModalOpen(false);
      setFormData({
        transaction_type: "Deposit",
        category: "Capital Equity Injection",
        description: "",
        amount: 10000000,
        reference_number: "",
        transaction_date: new Date().toISOString().split("T")[0],
        branch_id: "",
      });
    } catch {
      addToast("error", "Action Failed", "Could not post bank transaction.");
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          Financial Ledger
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Bank Management</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Live institutional bank balance, capital injections, deposits and withdrawal audit trails.
        </p>
      </div>

      {isAdmin && !isAuditor && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-5 text-base font-semibold text-white hover:bg-[#093672] sm:h-10 sm:w-auto sm:text-[13px]"
        >
          <Plus className="h-4 w-4" />
          Record bank transaction
        </button>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-900 bg-[#083475] p-5 text-white shadow-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
            Current Bank Balance
          </span>
          <h2 className="mt-1 text-2xl font-black text-white">{formatUGX(currentBankBalance)}</h2>
          <span className="mt-1 block text-[11px] text-emerald-300">
            Live operating liquidity vault
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowUpRight className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Total Deposits
            </p>
            <p className="text-base font-black text-emerald-700">{formatUGX(totalDeposits)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <ArrowDownRight className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Total Withdrawals
            </p>
            <p className="text-base font-black text-red-700">{formatUGX(totalWithdrawals)}</p>
          </div>
        </div>
      </div>

      {/* Transaction History Ledger Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <h3 className="text-xs font-bold uppercase text-slate-700">Bank Transaction Ledger</h3>
        </div>

        <DesktopOnly>
          <TableScroll>
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
              </colgroup>
              {/* Headers never wrap — a squeezed column would otherwise stack
                  a word like "Voucher" into vertical letters. */}
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600 [&>th]:whitespace-nowrap">
                  <th className="px-3 py-3">Tx #</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3 text-right">Closing Bal.</th>
                  <th className="px-3 py-3">Ref #</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {bankTransactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-400">
                      No bank transactions found.
                    </td>
                  </tr>
                )}
                {bankTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="transition-colors hover:bg-slate-50 [&>td]:whitespace-nowrap"
                  >
                    <td className="px-3 py-3 font-bold text-[#0B4394]">{tx.transaction_number}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          tx.transaction_type === "Deposit"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td
                      className="truncate px-3 py-3 font-semibold text-slate-900"
                      title={tx.category}
                    >
                      {tx.category}
                    </td>
                    <td className="truncate px-3 py-3 text-slate-600" title={tx.description}>
                      {tx.description}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-bold ${tx.transaction_type === "Deposit" ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {tx.transaction_type === "Deposit" ? "+" : "-"}
                      {formatUGX(tx.amount)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {formatUGX(tx.balance_after)}
                    </td>
                    <td
                      className="truncate px-3 py-3 font-mono text-[10.5px] text-slate-500"
                      title={tx.reference_number}
                    >
                      {tx.reference_number}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{tx.transaction_date}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => printVoucher(tx)}
                        className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394] transition-colors hover:bg-blue-100"
                        title="Print Voucher PDF"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </DesktopOnly>

        <MobileOnly className="p-3">
          {bankTransactions.length === 0 ? (
            <EmptyState icon={Building2} title="No bank transactions found." />
          ) : (
            <CardList>
              {bankTransactions.map((tx) => (
                <RecordCard
                  key={tx.id}
                  title={tx.transaction_number}
                  subtitle={tx.category}
                  badge={
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        tx.transaction_type === "Deposit"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {tx.transaction_type}
                    </span>
                  }
                  fields={[
                    { label: "Description", value: tx.description },
                    {
                      label: "Amount",
                      value: (
                        <span
                          className={
                            tx.transaction_type === "Deposit" ? "text-emerald-600" : "text-red-600"
                          }
                        >
                          {tx.transaction_type === "Deposit" ? "+" : "-"}
                          {formatUGX(tx.amount)}
                        </span>
                      ),
                    },
                    { label: "Closing Balance", value: formatUGX(tx.balance_after) },
                    { label: "Ref #", value: tx.reference_number },
                    { label: "Date", value: tx.transaction_date },
                  ]}
                  actions={
                    <button
                      onClick={() => printVoucher(tx)}
                      className="w-full min-h-11 flex items-center justify-center gap-1.5 p-1.5 bg-slate-100 hover:bg-[#0B4394] hover:text-white rounded-lg transition-colors text-slate-600 text-xs font-bold"
                    >
                      <Printer className="w-4 h-4" />
                      Print Voucher
                    </button>
                  }
                />
              ))}
            </CardList>
          )}
        </MobileOnly>
      </div>

      {/* Record Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[calc(100vw-1.5rem)] max-w-md md:w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Record Bank Transaction</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Transaction Type *</label>
                  <select
                    value={formData.transaction_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        transaction_type: e.target.value as TransactionType,
                      })
                    }
                    className="form-field"
                  >
                    <option value="Deposit">Deposit</option>
                    <option value="Withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Category *</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. Capital Injection"
                    className="form-field"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Branch *</label>
                <select
                  required
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  className="form-field"
                >
                  <option value="" disabled>
                    Select branch
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.branch_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Description *</label>
                <textarea
                  required
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Details of bank deposit/withdrawal..."
                  className="form-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Amount (UGX) *</label>
                  <input
                    type="number"
                    step="100000"
                    required
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })
                    }
                    className="form-field"
                  />
                </div>
                <div>
                  <label className="form-label">Reference Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="STB-DEP-001"
                    className="form-field"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-4 border-t md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold min-h-11 md:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B4394] text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-900 min-h-11 md:min-h-0"
                >
                  Post Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
