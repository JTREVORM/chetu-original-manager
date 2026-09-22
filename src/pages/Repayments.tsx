import React, { useState } from "react";
import { TableScroll } from "../components/common/ScrollArea";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { generateRepaymentReceiptPDF, generateLoanStatementPDF } from "../lib/pdfGenerator";
import { formatUGX } from "../lib/loanCalculations";
import { Loan, OPEN_LOAN_STATUSES, PaymentMethod } from "../types/database.types";
import {
  Receipt,
  Search,
  Plus,
  Printer,
  CheckCircle2,
  Clock,
  Calendar,
  ChevronRight,
  X,
} from "lucide-react";
import {
  PageHeader,
  FilterBar,
  DesktopOnly,
  MobileOnly,
  RecordCard,
  CardList,
  EmptyState,
} from "../components/mobile/Responsive";

export const Repayments: React.FC = () => {
  const { isAuditor, isBranchManager } = useAuth();
  const { loans, repayments, recordRepayment } = useDatabase();
  const { addToast } = useNotifications();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [notes, setNotes] = useState("");

  // The shared open-loan set, rather than another hand-written list. This
  // screen happened to include `Partially Paid`; the collection screens did
  // not, and that divergence is what hid paying members from their group list.
  const activeLoans = loans.filter((l) => OPEN_LOAN_STATUSES.includes(l.status));

  const filteredLoans = activeLoans.filter((l) => {
    const clientName = l.client?.full_name || "";
    return (
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.loan_number.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleOpenRecordModal = (loan: Loan) => {
    setSelectedLoan(loan);
    setPaymentAmount(loan.weekly_installment);
    setPaymentMethod("Cash");
    setNotes(`Weekly installment payment for ${loan.loan_number}`);
    setIsModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || paymentAmount <= 0) return;

    try {
      const repaymentRecord = await recordRepayment(
        selectedLoan.id,
        paymentAmount,
        paymentMethod,
        notes,
      );
      addToast(
        "success",
        "Payment Recorded",
        `Receipt #${repaymentRecord.receipt_number} generated for ${formatUGX(paymentAmount)}`,
      );

      // Receipt printing is a convenience: never let a PDF failure make a
      // successfully posted payment look like it failed.
      try {
        generateRepaymentReceiptPDF(repaymentRecord);
      } catch (pdfError) {
        console.error("Receipt PDF generation failed", pdfError);
        addToast(
          "warning",
          "Receipt Not Printed",
          "Payment saved, but the receipt PDF could not be generated.",
        );
      }

      setIsModalOpen(false);
      setSelectedLoan(null);
    } catch (error) {
      console.error("Repayment failed", error);
      addToast("error", "Payment Failed", "Could not process repayment.");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        icon={Receipt}
        title="Weekly Loan Repayments & Collections Engine"
        subtitle="Search active loans, record weekly collection installments, auto-update balances, and issue instant printable receipts."
      />

      {/* Search Bar */}
      <FilterBar
        search={
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Loan # (e.g. CM-LN-2026-0001) or Client Name..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4394]"
            />
          </div>
        }
      />

      {/* Active Loans Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-700">Active Repayment Accounts</h3>
          <span className="text-xs font-semibold text-slate-500">
            {filteredLoans.length} Loans Found
          </span>
        </div>

        <DesktopOnly>
          <TableScroll>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="p-4">Loan #</th>
                  <th className="p-4">Client Name</th>
                  <th className="p-4">Principal</th>
                  <th className="p-4">Outstanding Bal</th>
                  <th className="p-4">Weekly Installment</th>
                  <th className="p-4">Completion</th>
                  <th className="p-4">Status</th>
                  {!isAuditor && !isBranchManager && <th className="p-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-[#0B4394]">{loan.loan_number}</td>
                    <td className="p-4 font-semibold text-slate-900">{loan.client?.full_name}</td>
                    <td className="p-4 font-medium">{formatUGX(loan.principal_amount)}</td>
                    <td className="p-4 font-bold text-red-600">
                      {formatUGX(loan.outstanding_balance)}
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      {formatUGX(loan.weekly_installment)}
                    </td>
                    <td className="p-4">
                      <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#0B4394] h-full rounded-full transition-all"
                          style={{ width: `${loan.completion_percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        {loan.completion_percentage}% Paid
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          loan.status === "Active"
                            ? "bg-blue-100 text-blue-800"
                            : loan.status === "Partially Paid"
                              ? "bg-amber-100 text-amber-800"
                              : loan.status === "Fully Paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                        }`}
                      >
                        {loan.status}
                      </span>
                    </td>
                    {!isAuditor && !isBranchManager && (
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenRecordModal(loan)}
                          className="px-3 py-1.5 bg-[#0B4394] hover:bg-blue-900 text-white font-bold rounded-xl text-xs shadow-xs transition-all inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Record Payment
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredLoans.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAuditor || isBranchManager ? 7 : 8}
                      className="p-8 text-center text-xs text-slate-400 font-medium"
                    >
                      No active loan accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
        </DesktopOnly>

        <MobileOnly className="p-3">
          {filteredLoans.length === 0 ? (
            <EmptyState icon={Receipt} title="No active loan accounts found." />
          ) : (
            <CardList>
              {filteredLoans.map((loan) => (
                <RecordCard
                  key={loan.id}
                  title={loan.loan_number}
                  subtitle={loan.client?.full_name}
                  badge={
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        loan.status === "Active"
                          ? "bg-blue-100 text-blue-800"
                          : loan.status === "Partially Paid"
                            ? "bg-amber-100 text-amber-800"
                            : loan.status === "Fully Paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                      }`}
                    >
                      {loan.status}
                    </span>
                  }
                  fields={[
                    { label: "Principal", value: formatUGX(loan.principal_amount) },
                    {
                      label: "Outstanding Bal",
                      value: (
                        <span className="text-red-600">{formatUGX(loan.outstanding_balance)}</span>
                      ),
                    },
                    { label: "Weekly Installment", value: formatUGX(loan.weekly_installment) },
                    { label: "Completion", value: `${loan.completion_percentage}% Paid` },
                  ]}
                  actions={
                    !isAuditor ? (
                      <button
                        onClick={() => handleOpenRecordModal(loan)}
                        className="w-full min-h-11 px-3 py-1.5 bg-[#0B4394] hover:bg-blue-900 text-white font-bold rounded-xl text-xs shadow-xs transition-all inline-flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Record Payment
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </CardList>
          )}
        </MobileOnly>
      </div>

      {/* Recent Collections Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Collection Transactions</h3>
        <div className="space-y-2">
          {repayments.slice(0, 5).map((rep) => (
            <div
              key={rep.id}
              className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">
                    {rep.receipt_number} ({rep.client?.full_name})
                  </h4>
                  <p className="text-slate-500 text-[11px]">
                    {rep.payment_date} • Method: {rep.payment_method}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-black text-emerald-700 text-sm">
                  {formatUGX(rep.amount_paid)}
                </span>
                <button
                  onClick={() => generateRepaymentReceiptPDF(rep)}
                  className="p-1.5 bg-white border text-slate-600 hover:text-[#0B4394] rounded-lg"
                  title="Print Receipt PDF"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Record Repayment Modal */}
      {isModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[calc(100vw-1.5rem)] max-w-md md:w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Record Weekly Repayment</h3>
                <p className="text-xs text-blue-200">Loan: {selectedLoan.loan_number}</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-4 md:p-6 space-y-4">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs space-y-1">
                <p>
                  <strong>Borrower:</strong> {selectedLoan.client?.full_name}
                </p>
                <p>
                  <strong>Current Outstanding Balance:</strong>{" "}
                  {formatUGX(selectedLoan.outstanding_balance)}
                </p>
                <p>
                  <strong>Standard Weekly Installment:</strong>{" "}
                  {formatUGX(selectedLoan.weekly_installment)}
                </p>
              </div>

              <div>
                <label className="form-label">Amount Collected (UGX) *</label>
                <input
                  type="number"
                  step="5000"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="form-label">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                >
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money (MTN / Airtel)</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="form-label">Transaction Notes / Reference</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Week 4 installment paid at branch"
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
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
                  className="px-5 py-2.5 bg-[#0B4394] text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-900 flex items-center justify-center gap-1.5 min-h-11 md:min-h-0"
                >
                  <Printer className="w-4 h-4" />
                  Post Payment & Print Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
