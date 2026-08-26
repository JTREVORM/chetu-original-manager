import React, { useState } from 'react';
import { calculateLoanSchedule, formatUGX } from '../lib/loanCalculations';
import { InterestType } from '../types/database.types';
import { generatePortfolioReportPDF } from '../lib/pdfGenerator';
import { Calculator, Printer, ArrowRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/mobile/Responsive';

export const LoanCalculator: React.FC = () => {
  const [principalAmount, setPrincipalAmount] = useState<number>(3000000);
  const [interestRate, setInterestRate] = useState<number>(15.0);
  const [interestType, setInterestType] = useState<InterestType>('Flat Rate');
  const [loanPeriodWeeks, setLoanPeriodWeeks] = useState<number>(12);
  const [processingFeePct, setProcessingFeePct] = useState<number>(2.0);

  const calc = calculateLoanSchedule(
    principalAmount,
    interestRate,
    interestType,
    loanPeriodWeeks,
    processingFeePct
  );

  const handleExportPDF = () => {
    const headers = ['Wk #', 'Due Date', 'Installment', 'Principal Portion', 'Interest Portion', 'Remaining Bal'];
    const rows = calc.schedule.map(r => [
      String(r.week_number),
      r.due_date,
      formatUGX(r.installment_amount),
      formatUGX(r.principal_portion),
      formatUGX(r.interest_portion),
      formatUGX(r.remaining_balance)
    ]);
    generatePortfolioReportPDF(`Loan Schedule Quote (${interestType})`, rows, headers);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={Calculator}
        title="Interactive Loan Schedule Calculator"
        subtitle="Simulate weekly repayments, compare Flat Rate vs Reducing Balance, and print client quotes."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Inputs Pane */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Loan Parameters</h3>

          <div>
            <label className="form-label">Loan Amount (UGX) *</label>
            <input
              type="number"
              step="100000"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3.5 py-2 border rounded-xl text-sm font-bold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Interest Rate (%) *</label>
              <input
                type="number"
                step="0.5"
                value={interestRate}
                onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
              />
            </div>
            <div>
              <label className="form-label">Interest Type *</label>
              <select
                value={interestType}
                onChange={(e) => setInterestType(e.target.value as InterestType)}
                className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
              >
                <option value="Flat Rate">Flat Rate</option>
                <option value="Reducing Balance">Reducing Balance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Duration (Weeks) *</label>
              <input
                type="number"
                value={loanPeriodWeeks}
                onChange={(e) => setLoanPeriodWeeks(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
              />
            </div>
            <div>
              <label className="form-label">Processing Fee (%) *</label>
              <input
                type="number"
                step="0.5"
                value={processingFeePct}
                onChange={(e) => setProcessingFeePct(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            className="w-full py-2.5 bg-chetu-blue hover:bg-chetu-darkblue text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 mt-4"
          >
            <Printer className="w-4 h-4" />
            Print Schedule Quote PDF
          </button>
        </div>

        {/* Results Output Pane */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Box */}
          <div className="bg-gradient-to-r from-chetu-navy via-slate-900 to-chetu-darkblue text-white p-6 rounded-3xl shadow-xl grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase">Weekly Installment</p>
              <h2 className="text-lg font-black text-emerald-400 mt-1">{formatUGX(calc.weeklyInstallment)}</h2>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase">Total Interest</p>
              <h2 className="text-lg font-black text-blue-300 mt-1">{formatUGX(calc.totalInterestAmount)}</h2>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase">Total Payable</p>
              <h2 className="text-lg font-black text-amber-400 mt-1">{formatUGX(calc.totalAmountPayable)}</h2>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase">Final Due Date</p>
              <h2 className="text-sm font-bold text-white mt-2">{calc.finalDueDate}</h2>
            </div>
          </div>

          {/* Schedule Breakdown Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase">Estimated Repayment Schedule ({calc.schedule.length} Weeks)</h3>
            </div>

            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600 sticky top-0">
                  <tr>
                    <th className="p-3">Wk #</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3">Installment</th>
                    <th className="p-3">Principal</th>
                    <th className="p-3">Interest</th>
                    <th className="p-3">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calc.schedule.map(row => (
                    <tr key={row.week_number} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-chetu-blue">{row.week_number}</td>
                      <td className="p-3 text-slate-600">{row.due_date}</td>
                      <td className="p-3 font-bold text-slate-900">{formatUGX(row.installment_amount)}</td>
                      <td className="p-3 text-slate-600">{formatUGX(row.principal_portion)}</td>
                      <td className="p-3 text-slate-600">{formatUGX(row.interest_portion)}</td>
                      <td className="p-3 font-semibold text-slate-900">{formatUGX(row.remaining_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
