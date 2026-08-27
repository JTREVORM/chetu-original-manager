import React, { useMemo, useState } from 'react';
import { TableScroll } from '../components/common/ScrollArea';
import { Plus } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { calculateLoanSchedule } from '../lib/loanCalculations';
import { FEES, loanFees, feeLines, validateLoanRequest } from '../lib/fees';
import { Client } from '../types/database.types';
import {
  Field,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  MisDataCard,
  MisColumn,
  SearchButton,
  ScopeFields,
  money,
  shortDate,
  useMisScope,
} from '../components/mis/MisKit';

const LOAN_PURPOSES = [
  'Agriculture - Birds Farm',
  'Agriculture - Crop Farming',
  'Business - Stock Purchase',
  'Business - Expansion',
  'Education / School Fees',
  'Transport / Boda Boda',
  'Home Improvement',
  'Other',
];

/** Loan Application — group-first member search, then per-member application form. */
export const LoanApplications: React.FC = () => {
  const scope = useMisScope();
  const { clients, clientGroups, loanProducts } = useDatabase();
  const { addToast } = useNotifications();

  const canApply = scope.isAdmin || scope.isLoanOfficer;

  const [term, setTerm] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applyFor, setApplyFor] = useState<Client | null>(null);

  const groupOf = (id?: string | null) => clientGroups.find((g) => g.id === id);

  const rows = useMemo(() => {
    if (!hasSearched) return [];
    const q = term.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.status !== 'Active') return false;
      if (scope.groupId && c.group_id !== scope.groupId) return false;
      if (!scope.groupId && scope.branchId && c.branch_id !== scope.branchId) return false;
      if (scope.isLoanOfficer && c.loan_officer_id && c.loan_officer_id !== scope.user?.id) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.client_number.toLowerCase().includes(q) ||
        (c.phone_number || '').toLowerCase().includes(q)
      );
    });
  }, [clients, hasSearched, term, scope.groupId, scope.branchId, scope.isLoanOfficer, scope.user?.id]);

  const columns: MisColumn<Client>[] = [
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => scope.branchName(r.branch_id) },
    { key: 'lo', label: 'LO', width: '10%', render: (r) => scope.officerName(r.loan_officer_id) },
    {
      key: 'product',
      label: 'Product',
      width: '11%',
      render: () => loanProducts[0]?.product_name || '—',
    },
    { key: 'gcode', label: 'Group Code', width: '9%', render: (r) => groupOf(r.group_id)?.group_code || '—' },
    { key: 'gname', label: 'Group Name', width: '10%', render: (r) => groupOf(r.group_id)?.group_name || '—' },
    { key: 'mcode', label: 'Member Code', width: '10%', render: (r) => r.client_number },
    {
      key: 'mname',
      label: 'Member Name',
      width: '12%',
      render: (r) => <span className="font-semibold text-slate-900">{r.full_name}</span>,
      text: (r) => r.full_name,
    },
    { key: 'phone', label: 'Contact Number', width: '10%', render: (r) => r.phone_number },
    { key: 'dob', label: 'Date Of Birth', width: '9%', render: (r) => shortDate(r.date_of_birth) },
    { key: 'nin', label: 'Id Number', width: '9%', render: (r) => r.nin },
    {
      key: 'action',
      label: 'Action',
      width: '6%',
      align: 'center',
      hideOnMobile: false,
      render: (r) =>
        canApply ? (
          <button
            type="button"
            onClick={() => setApplyFor(r)}
            title="Apply for loan"
            aria-label={`Apply for loan for ${r.full_name}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#F5A623] text-white hover:bg-[#dd9319]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-12">
      <MisPageTitle>Loan Application</MisPageTitle>

      <MisFilters
        title="Loan Application"
        cols={4}
        searchValue={term}
        onSearchChange={setTerm}
        searchPlaceholder="Search by Member name, code / Contact Number"
        onSubmit={() => setHasSearched(true)}
      >
        <ScopeFields scope={scope} withGroup />
        <Field label="&nbsp;">
          <SearchButton onClick={() => setHasSearched(true)} />
        </Field>
      </MisFilters>

      <MisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        hasSearched={hasSearched}
        idleMessage="Select a group and press Search to list its members."
        emptyMessage="No members found!"
        mobileTitle={(r) => r.full_name}
        mobileSubtitle={(r) => r.client_number}
      />

      {applyFor && (
        <LoanApplicationAdd
          member={applyFor}
          onClose={() => setApplyFor(null)}
          onSaved={(msg) => {
            addToast('success', 'Loan Application', msg);
            setApplyFor(null);
          }}
        />
      )}
    </div>
  );
};

/** "Loan Application Add" dialog — product details, schema, principal, guarantor picker, declaration. */
const LoanApplicationAdd: React.FC<{
  member: Client;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ member, onClose, onSaved }) => {
  const { clients, loanProducts, submitLoanApplication } = useDatabase();
  const { addToast } = useNotifications();

  const activeProducts = loanProducts.filter((p) => p.status === 'Active');
  const [productId, setProductId] = useState(activeProducts[0]?.id || loanProducts[0]?.id || '');
  const product = loanProducts.find((p) => p.id === productId);

  const [purpose, setPurpose] = useState(LOAN_PURPOSES[0]);
  const [weeks, setWeeks] = useState(product?.min_weeks || 12);
  const [amount, setAmount] = useState(product?.min_amount || 100000);
  const [guarantorId, setGuarantorId] = useState('');
  const [consent, setConsent] = useState<'yes' | 'no' | ''>('');
  const [saving, setSaving] = useState(false);

  const schemaOptions = useMemo(() => {
    const min = product?.min_weeks || 4;
    const max = product?.max_weeks || 52;
    const out: number[] = [];
    for (let w = min; w <= max; w += 4) out.push(w);
    if (!out.includes(max)) out.push(max);
    return out;
  }, [product?.min_weeks, product?.max_weeks]);

  const calc = useMemo(
    () =>
      product
        ? calculateLoanSchedule(amount, product.interest_rate, product.interest_type, weeks, FEES.processingFeePct)
        : null,
    [product, amount, weeks],
  );

  const fees = useMemo(() => loanFees(amount), [amount]);
  const breakdown = useMemo(() => feeLines(amount), [amount]);
  const validationErrors = useMemo(
    () => validateLoanRequest(amount, weeks, product ?? null),
    [amount, weeks, product],
  );

  const guarantorPool = clients.filter(
    (c) => c.id !== member.id && c.status === 'Active' && (!member.group_id || c.group_id === member.group_id),
  );
  const guarantor = clients.find((c) => c.id === guarantorId);

  const save = async () => {
    if (!product) return addToast('error', 'Loan Application', 'Select a loan product.');
    if (validationErrors.length) return addToast('error', 'Loan Application', validationErrors[0]);
    if (!guarantor) return addToast('error', 'Loan Application', 'Select a guarantor.');
    if (consent !== 'yes') return addToast('error', 'Loan Application', 'The member must accept the declaration.');
    setSaving(true);
    try {
      await submitLoanApplication({
        client_id: member.id,
        product_id: product.id,
        requested_amount: amount,
        requested_weeks: weeks,
        loan_purpose: purpose,
        guarantor_name: guarantor.full_name,
        guarantor_phone: guarantor.phone_number,
        guarantor_relationship: 'Family Member',
        guarantor_nin: guarantor.nin,
        guarantor_address: guarantor.physical_address,
      } as never);
      onSaved(`Application for ${member.full_name} submitted for approval.`);
    } catch (err) {
      addToast('error', 'Loan Application', err instanceof Error ? err.message : 'Could not submit application.');
    } finally {
      setSaving(false);
    }
  };


  // Plain heading, as the original screens use — the boxed-in red variant read
  // as a validation error on mobile, where every label sat inside a red frame.
  const sectionLabel = (t: string) => (
    <div className="mb-2 text-base font-semibold text-slate-800 md:text-[11px] md:font-bold">{t}</div>
  );

  return (
    <MisModal open onClose={onClose} title="Loan Application Add" width="max-w-5xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-1 border-b border-slate-200 pb-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Member Name</p>
            <p className="text-sm font-bold text-slate-900">{member.full_name}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gender</p>
            <p className="text-sm font-bold text-slate-900">{member.gender}</p>
          </div>
        </div>

        <div>
          {sectionLabel('Select Loan Product Details')}
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = loanProducts.find((x) => x.id === e.target.value);
              if (p) {
                setWeeks(p.min_weeks);
                setAmount(p.min_amount);
              }
            }}
            className="form-field"
          >
            {(activeProducts.length ? activeProducts : loanProducts).map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name} ({p.interest_rate}% {p.interest_type}) - {p.min_weeks}.00
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            {sectionLabel('Loan Purpose')}
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="form-field">
              {LOAN_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            {sectionLabel('Loan Schema')}
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="form-field">
              {schemaOptions.map((w) => (
                <option key={w} value={w}>
                  {w} Weeks
                </option>
              ))}
            </select>
          </div>
          <div>
            {sectionLabel('Principal Amount')}
            <input
              type="number"
              value={amount}
              min={product?.min_amount || 0}
              max={product?.max_amount || undefined}
              step={10000}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="form-field"
            />
          </div>
        </div>

        {calc && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] sm:grid-cols-4">
            <Summary label="First Repayment" value={shortDate(calc.firstRepaymentDate)} />
            <Summary label="Final Due Date" value={shortDate(calc.finalDueDate)} />
            <Summary label="Weekly Installment" value={money(calc.weeklyInstallment)} />
            <Summary label="Interest" value={money(calc.totalInterestAmount)} />
            <Summary label="Total Payable" value={money(calc.totalAmountPayable)} />
            <Summary label="Principal" value={money(amount)} />
          </div>
        )}

        <div>
          {sectionLabel('Charges & Deductions')}
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded border border-slate-200 bg-amber-50/60 p-3 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
            {breakdown.map((line) => (
              <Summary key={line.label} label={line.label} value={money(line.amount)} />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Processing {FEES.processingFeePct}% + CRB {FEES.crbFeePct}% + Security {FEES.securityDepositPct}% of{' '}
            {money(amount)} plus a fixed {money(FEES.groupMaintenanceFee)} group maintenance fee ={' '}
            {money(fees.totalDeductions)} deducted at disbursement.
          </p>
        </div>

        {validationErrors.length > 0 && (
          <ul className="space-y-1 rounded border border-chetu-red/40 bg-red-50 p-3 text-[11px] font-semibold text-red-700">
            {validationErrors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}


        {/* Week-by-week preview, so the member can see the repayment plan
            before the application is submitted. */}
        {calc && calc.schedule.length > 0 && (
          <div>
            {sectionLabel('Repayment Schedule')}

            <div className="space-y-2.5 md:hidden">
              {calc.schedule.map((row) => (
                <MisDataCard
                  key={row.week_number}
                  rows={[
                    { label: 'Installment No.', value: row.week_number },
                    { label: 'Payment Date', value: shortDate(row.due_date) },
                    { label: 'Principal Amount', value: money(row.principal_portion) },
                    { label: 'Interest Amount', value: money(row.interest_portion) },
                    { label: 'Installment Amount', value: money(row.installment_amount) },
                    { label: 'Balance', value: money(row.remaining_balance) },
                  ]}
                />
              ))}
            </div>

            <div className="hidden md:block">
<TableScroll className="rounded border border-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Installment No.</th>
                    <th className="px-2 py-2">Payment Date</th>
                    <th className="px-2 py-2 text-right">Principal Amount</th>
                    <th className="px-2 py-2 text-right">Interest Amount</th>
                    <th className="px-2 py-2 text-right">Installment Amount</th>
                    <th className="px-2 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calc.schedule.map((row) => (
                    <tr key={row.week_number} className="hover:bg-slate-50">
                      <td className="px-2 py-2 font-semibold text-slate-900">{row.week_number}</td>
                      <td className="px-2 py-2">{shortDate(row.due_date)}</td>
                      <td className="px-2 py-2 text-right">{money(row.principal_portion)}</td>
                      <td className="px-2 py-2 text-right">{money(row.interest_portion)}</td>
                      <td className="px-2 py-2 text-right">{money(row.installment_amount)}</td>
                      <td className="px-2 py-2 text-right">{money(row.remaining_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
</div>
          </div>
        )}

        <div>
          {sectionLabel('Select Guarantor :')}

          <div className="space-y-2.5 md:hidden">
            {guarantorPool.length === 0 && (
              <p className="rounded-lg bg-[#eaf1f8] px-4 py-6 text-center text-[13px] text-slate-500">
                No eligible guarantors in this group.
              </p>
            )}
            {guarantorPool.map((g) => (
              <MisDataCard
                key={g.id}
                rows={[
                  { label: 'Name', value: g.full_name },
                  { label: 'Contact Number', value: g.phone_number },
                  { label: 'National ID', value: g.nin },
                  { label: 'Voter ID', value: g.voter_id || '' },
                  { label: 'Guarantor Type', value: 'Group Member' },
                ]}
                footer={
                  <label className="flex w-full items-center gap-2 text-[13px] font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="guarantor-mobile"
                      checked={guarantorId === g.id}
                      onChange={() => setGuarantorId(g.id)}
                      aria-label={`Select ${g.full_name} as guarantor`}
                      className="h-5 w-5 accent-[#0B4394]"
                    />
                    Select
                  </label>
                }
              />
            ))}
          </div>

          <div className="hidden md:block">
<TableScroll className="rounded border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Contact Number</th>
                  <th className="px-2 py-2">National ID</th>
                  <th className="px-2 py-2">Voter ID</th>
                  <th className="px-2 py-2">Guarantor Type</th>
                  <th className="px-2 py-2 text-center">Select</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guarantorPool.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-slate-400">
                      No eligible guarantors in this group.
                    </td>
                  </tr>
                )}
                {guarantorPool.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="px-2 py-2 font-semibold text-slate-900">{g.full_name}</td>
                    <td className="px-2 py-2">{g.phone_number}</td>
                    <td className="px-2 py-2">{g.nin}</td>
                    <td className="px-2 py-2">{g.voter_id || '—'}</td>
                    <td className="px-2 py-2">Family Member</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="radio"
                        name="guarantor"
                        checked={guarantorId === g.id}
                        onChange={() => setGuarantorId(g.id)}
                        aria-label={`Select ${g.full_name} as guarantor`}
                        className="h-4 w-4 accent-[#0B4394]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
</div>
        </div>

        <div>
          {sectionLabel('Declaration :')}
          <p className="text-[11px] leading-relaxed text-slate-600">
            This declaration will be applicable to my heirs or successors in title or other persons concerned. Until I
            fully repay the entire loan amount, interest and service charges levied, the institution reserves the right
            to take possession of the assets/security made by this loan. All assets/security thus acquired will not be
            transferable until they said loan amount is fully paid. I will abide by all the terms and conditions set out
            in the loan agreement. Failure to repay the entire loan amount will make the institution take the
            appropriate legal action against me. I hereby give the consent to share my personal information with third
            parties, including law enforcement agencies, credit reference bureaus and similar institutions, networking
            institutions, etc.
          </p>
          <div className="mt-3 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-800">
              <input
                type="radio"
                name="consent"
                checked={consent === 'yes'}
                onChange={() => setConsent('yes')}
                className="h-4 w-4 accent-emerald-600"
              />
              I Consent
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-800">
              <input
                type="radio"
                name="consent"
                checked={consent === 'no'}
                onChange={() => setConsent('no')}
                className="h-4 w-4 accent-chetu-red"
              />
              I Don&apos;t Consent
            </label>
          </div>
        </div>

        <button
          type="button"
          disabled={saving || consent !== 'yes' || !guarantorId || validationErrors.length > 0}
          onClick={save}
          className="w-full rounded bg-[#F5A623] py-2.5 text-xs font-bold text-white hover:bg-[#dd9319] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </MisModal>
  );
};

/**
 * A computed figure. On mobile the original renders these as read-only form
 * fields stacked under a plain label, matching the editable fields above them;
 * on desktop they stay a compact two-line pair so the grid stays dense.
 */
const Summary: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="form-label md:text-[10px] md:font-bold md:uppercase md:tracking-wide md:text-slate-400">{label}</p>
    <input readOnly value={value} className="form-field bg-slate-100 md:hidden" />
    <p className="hidden font-bold text-slate-800 md:block">{value}</p>
  </div>
);
