import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { LoanProduct, InterestType } from '../types/database.types';
import { formatUGX } from '../lib/loanCalculations';
import { FEES } from '../lib/fees';
import { Briefcase, Pencil, Plus, X } from 'lucide-react';

const field = 'form-field';
const label = 'form-label';

interface ProductForm {
  product_name: string;
  description: string;
  interest_rate: number;
  interest_type: InterestType;
  processing_fee_percentage: number;
  penalty_rate: number;
  grace_period_weeks: number;
  min_amount: number;
  max_amount: number;
  min_weeks: number;
  max_weeks: number;
  status: 'Active' | 'Inactive';
}

const emptyForm: ProductForm = {
  product_name: '',
  description: '',
  interest_rate: 15.0,
  interest_type: 'Flat Rate',
  processing_fee_percentage: FEES.processingFeePct,
  penalty_rate: 1.0,
  grace_period_weeks: 1,
  min_amount: 500000,
  max_amount: 10000000,
  min_weeks: 4,
  max_weeks: 52,
  status: 'Active',
};

/** Section heading, matching the Group Create form. */
const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title, description, children,
}) => (
  <section className="mb-5 last:mb-0">
    <div className="form-section-title">{title}</div>
    {description && <p className="mb-2 text-[11px] text-slate-500">{description}</p>}
    {children}
  </section>
);

/**
 * Loan Products — the lending terms a loan can be written against.
 *
 * A product carries the rate and the amount/period limits; the upfront charges
 * are institution-wide and live in the fee schedule, so they are shown here for
 * reference but are not per-product settings.
 */
