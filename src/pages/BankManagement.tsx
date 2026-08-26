import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { generateBankTransactionPDF } from '../lib/pdfGenerator';
import { formatUGX } from '../lib/loanCalculations';
import { TransactionType } from '../types/database.types';
import { Building2, Plus, ArrowUpRight, ArrowDownRight, Printer, Wallet, X } from 'lucide-react';
import { PageHeader, DesktopOnly, MobileOnly, RecordCard, CardList, EmptyState } from '../components/mobile/Responsive';

export const BankManagement: React.FC = () => {
  const { isAdmin, isAuditor } = useAuth();
  const { bankTransactions, addBankTransaction, currentBankBalance, totalDeposits, totalWithdrawals, branches } = useDatabase();
  const { addToast } = useNotifications();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    transaction_type: 'Deposit' as TransactionType,
    category: 'Capital Equity Injection',
    description: '',
    amount: 10000000,
    reference_number: '',
    transaction_date: new Date().toISOString().split('T')[0],
    branch_id: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await addBankTransaction(formData);
      addToast('success', 'Transaction Posted', `Recorded ${created.transaction_type} of ${formatUGX(created.amount)}`);
      setIsModalOpen(false);
      setFormData({
        transaction_type: 'Deposit',
        category: 'Capital Equity Injection',
        description: '',
        amount: 10000000,
        reference_number: '',
        transaction_date: new Date().toISOString().split('T')[0],
        branch_id: ''
      });
    } catch {
      addToast('error', 'Action Failed', 'Could not post bank transaction.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title="Bank & Liquidity Management Ledger"
        subtitle="Monitor live institutional bank balance, capital injections, deposits, and withdrawal audit trails."
        actions={
          isAdmin && !isAuditor ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-[#0B4394] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Record Bank Transaction
            </button>
          ) : null
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#083475] text-white p-5 rounded-2xl border border-blue-900 shadow-xl">
          <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Current Bank Balance</span>
          <h2 className="text-2xl font-black mt-1 text-white">{formatUGX(currentBankBalance)}</h2>
          <span className="text-[11px] text-emerald-300 mt-1 block">Live Operating Liquidity Vault</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deposits</span>
            <ArrowUpRight className="w-5 h-5 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-emerald-700 mt-1">{formatUGX(totalDeposits)}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Withdrawals</span>
            <ArrowDownRight className="w-5 h-5 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-700 mt-1">{formatUGX(totalWithdrawals)}</h2>
        </div>
      </div>

      {/* Transaction History Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold uppercase text-slate-700">Bank Transaction Ledger</h3>
        </div>

        <DesktopOnly>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="p-4">Tx #</th>
                <th className="p-4">Type</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Closing Balance</th>
                <th className="p-4">Ref #</th>
                <th className="p-4">Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {bankTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-[#0B4394]">{tx.transaction_number}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tx.transaction_type === 'Deposit' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className="p-4 font-semibold text-slate-900">{tx.category}</td>
                  <td className="p-4 text-slate-600 max-w-xs truncate">{tx.description}</td>
                  <td className={`p-4 font-bold ${tx.transaction_type === 'Deposit' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tx.transaction_type === 'Deposit' ? '+' : '-'}{formatUGX(tx.amount)}
                  </td>
                  <td className="p-4 font-bold text-slate-900">{formatUGX(tx.balance_after)}</td>
                  <td className="p-4 font-mono text-[11px] text-slate-500">{tx.reference_number}</td>
                  <td className="p-4 text-slate-600">{tx.transaction_date}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => generateBankTransactionPDF(tx)}
                      className="p-1.5 bg-slate-100 hover:bg-[#0B4394] hover:text-white rounded-lg transition-colors text-slate-600"
                      title="Print Voucher PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tx.transaction_type === 'Deposit' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tx.transaction_type}
                    </span>
                  }
                  fields={[
                    { label: 'Description', value: tx.description },
                    { label: 'Amount', value: <span className={tx.transaction_type === 'Deposit' ? 'text-emerald-600' : 'text-red-600'}>{tx.transaction_type === 'Deposit' ? '+' : '-'}{formatUGX(tx.amount)}</span> },
                    { label: 'Closing Balance', value: formatUGX(tx.balance_after) },
                    { label: 'Ref #', value: tx.reference_number },
                    { label: 'Date', value: tx.transaction_date },
                  ]}
                  actions={
                    <button
                      onClick={() => generateBankTransactionPDF(tx)}
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
            <div className="p-5 bg-[#0B4394] text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Record Bank Transaction</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Transaction Type *</label>
                  <select
                    value={formData.transaction_type}
                    onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value as TransactionType })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
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
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Branch *</label>
                <select
                  required
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                >
                  <option value="" disabled>Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
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
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
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
                    onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
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
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
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
