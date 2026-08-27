import React, { useState } from 'react';
import { TableScroll } from '../components/common/ScrollArea';
import { useDatabase } from '../context/DatabaseContext';
import { generatePortfolioReportPDF } from '../lib/pdfGenerator';
import { exportToCSV } from '../lib/excelExporter';
import { formatUGX } from '../lib/loanCalculations';
import { BarChart3, Download, FileText, Printer, Search } from 'lucide-react';
import { PageHeader, DesktopOnly, MobileOnly, RecordCard, CardList, EmptyState } from '../components/mobile/Responsive';

export const Reports: React.FC = () => {
  const {
    clients,
    clientGroups,
    loanProducts,
    loanApplications,
    loans,
    repayments,
    savingsAccounts,
    savingsTransactions,
    expenses,
    bankTransactions,
    auditLogs
  } = useDatabase();

  const [activeReportTab, setActiveReportTab] = useState<string>('Client Register');

  const reportTabs = [
    'Client Register',
    'Group Register',
    'Loan Products',
    'Loan Applications',
    'Loan Portfolio',
    'Savings Report',
    'Weekly Collections',
    'Monthly Collections',
    'Outstanding Loans',
    'Overdue Loans',
    'Fully Paid Loans',
    'Expenses Report',
    'Bank Statement',
    'Profit and Loss',
    'Financial Statement',
    'Audit Log Report',
    'User Activity Report'
  ];

  // Helper to extract data matrix for PDF & Excel exports
  const getReportData = (): { title: string; headers: string[]; rows: string[][] } => {
    switch (activeReportTab) {
      case 'Client Register':
        return {
          title: 'Client Register Report',
          headers: ['Client #', 'Full Name', 'NIN', 'Gender', 'Phone', 'District', 'Date Registered', 'Status'],
          rows: clients.map(c => [c.client_number, c.full_name, c.nin, c.gender, c.phone_number, c.district, c.date_registered, c.status])
        };

      case 'Group Register':
        return {
          title: 'Client Groups Register Report',
          headers: ['Group Code', 'Group Name', 'Chairperson', 'Village', 'Branch', 'Members', 'Group Savings', 'Status'],
          rows: clientGroups.map(g => [g.group_code, g.group_name, g.chairperson || 'N/A', g.village || 'N/A', g.branch, String(g.member_count), formatUGX(g.group_savings || 0), g.status])
        };

      case 'Loan Products':
        return {
          title: 'Loan Products Summary',
          headers: ['Product Name', 'Interest Rate', 'Type', 'Processing Fee', 'Penalty Rate', 'Grace Wks', 'Status'],
          rows: loanProducts.map(p => [p.product_name, `${p.interest_rate}%`, p.interest_type, `${p.processing_fee_percentage}%`, `${p.penalty_rate}%`, `${p.grace_period_weeks} Wk`, p.status])
        };

      case 'Loan Applications':
        return {
          title: 'Loan Applications Audit Report',
          headers: ['App #', 'Client Name', 'Requested Principal', 'Weeks', 'Guarantor', 'Status', 'Date'],
          rows: loanApplications.map(a => [a.application_number, a.client?.full_name || '', formatUGX(a.requested_amount), `${a.requested_weeks} Wks`, a.guarantor_name, a.status, a.created_at.split('T')[0]])
        };

      case 'Loan Portfolio':
        return {
          title: 'Loan Portfolio & Credit Master Roll',
          headers: ['Loan #', 'Client Name', 'Principal', 'Total Payable', 'Outstanding Bal', 'Completion', 'Status'],
          rows: loans.map(l => [l.loan_number, l.client?.full_name || '', formatUGX(l.principal_amount), formatUGX(l.total_amount_payable), formatUGX(l.outstanding_balance), `${l.completion_percentage}%`, l.status])
        };

      case 'Savings Report':
        return {
          title: 'Savings Vault & Passbook Report',
          headers: ['Account #', 'Holder Name', 'Account Type', 'Balance', 'Status', 'Opened Date'],
          rows: savingsAccounts.map(s => [s.account_number, s.client?.full_name || s.group?.group_name || 'Holder', s.account_type, formatUGX(s.balance), s.status, s.created_at.split('T')[0]])
        };

      case 'Weekly Collections':
      case 'Monthly Collections':
        return {
          title: 'Loan Collections Ledger Report',
          headers: ['Receipt #', 'Date', 'Client Name', 'Loan #', 'Amount Paid', 'Payment Method'],
          rows: repayments.map(r => [r.receipt_number, r.payment_date, r.client?.full_name || '', r.loan?.loan_number || '', formatUGX(r.amount_paid), r.payment_method])
        };

      case 'Outstanding Loans':
        return {
          title: 'Outstanding Loans Portfolio Statement',
          headers: ['Loan #', 'Client Name', 'Principal', 'Outstanding Balance', 'Weekly Installment', 'Final Due Date'],
          rows: loans.filter(l => l.outstanding_balance > 0).map(l => [l.loan_number, l.client?.full_name || '', formatUGX(l.principal_amount), formatUGX(l.outstanding_balance), formatUGX(l.weekly_installment), l.final_due_date])
        };

      case 'Overdue Loans':
        return {
          title: 'Overdue Loans & Risk Audit Report',
          headers: ['Loan #', 'Client Name', 'Phone', 'Outstanding Balance', 'Final Due Date', 'Status'],
          rows: loans.filter(l => l.status === 'Overdue' || l.status === 'Defaulted').map(l => [l.loan_number, l.client?.full_name || '', l.client?.phone_number || '', formatUGX(l.outstanding_balance), l.final_due_date, l.status])
        };

      case 'Fully Paid Loans':
        return {
          title: 'Fully Paid Loans Registry',
          headers: ['Loan #', 'Client Name', 'Principal Disbursed', 'Total Paid', 'Status'],
          rows: loans.filter(l => l.status === 'Fully Paid').map(l => [l.loan_number, l.client?.full_name || '', formatUGX(l.principal_amount), formatUGX(l.total_amount_payable), l.status])
        };

      case 'Expenses Report':
        return {
          title: 'Operational Expenses Audit Ledger',
          headers: ['Voucher #', 'Category', 'Description', 'Amount', 'Date', 'Method'],
          rows: expenses.map(e => [e.expense_number, e.category, e.description, formatUGX(e.amount), e.expense_date, e.payment_method])
        };

      case 'Bank Statement':
        return {
          title: 'Official Bank Account Transactions Statement',
          headers: ['Tx #', 'Type', 'Category', 'Description', 'Amount', 'Closing Balance', 'Ref #', 'Date'],
          rows: bankTransactions.map(t => [t.transaction_number, t.transaction_type, t.category, t.description, formatUGX(t.amount), formatUGX(t.balance_after), t.reference_number, t.transaction_date])
        };

      case 'Profit and Loss':
        const totalIncome = repayments.reduce((s, r) => s + Number(r.amount_paid), 0);
        const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
        const netProfit = totalIncome - totalExp;
        return {
          title: 'Profit & Loss Statement (P&L)',
          headers: ['Financial Item', 'Category', 'Amount (UGX)'],
          rows: [
            ['Gross Interest & Collections Inflow', 'Revenue', formatUGX(totalIncome)],
            ['Operating Expenses (Salaries, Rent, Fuel)', 'Expenses', formatUGX(totalExp)],
            ['Net Operating Income / (Loss)', 'Net Profit', formatUGX(netProfit)]
          ]
        };

      case 'Financial Statement':
        return {
          title: 'Institutional Financial Statement',
          headers: ['Financial Pillar', 'Current Valuation (UGX)'],
          rows: [
            ['Active Outstanding Portfolio', formatUGX(loans.reduce((s, l) => s + Number(l.outstanding_balance), 0))],
            ['Bank Liquidity Balance', formatUGX(bankTransactions.reduce((s, t) => t.transaction_type === 'Deposit' ? s + Number(t.amount) : s - Number(t.amount), 250000000))],
            ['Member Savings Deposits Vault', formatUGX(savingsAccounts.reduce((s, acc) => s + Number(acc.balance), 0))],
            ['Operating Expenses Accumulated', formatUGX(expenses.reduce((s, e) => s + Number(e.amount), 0))]
          ]
        };

      case 'Audit Log Report':
      case 'User Activity Report':
      default:
        return {
          title: 'System Audit Logs & Security Activity Report',
          headers: ['Log ID', 'User Name', 'Role', 'Action', 'Module', 'Details', 'Date & Time'],
          rows: auditLogs.map(l => [l.id, l.user_name, l.user_role, l.action, l.module, l.details, new Date(l.created_at).toLocaleString()])
        };
    }
  };

  const currentReport = getReportData();

  const handleExportPDF = () => {
    generatePortfolioReportPDF(currentReport.title, currentReport.rows, currentReport.headers);
  };

  const handleExportCSV = () => {
    exportToCSV(currentReport.title, currentReport.headers, currentReport.rows);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        icon={BarChart3}
        title="Financial & Operational Reports Engine"
        subtitle="Generate and export branded PDF & Excel reports across all institutional modules and audit logs."
        actions={
          <>
            <button
              onClick={handleExportPDF}
              className="px-3.5 py-2 bg-[#0B4394] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Export PDF Report
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Export Excel / CSV
            </button>
          </>
        }
      />

      {/* Tabs Navigation Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {reportTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveReportTab(tab)}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap transition-all ${
              activeReportTab === tab
                ? 'bg-[#0B4394] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Report Table View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase">{currentReport.title}</h3>
          <span className="text-xs font-semibold text-slate-500">{currentReport.rows.length} Total Records</span>
        </div>

        <DesktopOnly>
        <TableScroll>
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                {currentReport.headers.map((h, i) => (
                  <th key={i} className="p-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {currentReport.rows.length === 0 ? (
                <tr>
                  <td colSpan={currentReport.headers.length} className="p-8 text-center text-slate-400">
                    No data records found for this report.
                  </td>
                </tr>
              ) : (
                currentReport.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`p-3.5 ${cIdx === 0 ? 'font-bold text-[#0B4394]' : 'text-slate-700'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
        </DesktopOnly>

        <MobileOnly className="p-3">
          {currentReport.rows.length === 0 ? (
            <EmptyState icon={FileText} title="No data records found for this report." />
          ) : (
            <CardList>
              {currentReport.rows.map((row, rIdx) => (
                <RecordCard
                  key={rIdx}
                  title={row[0]}
                  fields={row.slice(1).map((cell, cIdx) => ({
                    label: currentReport.headers[cIdx + 1],
                    value: cell,
                  }))}
                />
              ))}
            </CardList>
          )}
        </MobileOnly>
      </div>
    </div>
  );
};