export const LoanProducts: React.FC = () => {
  const { loanProducts, addLoanProduct, updateLoanProduct } = useDatabase();
  const { isAdmin, isAuditor } = useAuth();
  const { addToast } = useNotifications();

  const canManage = isAdmin && !isAuditor;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LoanProduct | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: LoanProduct) => {
    setEditing(p);
    setForm({
      product_name: p.product_name,
      description: p.description,
      interest_rate: Number(p.interest_rate),
      interest_type: p.interest_type,
      processing_fee_percentage: Number(p.processing_fee_percentage),
      penalty_rate: Number(p.penalty_rate ?? 1),
      grace_period_weeks: Number(p.grace_period_weeks ?? 1),
      min_amount: Number(p.min_amount),
      max_amount: Number(p.max_amount),
      min_weeks: Number(p.min_weeks),
      max_weeks: Number(p.max_weeks),
      status: p.status,
    });
    setOpen(true);
  };

  const validate = (): string | null => {
    if (!form.product_name.trim()) return 'Give the product a name.';
    if (form.min_amount <= 0) return 'The minimum amount must be greater than zero.';
    if (form.max_amount < form.min_amount) return 'The maximum amount cannot be below the minimum.';
    if (form.min_weeks <= 0) return 'The minimum period must be at least one week.';
    if (form.max_weeks < form.min_weeks) return 'The maximum period cannot be below the minimum.';
    if (form.interest_rate < 0) return 'The interest rate cannot be negative.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return addToast('error', 'Check the form', problem);
    setSaving(true);
    try {
      if (editing) {
        await updateLoanProduct(editing.id, form);
        addToast('success', 'Product updated', `${form.product_name} has been saved.`);
      } else {
        await addLoanProduct(form);
        addToast('success', 'Product created', `${form.product_name} is ready to lend against.`);
      }
      setOpen(false);
    } catch (error) {
      addToast('error', 'Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: LoanProduct) => {
    const next = p.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateLoanProduct(p.id, { status: next });
      addToast('info', 'Status changed', `${p.product_name} is now ${next}.`);
    } catch (error) {
      addToast('error', 'Could not change status', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-16">
      <div className="rounded-lg bg-[#0B4394] p-5 text-white shadow-xs sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <Briefcase className="h-3.5 w-3.5 text-amber-400" />
          Lending Terms
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Loan Products</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          The rate, amount range and repayment period a loan can be written against. Every application picks one.
        </p>
      </div>

      {canManage && (
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-5 text-base font-semibold text-white hover:bg-[#093672] sm:h-10 sm:w-auto sm:text-[13px]"
        >
          <Plus className="h-4 w-4" />
          New loan product
        </button>
      )}

      {loanProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Briefcase className="mx-auto mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm font-bold text-slate-700">No loan products yet</p>
          <p className="mt-1 text-[13px] text-slate-500">
            {canManage
              ? 'Create one before officers can raise loan applications.'
              : 'An Administrator needs to create one before loans can be raised.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {loanProducts.map((p) => (
            <article key={p.id} className="rounded-lg border border-slate-200 bg-white shadow-xs">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-slate-900">{p.product_name}</h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{p.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                      p.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {p.status}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      title={`Edit ${p.product_name}`}
                      aria-label={`Edit ${p.product_name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-[#0B4394]/10 text-[#0B4394] hover:bg-[#0B4394]/20"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </header>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 sm:grid-cols-4">
                <Stat label="Interest" value={`${p.interest_rate}%`} note={p.interest_type} />
                <Stat label="Amount range" value={formatUGX(p.min_amount)} note={`up to ${formatUGX(p.max_amount)}`} />
                <Stat label="Period" value={`${p.min_weeks}–${p.max_weeks} wks`} note="repayment term" />
                <Stat label="Penalty" value={`${p.penalty_rate ?? 0}%`} note={`${p.grace_period_weeks ?? 0} wk grace`} />
              </dl>

              {canManage && (
                <footer className="border-t border-slate-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleStatus(p)}
                    className="text-[12px] font-semibold text-[#0B4394] hover:underline"
                  >
                    {p.status === 'Active' ? 'Deactivate this product' : 'Reactivate this product'}
                  </button>
                </footer>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-slate-500">
        Upfront charges — processing {FEES.processingFeePct}%, CRB {FEES.crbFeePct}%, security{' '}
        {FEES.securityDepositPct}% and UGX {FEES.groupMaintenanceFee.toLocaleString()} group maintenance — are
        institution-wide and apply to every product.
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                {editing ? `Edit ${editing.product_name}` : 'New Loan Product'}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-chetu-red"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">
              <Section title="Product Identity" description="How officers will recognise this product.">
                <div className="space-y-3.5">
                  <div>
                    <label className={label} htmlFor="pname">Product Name *</label>
                    <input
                      id="pname"
                      required
                      value={form.product_name}
                      onChange={(e) => set('product_name', e.target.value)}
                      placeholder="e.g. Umoja Micro Loan"
                      className={field}
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="pdesc">Description</label>
                    <textarea
                      id="pdesc"
                      rows={2}
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="Who this product is for"
                      className={`${field} resize-none`}
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="pstatus">Status *</label>
                    <select id="pstatus" value={form.status} onChange={(e) => set('status', e.target.value as 'Active' | 'Inactive')} className={field}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">Only active products are offered on a new application.</p>
                  </div>
                </div>
              </Section>

              <Section title="Interest" description="How the cost of the loan is calculated.">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="prate">Interest Rate (%) *</label>
                    <input
                      id="prate"
                      type="number"
                      step="0.5"
                      min={0}
                      required
                      value={form.interest_rate}
                      onChange={(e) => set('interest_rate', parseFloat(e.target.value) || 0)}
                      className={field}
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="ptype">Interest Type *</label>
                    <select id="ptype" value={form.interest_type} onChange={(e) => set('interest_type', e.target.value as InterestType)} className={field}>
                      <option value="Flat Rate">Flat Rate</option>
                      <option value="Reducing Balance">Reducing Balance</option>
                    </select>
                  </div>
                </div>
              </Section>

              <Section title="Limits" description="The amount and period an application may request.">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="pmin">Minimum Amount (UGX) *</label>
                    <input id="pmin" type="number" min={0} step={10000} required value={form.min_amount}
                      onChange={(e) => set('min_amount', parseFloat(e.target.value) || 0)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="pmax">Maximum Amount (UGX) *</label>
                    <input id="pmax" type="number" min={0} step={10000} required value={form.max_amount}
                      onChange={(e) => set('max_amount', parseFloat(e.target.value) || 0)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="pminw">Minimum Period (weeks) *</label>
                    <input id="pminw" type="number" min={1} required value={form.min_weeks}
                      onChange={(e) => set('min_weeks', parseInt(e.target.value) || 0)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="pmaxw">Maximum Period (weeks) *</label>
                    <input id="pmaxw" type="number" min={1} required value={form.max_weeks}
                      onChange={(e) => set('max_weeks', parseInt(e.target.value) || 0)} className={field} />
                  </div>
                </div>
              </Section>

              <Section title="Arrears" description="Applied when an instalment is missed.">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="ppen">Penalty Rate (%)</label>
                    <input id="ppen" type="number" step="0.5" min={0} value={form.penalty_rate}
                      onChange={(e) => set('penalty_rate', parseFloat(e.target.value) || 0)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="pgrace">Grace Period (weeks)</label>
                    <input id="pgrace" type="number" min={0} value={form.grace_period_weeks}
                      onChange={(e) => set('grace_period_weeks', parseInt(e.target.value) || 0)} className={field} />
                  </div>
                </div>
              </Section>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)}
                  className="h-[52px] rounded-lg bg-slate-100 px-5 text-base font-semibold text-slate-700 sm:h-10 sm:text-[13px]">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="h-[52px] rounded-lg bg-[#0B4394] px-6 text-base font-semibold text-white hover:bg-[#093672] disabled:opacity-50 sm:h-10 sm:text-[13px]">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{value}</dd>
    {note && <dd className="text-[11px] text-slate-400">{note}</dd>}
  </div>
);
