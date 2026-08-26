import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '../lib/router-compat';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '@/integrations/supabase/client';
import { UploadCloud } from 'lucide-react';
import { FEES, admissionFees } from '../lib/fees';

const field = 'form-field';
const label = 'form-label';

interface OfficerRow {
  id: string;
  full_name: string;
  branch_ids: string[] | null;
  status: string;
}

export const MemberAdmission: React.FC = () => {
  const { role, user } = useAuth();
  const { clientGroups, branches, addClient } = useDatabase();
  const { addToast } = useNotifications();
  const navigate = useNavigate();

  const isLoanOfficer = role === 'Loan Officer';
  const isBranchManager = role === 'Branch Manager';
  const isAdmin = role === 'Administrator';

  const activeBranches = useMemo(() => {
    const list = branches.filter((b) => b.status === 'Active');
    if (isAdmin) return list;
    const mine = user?.branch_ids ?? [];
    return mine.length ? list.filter((b) => mine.includes(b.id)) : list;
  }, [branches, isAdmin, user?.branch_ids]);

  const branchLocked = isLoanOfficer;
  const officerLocked = isLoanOfficer;

  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [docPreview, setDocPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    branch_id: '',
    group_id: '',
    loan_officer_id: isLoanOfficer ? user?.id || '' : '',
    first_name: '',
    last_name: '',
    phone_number: '',
    nin: '',
    voter_id: '',
    date_of_birth: '',
    gender: '' as '' | 'Male' | 'Female' | 'Other',
    marital_status: '',
    occupation: '',
    physical_address: '',
    district: '',
    division: '',
  });

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  // Lock the branch and officer for a loan officer.
  useEffect(() => {
    if (isLoanOfficer) {
      const mine = user?.branch_ids ?? [];
      set({
        branch_id: mine[0] || activeBranches[0]?.id || '',
        loan_officer_id: user?.id || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoanOfficer, user?.id, user?.branch_ids?.join(','), activeBranches.length]);

  useEffect(() => {
    if (isLoanOfficer) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, branch_ids, status')
        .eq('role', 'Loan Officer')
        .order('full_name');
      if (!cancelled) setOfficers(((data || []) as OfficerRow[]).filter((o) => o.status === 'Active'));
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoanOfficer]);

  const branchOfficers = useMemo(
    () => officers.filter((o) => !form.branch_id || (o.branch_ids || []).includes(form.branch_id)),
    [officers, form.branch_id],
  );

  const availableGroups = useMemo(
    () =>
      clientGroups.filter(
        (g) =>
          g.status === 'Active' &&
          g.approval_status === 'Approved' &&
          (!form.branch_id || g.branch_id === form.branch_id) &&
          (!form.loan_officer_id || !g.loan_officer_id || g.loan_officer_id === form.loan_officer_id),
      ),
    [clientGroups, form.branch_id, form.loan_officer_id],
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setDocPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const missing: string[] = [];
    if (!form.branch_id) missing.push('Branch');
    if (!form.group_id) missing.push('Group');
    if (!form.loan_officer_id) missing.push('Loan Officer');
    if (!form.first_name.trim()) missing.push('First Name');
    if (!form.last_name.trim()) missing.push('Last Name');
    if (!form.phone_number.trim()) missing.push('Contact Number');
    if (!form.nin.trim()) missing.push('National ID');
    if (!form.date_of_birth) missing.push('Date Of Birth');
    if (!form.gender) missing.push('Gender');
    if (!form.physical_address.trim()) missing.push('Address');
    if (!form.district.trim()) missing.push('District');
    if (!form.division.trim()) missing.push('Division');
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const created = await addClient({
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        nin: form.nin.trim(),
        gender: form.gender as any,
        date_of_birth: form.date_of_birth,
        occupation: form.occupation.trim() || 'Not specified',
        employer: '',
        phone_number: form.phone_number.trim(),
        alt_phone_number: '',
        email: '',
        physical_address: form.physical_address.trim(),
        village: form.division.trim(),
        parish: form.division.trim(),
        sub_county: form.division.trim(),
        district: form.district.trim(),
        group_id: form.group_id,
        branch_id: form.branch_id,
        passport_photo: docPreview || '',
        national_id_front: '',
        national_id_back: '',
        date_registered: new Date().toISOString().split('T')[0],
        status: 'Active',
      } as any);

      // Admission and passbook are charged once per member, so upsert on the
      // member: a retry must not double-count the fee income. CRB is zero here
      // because it is charged per loan, not per member.
      const { error: feeError } = await supabase.from('member_fees').upsert(
        {
          client_id: created.id,
          admission_fee: FEES.admissionFee,
          passbook_fee: FEES.passbookFee,
          crb_fee: 0,
          total_amount: admissionFees().total,
          payment_method: 'Cash',
          receipt_number: `CM-ADM-${created.client_number}`,
          branch_id: form.branch_id,
          collected_by: user?.id ?? null,
        },
        { onConflict: 'client_id' },
      );
      // The member is admitted either way; a failed fee row must be visible
      // rather than silently leaving the charge uncollected.
      if (feeError) {
        addToast(
          'warning',
          'Admission fees not recorded',
          `${created.full_name} was admitted, but the UGX ${admissionFees().total.toLocaleString()} admission and passbook charge could not be saved. Record it from Admission & Passbook Sale.`,
        );
      }

      if (created.approval_status === 'Pending') {
        addToast('success', 'Sent for Approval', `${created.full_name} (${created.client_number}) was submitted to your Branch Manager for approval.`);
        navigate('/member-waiting-approval');
      } else {
        addToast('success', 'Member Admitted', `Registered ${created.full_name} (${created.client_number})`);
        navigate('/clients');
      }
    } catch (err: any) {
      addToast('error', 'Admission Failed', err?.message || 'Could not register the member.');
    } finally {
      setSaving(false);
    }
  };

  const lockedBranchName = branches.find((b) => b.id === form.branch_id)?.branch_name || '';

  return (
    <div className="mx-auto max-w-5xl pb-16">
      {/* On desktop the heading sits above the card; on mobile it moves inside,
          matching the rest of the screens. */}
      <h1 className="mb-3 hidden text-xl font-bold text-slate-900 md:block">Member Admission</h1>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h1 className="mb-4 text-2xl font-bold text-slate-900 md:hidden">Member Admission</h1>

        {/* Basic Information */}
        <div className="form-section-title">
          Basic Information
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Branch</label>
            {branchLocked ? (
              <input readOnly value={lockedBranchName || '—'} className={`${field} bg-slate-100`} />
            ) : (
              <select
                value={form.branch_id}
                onChange={(e) => set({ branch_id: e.target.value, group_id: '', loan_officer_id: '' })}
                className={field}
              >
                <option value="">-- Select --</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={label}>Loan Officer</label>
            {officerLocked ? (
              <input readOnly value={user?.full_name || '—'} className={`${field} bg-slate-100`} />
            ) : (
              <select
                value={form.loan_officer_id}
                onChange={(e) => set({ loan_officer_id: e.target.value, group_id: '' })}
                className={field}
                disabled={!isAdmin && !isBranchManager}
              >
                <option value="">-- Select --</option>
                {branchOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={label}>Select Group</label>
            <select value={form.group_id} onChange={(e) => set({ group_id: e.target.value })} className={field}>
              <option value="">-- Select --</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.group_name} ({g.group_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>First Name</label>
            <input value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Last Name</label>
            <input value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Contact Number</label>
            <input
              value={form.phone_number}
              onChange={(e) => set({ phone_number: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>National ID</label>
            <input value={form.nin} onChange={(e) => set({ nin: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Voter ID</label>
            <input value={form.voter_id} onChange={(e) => set({ voter_id: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Date Of Birth</label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => set({ date_of_birth: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Gender</label>
            <select value={form.gender} onChange={(e) => set({ gender: e.target.value as any })} className={field}>
              <option value="">-- Select --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={label}>Marital Status</label>
            <select
              value={form.marital_status}
              onChange={(e) => set({ marital_status: e.target.value })}
              className={field}
            >
              <option value="">Prefer not to say</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Divorced">Divorced</option>
            </select>
          </div>
          <div>
            <label className={label}>Occupation</label>
            <input
              value={form.occupation}
              onChange={(e) => set({ occupation: e.target.value })}
              className={field}
              placeholder="Prefer not to say"
            />
          </div>
        </div>

        {/* Upload */}
        <div className="mt-4">
          <label className={label}>Upload Identity (Documents)</label>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white py-8 text-slate-400 hover:bg-slate-50"
          >
            {docPreview ? (
              <img src={docPreview} alt="Uploaded member document preview" className="h-20 rounded object-contain" />
            ) : (
              <UploadCloud className="h-6 w-6" />
            )}
            <span className="text-[12px]">Click to upload or drag and drop</span>
          </button>
        </div>

        {/* Address Information */}
        <div className="form-section-title mt-6">
          Address Information
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Address</label>
            <input
              value={form.physical_address}
              onChange={(e) => set({ physical_address: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>District</label>
            <input value={form.district} onChange={(e) => set({ district: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Division</label>
            <input value={form.division} onChange={(e) => set({ division: e.target.value })} className={field} />
          </div>
        </div>

        {/* Admission Fees */}
        <div className="form-section-title mt-6">Admission Fees (Payable Now)</div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <label className={label}>Admission Fee</label>
            <input readOnly value={FEES.admissionFee.toLocaleString()} className={`${field} bg-slate-100`} />
          </div>
          <div>
            <label className={label}>Passbook Fee</label>
            <input readOnly value={FEES.passbookFee.toLocaleString()} className={`${field} bg-slate-100`} />
          </div>
          <div>
            <label className={label}>Total Collected</label>
            <input readOnly value={admissionFees().total.toLocaleString()} className={`${field} bg-slate-100 font-bold`} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          CRB fee ({FEES.crbFeePct}% of the loan amount) and the security deposit ({FEES.securityDepositPct}%) are charged
          later, when the member takes a loan.
        </p>



        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-2.5 text-[12px] font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-save mt-6"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
};
