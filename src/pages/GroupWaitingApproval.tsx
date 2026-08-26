import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { ClientGroup } from '../types/database.types';
import { Clock, Search, Pencil, Check, X, Building } from 'lucide-react';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const field = 'form-field';
const label = 'form-label';

export const GroupWaitingApproval: React.FC = () => {
  const { role, user, isAdmin, isBranchManager, isAuditor } = useAuth();
  const { clientGroups, updateClientGroup, approveClientGroup, rejectClientGroup, branches } = useDatabase();
  const { addToast } = useNotifications();

  const isLoanOfficer = role === 'Loan Officer';
  const canReview = isAdmin || isBranchManager;

  const [search, setSearch] = useState('');
  const [editingGroup, setEditingGroup] = useState<ClientGroup | null>(null);
  const [rejectingGroup, setRejectingGroup] = useState<ClientGroup | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    group_name: '',
    village: '',
    branch_id: '',
    branch: '',
    meeting_day: 'Monday',
    meeting_time: '10:00 AM',
    meeting_location: '',
    meeting_frequency: 'Weekly',
    formation_date: '',
  });

  const pendingGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientGroups
      .filter(g => g.approval_status === 'Pending')
      .filter(g => (isLoanOfficer ? g.created_by === user?.id : true))
      .filter(g =>
        !term ||
        g.group_name.toLowerCase().includes(term) ||
        g.group_code.toLowerCase().includes(term)
      );
  }, [clientGroups, isLoanOfficer, user?.id, search]);

  const openEdit = (group: ClientGroup) => {
    setEditingGroup(group);
    setFormData({
      group_name: group.group_name,
      village: group.village || '',
      branch_id: group.branch_id || '',
      branch: group.branch,
      meeting_day: group.meeting_day || 'Monday',
      meeting_time: group.meeting_time || '10:00 AM',
      meeting_location: group.meeting_location || '',
      meeting_frequency: group.meeting_frequency || 'Weekly',
      formation_date: group.formation_date || '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    try {
      await updateClientGroup(editingGroup.id, formData);
      addToast('success', 'Group Updated', `Updated group ${formData.group_name}`);
      setEditingGroup(null);
    } catch {
      addToast('error', 'Update Failed', 'Could not update the group.');
    }
  };

  const handleApprove = async (group: ClientGroup) => {
    setBusyId(group.id);
    try {
      await approveClientGroup(group.id);
      addToast('success', 'Group Approved', `${group.group_name} is now active.`);
    } catch (err: any) {
      addToast('error', 'Approval Failed', err?.message || 'Could not approve the group.');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (group: ClientGroup) => {
    setRejectingGroup(group);
    setRejectReason('');
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingGroup || !rejectReason.trim()) return;
    setBusyId(rejectingGroup.id);
    try {
      await rejectClientGroup(rejectingGroup.id, rejectReason.trim());
      addToast('info', 'Group Rejected', `${rejectingGroup.group_name} was rejected.`);
      setRejectingGroup(null);
    } catch (err: any) {
      addToast('error', 'Rejection Failed', err?.message || 'Could not reject the group.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="rounded-2xl bg-[#0B4394] p-6 text-white shadow-xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Group Approvals
        </div>
        <h1 className="text-2xl font-black tracking-tight">Waiting for Approval Group</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          {canReview
            ? 'Groups awaiting your review before they can operate.'
            : 'Groups you submitted that are awaiting Branch Manager approval.'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Group name / Group code"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4394]/40"
          />
          <span className="flex items-center justify-center rounded-lg bg-[#0B4394] px-4 text-white">
            <Search className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600">
                <th className="px-2 py-3">Branch</th>
                <th className="px-2 py-3">LO</th>
                <th className="px-2 py-3">Code</th>
                <th className="px-2 py-3">Group</th>
                <th className="px-2 py-3">Meeting Day</th>
                <th className="px-2 py-3">Frequency</th>
                <th className="px-2 py-3">Location</th>
                <th className="px-2 py-3">Formation Date</th>
                <th className="px-2 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {pendingGroups.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400">
                    No groups waiting for approval.
                  </td>
                </tr>
              )}
              {pendingGroups.map(group => (
                <tr key={group.id} className="transition-colors hover:bg-slate-50">
                  <td className="truncate px-2 py-3 font-semibold text-slate-700">{group.branch || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.loan_officer_name || '—'}</td>
                  <td className="truncate px-2 py-3 font-bold text-[#0B4394]">{group.group_code}</td>
                  <td className="truncate px-2 py-3 font-bold text-slate-900">{group.group_name}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_day || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_frequency || 'Weekly'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_location || group.village || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.formation_date || '—'}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isLoanOfficer && (
                        <button
                          onClick={() => openEdit(group)}
                          className="rounded-lg bg-blue-50 p-1 text-[#0B4394] transition-colors hover:bg-blue-100"
                          title="Edit Group"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canReview && (
                        <>
                          <button
                            disabled={busyId === group.id}
                            onClick={() => handleApprove(group)}
                            className="rounded-lg bg-green-100 p-1 text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50"
                            title="Approve Group"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            disabled={busyId === group.id}
                            onClick={() => openReject(group)}
                            className="rounded-lg bg-red-100 p-1 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                            title="Reject Group"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {isAuditor && !isLoanOfficer && (
                        <span className="text-[10px] font-semibold text-slate-400">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {pendingGroups.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-400">No groups waiting for approval.</p>
          )}
          {pendingGroups.map(group => (
            <div key={group.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">{group.group_name}</p>
                  <p className="text-[11px] font-bold text-[#0B4394]">{group.group_code}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">Pending</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <p>Branch: <strong className="text-slate-900">{group.branch || '—'}</strong></p>
                <p>LO: <strong className="text-slate-900">{group.loan_officer_name || '—'}</strong></p>
                <p>Day: <strong className="text-slate-900">{group.meeting_day || '—'}</strong></p>
                <p>Formed: <strong className="text-slate-900">{group.formation_date || '—'}</strong></p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {isLoanOfficer && (
                  <button onClick={() => openEdit(group)} className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394]">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canReview && (
                  <>
                    <button disabled={busyId === group.id} onClick={() => handleApprove(group)} className="rounded-lg bg-green-100 p-1.5 text-green-700 disabled:opacity-50">
                      <Check className="h-4 w-4" />
                    </button>
                    <button disabled={busyId === group.id} onClick={() => openReject(group)} className="rounded-lg bg-red-100 p-1.5 text-red-700 disabled:opacity-50">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal (Loan Officer resubmission) */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between bg-[#0B4394] p-5 text-white">
              <h3 className="text-base font-bold">Edit Group Submission</h3>
              <button onClick={() => setEditingGroup(null)} className="text-slate-300 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3.5 p-4 text-xs md:p-6">
              <div>
                <label className={label}>Group Name *</label>
                <input
                  type="text"
                  required
                  value={formData.group_name}
                  onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                  className={field}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={label}>Branch *</label>
                  <select
                    required
                    value={formData.branch_id}
                    onChange={(e) => {
                      const branch = branches.find(b => b.id === e.target.value);
                      setFormData({ ...formData, branch_id: e.target.value, branch: branch?.branch_name || '' });
                    }}
                    className={field}
                  >
                    <option value="">Select Branch</option>
                    {branches.filter(b => b.status === 'Active').map(b => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Village</label>
                  <input
                    type="text"
                    value={formData.village}
                    onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    className={field}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={label}>Meeting Day</label>
                  <select
                    value={formData.meeting_day}
                    onChange={(e) => setFormData({ ...formData, meeting_day: e.target.value })}
                    className={field}
                  >
                    {MEETING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Frequency</label>
                  <select
                    value={formData.meeting_frequency}
                    onChange={(e) => setFormData({ ...formData, meeting_frequency: e.target.value })}
                    className={field}
                  >
                    {['Daily', 'Weekly', 'Monthly'].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Meeting Time</label>
                  <input
                    type="text"
                    value={formData.meeting_time}
                    onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })}
                    className={field}
                  />
                </div>
              </div>
              <div>
                <label className={label}>Meeting Location</label>
                <input
                  type="text"
                  value={formData.meeting_location}
                  onChange={(e) => setFormData({ ...formData, meeting_location: e.target.value })}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Formation Date</label>
                <input
                  type="date"
                  value={formData.formation_date}
                  onChange={(e) => setFormData({ ...formData, formation_date: e.target.value })}
                  className={field}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end">
                <button type="button" onClick={() => setEditingGroup(null)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-[#0B4394] px-5 py-2 font-bold text-white shadow-md hover:bg-blue-900">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal (Branch Manager / Administrator) */}
      {rejectingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between bg-red-600 p-5 text-white">
              <h3 className="flex items-center gap-2 text-base font-black">
                <Building className="h-5 w-5" />
                Reject Group
              </h3>
              <button onClick={() => setRejectingGroup(null)} className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit} className="space-y-4 p-6 text-xs">
              <p className="text-slate-600">
                Rejecting <strong className="text-slate-900">{rejectingGroup.group_name}</strong> ({rejectingGroup.group_code}). The Loan Officer will be able to edit and resubmit it.
              </p>
              <div>
                <label className={label}>Reason for rejection *</label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full resize-none rounded-xl border px-3 py-2 font-medium"
                  placeholder="Explain what needs to change before this group can be approved"
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-3 md:flex-row md:justify-end">
                <button type="button" onClick={() => setRejectingGroup(null)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={busyId === rejectingGroup.id} className="rounded-xl bg-red-600 px-5 py-2 font-black text-white shadow-md hover:bg-red-700 disabled:opacity-50">
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
