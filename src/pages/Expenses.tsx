import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { generateExpenseVoucherPDF } from '../lib/pdfGenerator';
import { formatUGX } from '../lib/loanCalculations';
import { ExpenseCategory, PaymentMethod } from '../types/database.types';
import { CreditCard, Plus, Printer, Search, X, Tag } from 'lucide-react';
import { PageHeader, FilterBar, FilterGroup, ChipRow, Chip, DesktopOnly, MobileOnly, RecordCard, CardList, EmptyState } from '../components/mobile/Responsive';

export const Expenses: React.FC = () => {
  const { isAuditor, isAdmin } = useAuth();
  const { expenses, addExpense, totalExpenses, branches } = useDatabase();
  const { addToast } = useNotifications();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    category: 'Rent' as ExpenseCategory,
    description: '',
    amount: 500000,
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'Bank Transfer' as PaymentMethod,
    receipt_url: '',
    branch_id: ''
  });

  const categories: ExpenseCategory[] = [
    'Salaries', 'Rent', 'Fuel', 'Utilities', 'Internet', 'Maintenance', 'Transport', 'Office Supplies', 'Other'
  ];

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch =
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.expense_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'All' || e.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await addExpense(formData);
      addToast('success', 'Expense Logged', `Expense ${created.expense_number} recorded.`);
      setIsModalOpen(false);
      setFormData({
        category: 'Rent',
        description: '',
        amount: 500000,
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'Bank Transfer',
        receipt_url: '',
        branch_id: ''
      });
    } catch {
      addToast('error', 'Action Failed', 'Could not record expense.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        icon={CreditCard}
        title="Expense Management System"
        subtitle="Record, categorize, and audit operating expenses with printable expense vouchers."
        actions={
          isAdmin && !isAuditor ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-[#0B4394] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Log New Expense
            </button>
          ) : null
        }
      />

      {/* Summary Card */}
      <div className="bg-[#083475] text-white p-5 rounded-2xl border border-blue-900 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider">Total System Expenses</span>
          <h2 className="text-2xl font-black text-red-300 mt-1">{formatUGX(totalExpenses)}</h2>
        </div>
        <div className="p-3 bg-red-500/20 text-red-300 rounded-xl">
          <Tag className="w-6 h-6" />
        </div>
      </div>

      {/* Filter & Search Bar */}
      <FilterBar
        search={
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search expense description or voucher #..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>
        }
      >
        <FilterGroup label="Category">
          <ChipRow>
            {['All', ...categories].map((cat) => (
              <Chip key={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
                {cat}
              </Chip>
            ))}
          </ChipRow>
        </FilterGroup>
      </FilterBar>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <DesktopOnly>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="p-4">Voucher #</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Date</th>
                <th className="p-4">Payment Method</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-[#0B4394]">{exp.expense_number}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 bg-slate-100 font-bold text-slate-700 rounded-md text-[10px]">
                      {exp.category}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-900">{exp.description}</td>
                  <td className="p-4 font-bold text-red-600">{formatUGX(exp.amount)}</td>
                  <td className="p-4 text-slate-600">{exp.expense_date}</td>
                  <td className="p-4 text-slate-600">{exp.payment_method}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => generateExpenseVoucherPDF(exp)}
                      className="p-1.5 bg-slate-100 hover:bg-[#0B4394] hover:text-white rounded-lg transition-colors text-slate-600"
                      title="Print Expense Voucher PDF"
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
          {filteredExpenses.length === 0 ? (
            <EmptyState icon={CreditCard} title="No expenses found." />
          ) : (
            <CardList>
              {filteredExpenses.map((exp) => (
                <RecordCard
                  key={exp.id}
                  title={exp.expense_number}
                  subtitle={exp.description}
                  badge={
                    <span className="px-2.5 py-0.5 bg-slate-100 font-bold text-slate-700 rounded-md text-[10px]">
                      {exp.category}
                    </span>
                  }
                  fields={[
                    { label: 'Amount', value: <span className="text-red-600">{formatUGX(exp.amount)}</span> },
                    { label: 'Date', value: exp.expense_date },
                    { label: 'Payment Method', value: exp.payment_method },
                  ]}
                  actions={
                    <button
                      onClick={() => generateExpenseVoucherPDF(exp)}
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

      {/* Log Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[calc(100vw-1.5rem)] max-w-md md:w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-[#0B4394] text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Log New Expense Voucher</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="form-label">Expense Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
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
                  placeholder="Detail exact reason for expense..."
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Amount (UGX) *</label>
                  <input
                    type="number"
                    step="10000"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
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
                <label className="form-label">Payment Method *</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money</option>
                </select>
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
                  Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
