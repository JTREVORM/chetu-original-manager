import React, { useMemo, useState } from 'react';
import { TableScroll } from '../components/common/ScrollArea';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { ClientGroup } from '../types/database.types';
import { Ban, Search, Pencil, X } from 'lucide-react';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const field = 'form-field';
const label = 'form-label';

export const GroupRejectedList: React.FC = () => {
  const { role, user } = useAuth();
  const { clientGroups, updateClientGroup, branches } = useDatabase();
  const { addToast } = useNotifications();

  const isLoanOfficer = role === 'Loan Officer';

  const [search, setSearch] = useState('');
  const [editingGroup, setEditingGroup] = useState<ClientGroup | null>(null);
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

  const rejectedGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientGroups
      .filter(g => g.approval_status === 'Rejected')
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

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    try {
      await updateClientGroup(editingGroup.id, {
        ...formData,
        approval_status: 'Pending',
        rejection_reason: null,
      });
      addToast('success', 'Resubmitted', `${formData.group_name} was sent back to your Branch Manager for review.`);
      setEditingGroup(null);
    } catch (err: any) {
      addToast('error', 'Resubmit Failed', err?.message || 'Could not resubmit the group.');
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="page-banner p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <Ban className="h-3.5 w-3.5 text-amber-400" />
          Group Approvals
        </div>
        <h1 className="text-2xl font-black tracking-tight">Group Rejected List</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          {isLoanOfficer
            ? 'Groups you submitted that were rejected. Edit and resubmit for another review.'
            : 'Groups that were rejected during approval.'}
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
        <div className="hidden md:block">
<TableScroll>
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600">
                <th className="px-2 py-3">Branch</th>
                <th className="px-2 py-3">LO</th>
                <th className="px-2 py-3">Code</th>
                <th className="px-2 py-3">Group</th>
                <th className="px-2 py-3">Meeting Day</th>
                <th className="px-2 py-3">Reason</th>
                <th className="px-2 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {rejectedGroups.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    No rejected groups.
                  </td>
                </tr>
              )}
              {rejectedGroups.map(group => (
                <tr key={group.id} className="transition-colors hover:bg-slate-50">
                  <td className="truncate px-2 py-3 font-semibold text-slate-700">{group.branch || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.loan_officer_name || '—'}</td>
                  <td className="truncate px-2 py-3 font-bold text-[#0B4394]">{group.group_code}</td>
                  <td className="truncate px-2 py-3 font-bold text-slate-900">{group.group_name}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_day || '—'}</td>
                  <td className="truncate px-2 py-3 text-red-600" title={group.rejection_reason || ''}>{group.rejection_reason || '—'}</td>
                  <td className="px-2 py-3 text-right">
                    {isLoanOfficer ? (
                      <button
                        onClick={() => openEdit(group)}
                        className="rounded-lg bg-blue-50 p-1 text-[#0B4394] transition-colors hover:bg-blue-100"
                        title="Edit and resubmit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
</div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {rejectedGroups.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-400">No rejected groups.</p>
          )}
          {rejectedGroups.map(group => (
            <div key={group.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">{group.group_name}</p>
                  <p className="text-[11px] font-bold text-[#0B4394]">{group.group_code}</p>
                </div>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700">Rejected</span>
              </div>
              <p className="text-[11px] text-red-600">{group.rejection_reason || '—'}</p>
              {isLoanOfficer && (
                <button onClick={() => openEdit(group)} className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394]">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between brand-gradient p-5 text-white">
              <h3 className="text-base font-bold">Edit & Resubmit Group</h3>
              <button onClick={() => setEditingGroup(null)} className="text-slate-300 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="border-b border-slate-100 bg-red-50 px-6 py-3 text-[11px] font-semibold text-red-700">
              Rejected: {editingGroup.rejection_reason}
            </p>
            <form onSubmit={handleResubmit} className="space-y-3.5 p-4 text-xs md:p-6">
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
                  Resubmit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
