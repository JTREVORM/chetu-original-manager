import React, { useMemo, useState } from 'react';
import { TableScroll } from '../components/common/ScrollArea';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { generateExpenseVoucherPDF } from '../lib/pdfGenerator';
import { formatUGX } from '../lib/loanCalculations';
import { ExpenseCategory, PaymentMethod } from '../types/database.types';
import { CreditCard, Plus, Printer, Search, X, CalendarDays, Receipt } from 'lucide-react';
import { FilterBar, FilterGroup, ChipRow, Chip, DesktopOnly, MobileOnly, RecordCard, CardList, EmptyState } from '../components/mobile/Responsive';

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

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter(e => {
        const d = new Date(e.expense_date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  // Building the voucher is asynchronous (the brand mark is rasterized on
  // first use), so a failure would otherwise be a silently rejected promise.
  const printVoucher = async (expense: Parameters<typeof generateExpenseVoucherPDF>[0]) => {
    try {
      await generateExpenseVoucherPDF(expense);
    } catch {
      addToast('error', 'Voucher Failed', 'Could not build the expense voucher PDF.');
    }
  };

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
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <CreditCard className="h-3.5 w-3.5 text-amber-400" />
          Financial Ledger
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Expense Management</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Record, categorize and audit every operating expense, with a printable voucher for each one.
        </p>
      </div>

      {isAdmin && !isAuditor && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-5 text-base font-semibold text-white hover:bg-[#093672] sm:h-10 sm:w-auto sm:text-[13px]"
        >
          <Plus className="h-4 w-4" />
          Log new expense
        </button>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-900 bg-[#083475] p-5 text-white shadow-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Total System Expenses</span>
          <h2 className="mt-1 text-2xl font-black text-red-300">{formatUGX(totalExpenses)}</h2>
          <span className="mt-1 block text-[11px] text-blue-200">All branches, all time</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B4394]/10 text-[#0B4394]">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">This Month</p>
            <p className="text-base font-black text-slate-900">{formatUGX(thisMonthTotal)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B4394]/10 text-[#0B4394]">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Vouchers Logged</p>
            <p className="text-base font-black text-slate-900">{expenses.length}</p>
          </div>
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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <DesktopOnly>
          <TableScroll>
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[28%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600 [&>th]:whitespace-nowrap">
                  <th className="px-3 py-3">Voucher #</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Payment Method</th>
                  <th className="px-3 py-3 text-right">Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">
                      No expenses found.
                    </td>
                  </tr>
                )}
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="transition-colors hover:bg-slate-50 [&>td]:whitespace-nowrap">
                    <td className="px-3 py-3 font-bold text-[#0B4394]">{exp.expense_number}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="truncate px-3 py-3 font-medium text-slate-900" title={exp.description}>{exp.description}</td>
                    <td className="px-3 py-3 text-right font-bold text-red-600">{formatUGX(exp.amount)}</td>
                    <td className="px-3 py-3 text-slate-600">{exp.expense_date}</td>
                    <td className="px-3 py-3 text-slate-600">{exp.payment_method}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => printVoucher(exp)}
                        className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394] transition-colors hover:bg-blue-100"
                        title="Print Expense Voucher PDF"
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
                      onClick={() => printVoucher(exp)}
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
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
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
                  className="form-field"
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
                  className="form-field"
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
                    className="form-field"
                  />
                </div>
                <div>
                  <label className="form-label">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
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
                  className="form-field"
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
