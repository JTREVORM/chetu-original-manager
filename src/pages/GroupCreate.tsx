import React, { useMemo, useState } from 'react';
import { useNavigate } from '../lib/router-compat';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../integrations/supabase/client';
import { Building, UserPlus, MapPin, Calendar, Save, ArrowLeft } from 'lucide-react';

const Section: React.FC<{ title: string; description?: string; icon?: React.ElementType; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="mb-5">
    <div className="form-section-title">{title}</div>
    {description && <p className="mb-2 text-[11px] text-slate-500">{description}</p>}
    {children}
  </section>
);

const field = 'form-field';
const label = 'form-label';

export const GroupCreate: React.FC = () => {
  const { role, user } = useAuth();
  const { branches, addClientGroup } = useDatabase();
  const { addToast } = useNotifications();
  const navigate = useNavigate();

  const isLoanOfficer = role === 'Loan Officer';
  const activeBranches = useMemo(() => branches.filter((b) => b.status === 'Active'), [branches]);
  const lockedBranch = isLoanOfficer && activeBranches.length === 1 ? activeBranches[0] : null;

  const [saving, setSaving] = useState(false);
  const [officers, setOfficers] = useState<{ id: string; full_name: string; branch_ids?: string[] }[]>([]);
  const [formData, setFormData] = useState({
    group_name: '',
    village: '',
    branch: lockedBranch?.branch_name || '',
    branch_id: lockedBranch?.id || '',
    loan_officer_id: isLoanOfficer ? user?.id || '' : '',
    loan_officer_name: isLoanOfficer ? user?.full_name || '' : '',
    meeting_day: 'Monday',
    meeting_time: '10:00 AM',
    meeting_location: '',
    meeting_frequency: 'Weekly',
    formation_date: new Date().toISOString().split('T')[0],
    status: 'Active' as 'Active' | 'Inactive' | 'Suspended',
  });


  // Keep the locked branch in sync once branches finish loading
  React.useEffect(() => {
    if (lockedBranch && !formData.branch_id) {
      setFormData((prev) => ({ ...prev, branch_id: lockedBranch.id, branch: lockedBranch.branch_name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedBranch?.id]);

  // Administrators pick the managing loan officer from the staff attached to the branch
  React.useEffect(() => {
    if (isLoanOfficer) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, branch_ids, role, status')
        .eq('role', 'Loan Officer')
        .order('full_name', { ascending: true });
      if (!cancelled && data) {
        setOfficers(
          (data as any[])
            .filter((p) => p.status !== 'Inactive' && p.status !== 'Suspended')
            .map((p) => ({ id: p.id, full_name: p.full_name, branch_ids: p.branch_ids || [] })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoanOfficer]);

  const branchOfficers = useMemo(
    () =>
      formData.branch_id
        ? officers.filter((o) => (o.branch_ids || []).includes(formData.branch_id))
        : officers,
    [officers, formData.branch_id],
  );


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branch_id) {
      addToast('error', 'Branch Required', 'Select the branch this group belongs to.');
      return;
    }
    if (!formData.loan_officer_id) {
      addToast('error', 'Loan Officer Required', 'Select the loan officer who will manage this group.');
      return;
    }
    setSaving(true);
    try {
      const created = await addClientGroup(formData);
      if (created.approval_status === 'Pending') {
        addToast('success', 'Sent for Approval', `${created.group_name} (${created.group_code}) was submitted to your Branch Manager for approval.`);
        navigate('/groups/waiting-approval');
      } else {
        addToast('success', 'Group Created', `Created group ${created.group_name} (${created.group_code})`);
        navigate('/client-groups');
      }
    } catch (err: any) {
      addToast('error', 'Creation Failed', err?.message || 'Could not create the group. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <div className="page-banner p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <UserPlus className="h-3.5 w-3.5 text-amber-400" />
          New Lending Group
        </div>
        <h1 className="text-2xl font-black tracking-tight">Group Create</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          Register a peer lending group, assign its loan officer and set the meeting schedule.
        </p>
      </div>

      {/* The form sits on a white card, as every other form screen does —
          without it the fields floated directly on the page background. */}
      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <Section title="Group Identity" description="Basic details identifying the group in the register." icon={Building}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={label}>Group Name *</label>
              <input
                type="text"
                required
                value={formData.group_name}
                onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                placeholder="e.g. Kalerwe Market Traders"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Branch *</label>
              {lockedBranch ? (
                <input readOnly value={lockedBranch.branch_name} className={`${field} bg-slate-100 font-bold`} />
              ) : (
                <select
                  required
                  value={formData.branch_id}
                  onChange={(e) => {
                    const branch = branches.find((b) => b.id === e.target.value);
                    setFormData({
                      ...formData,
                      branch_id: e.target.value,
                      branch: branch?.branch_name || '',
                      ...(isLoanOfficer ? {} : { loan_officer_id: '', loan_officer_name: '' }),
                    });
                  }}
                  className={field}
                >
                  <option value="">{activeBranches.length ? 'Select Branch' : 'No branches available'}</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              )}
              {lockedBranch && (
                <p className="mt-1 text-[10px] font-medium text-slate-500">Fixed to your attached branch.</p>
              )}
            </div>
            <div>
              <label className={label}>Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className={field}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
        </Section>

        <Section title="Assignment" description="Officer responsible for this group." icon={UserPlus}>
          <div>

            <label className={label}>Managing Loan Officer *</label>
            {isLoanOfficer ? (
              <>
                <input readOnly value={formData.loan_officer_name || user?.full_name || ''} className={`${field} bg-slate-100 font-bold`} />
                <p className="mt-1 text-[10px] font-medium text-slate-500">Locked to your account — you will manage this group.</p>
              </>
            ) : (
              <>
                <select
                  required
                  value={formData.loan_officer_id}
                  onChange={(e) => {
                    const officer = branchOfficers.find((o) => o.id === e.target.value);
                    setFormData({ ...formData, loan_officer_id: e.target.value, loan_officer_name: officer?.full_name || '' });
                  }}
                  className={field}
                >
                  <option value="">
                    {formData.branch_id
                      ? branchOfficers.length
                        ? 'Select Loan Officer'
                        : 'No loan officers attached to this branch'
                      : 'Select a branch first'}
                  </option>
                  {branchOfficers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] font-medium text-slate-500">Only officers attached to the selected branch are listed.</p>
              </>
            )}
          </div>
        </Section>


        <Section title="Location & Meetings" description="Where and when the group convenes each week." icon={MapPin}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={label}>Village / LC1</label>
              <input
                type="text"
                value={formData.village}
                onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                placeholder="Village / location"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Meeting Location</label>
              <input
                type="text"
                value={formData.meeting_location}
                onChange={(e) => setFormData({ ...formData, meeting_location: e.target.value })}
                placeholder="e.g. Kalerwe Market Hall"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Meeting Day</label>
              <select
                value={formData.meeting_day}
                onChange={(e) => setFormData({ ...formData, meeting_day: e.target.value })}
                className={field}
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Meeting Time</label>
              <input
                type="text"
                value={formData.meeting_time}
                onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })}
                placeholder="e.g. 10:00 AM"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Meeting Frequency *</label>
              <select
                value={formData.meeting_frequency}
                onChange={(e) => setFormData({ ...formData, meeting_frequency: e.target.value })}
                className={field}
              >
                {['Daily', 'Weekly', 'Monthly'].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Group Formation Date *</label>
              <input
                type="date"
                required
                value={formData.formation_date}
                onChange={(e) => setFormData({ ...formData, formation_date: e.target.value })}
                className={field}
              />
            </div>
          </div>
        </Section>


        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={() => navigate('/client-groups')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B4394] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-900 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </form>

      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <Calendar className="h-3.5 w-3.5" />
        A unique group code is generated automatically on save.
      </p>
    </div>
  );
};
