import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router-compat';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../integrations/supabase/client';
import { ClientGroup } from '../types/database.types';
import { formatUGX } from '../lib/loanCalculations';
import {
  Users,
  X,
  Search,
  Pencil,
  Trash2,
  PiggyBank,
  CheckSquare,
  Building
} from 'lucide-react';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const ClientGroups: React.FC = () => {
  const { isAuditor, isAdmin, isBranchManager, role, user } = useAuth();
  const {
    clientGroups,
    updateClientGroup,
    deleteClientGroup,
    clients,
    branches,
    groupAttendance,
    recordGroupAttendance
  } = useDatabase();
  const { addToast } = useNotifications();

  const isLoanOfficer = role === 'Loan Officer';
  const myBranchIds = useMemo(() => user?.branch_ids || [], [user]);

  // Branch is only selectable by Administrators / Auditors.
  const canSelectBranch = isAdmin || isAuditor;
  // Officer is selectable by Administrators, Auditors and Branch Managers.
  const canSelectOfficer = isAdmin || isAuditor || isBranchManager;

  const [officers, setOfficers] = useState<{ id: string; full_name: string; branch_ids?: string[] }[]>([]);

  useEffect(() => {
    if (!canSelectOfficer) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, branch_ids, role, status')
        .eq('role', 'Loan Officer')
        .order('full_name', { ascending: true });
      if (!cancelled && data) {
        setOfficers(
          (data as any[]).map(p => ({ id: p.id, full_name: p.full_name, branch_ids: p.branch_ids || [] }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSelectOfficer]);

  // Draft filters (applied on Search) + applied filters used by the table
  const initialBranch = canSelectBranch ? 'All' : myBranchIds[0] || 'All';
  const initialOfficer = isLoanOfficer ? user?.id || 'All' : 'All';

  const [branchDraft, setBranchDraft] = useState(initialBranch);
  const [officerDraft, setOfficerDraft] = useState(initialOfficer);
  const [dayDraft, setDayDraft] = useState('All');
  const [searchDraft, setSearchDraft] = useState('');

  const [filters, setFilters] = useState({
    branch: initialBranch,
    officer: initialOfficer,
    day: 'All',
    search: ''
  });

  useEffect(() => {
    const b = canSelectBranch ? 'All' : myBranchIds[0] || 'All';
    const o = isLoanOfficer ? user?.id || 'All' : 'All';
    setBranchDraft(b);
    setOfficerDraft(o);
    setFilters(f => ({ ...f, branch: b, officer: o }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canSelectBranch, isLoanOfficer, myBranchIds.join(',')]);

  const applyFilters = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFilters({ branch: branchDraft, officer: officerDraft, day: dayDraft, search: searchDraft });
  };

  const officerOptions = useMemo(() => {
    if (branchDraft === 'All') return officers;
    return officers.filter(o => (o.branch_ids || []).includes(branchDraft));
  }, [officers, branchDraft]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ClientGroup | null>(null);

  const [formData, setFormData] = useState({
    group_name: '',
    village: '',
    branch: '',
    branch_id: '',
    meeting_day: 'Monday',
    meeting_time: '10:00 AM',
    meeting_location: '',
    meeting_frequency: 'Weekly',
    formation_date: '',
    status: 'Active' as 'Active' | 'Inactive' | 'Suspended'
  });

  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [attendanceNotes, setAttendanceNotes] = useState<string>('');

  const openEditModal = (group: ClientGroup) => {
    setSelectedGroup(group);
    setFormData({
      group_name: group.group_name,
      village: group.village || '',
      branch: group.branch,
      branch_id: group.branch_id || '',
      meeting_day: group.meeting_day || 'Monday',
      meeting_time: group.meeting_time || '10:00 AM',
      meeting_location: group.meeting_location || '',
      meeting_frequency: group.meeting_frequency || 'Weekly',
      formation_date: group.formation_date || '',
      status: group.status
    });
    setIsEditModalOpen(true);
  };

  const openAttendanceModal = (group: ClientGroup) => {
    setSelectedGroup(group);
    setSelectedAttendees(clients.filter(c => c.group_id === group.id).map(m => m.id));
    setIsAttendanceModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    try {
      await updateClientGroup(selectedGroup.id, { ...formData, formation_date: formData.formation_date || undefined });
      addToast('success', 'Group Updated', `Updated group ${formData.group_name}`);
      setIsEditModalOpen(false);
      setSelectedGroup(null);
    } catch {
      addToast('error', 'Update Failed', 'Could not update group.');
    }
  };

  const handleDelete = (group: ClientGroup) => {
    if (window.confirm(`Delete group "${group.group_name}"? Members in this group will be unassigned.`)) {
      deleteClientGroup(group.id);
      addToast('info', 'Group Deleted', `Removed group ${group.group_name}`);
    }
  };

  const handleAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    try {
      await recordGroupAttendance(selectedGroup.id, attendanceDate, selectedAttendees, attendanceNotes);
      addToast('success', 'Attendance Recorded', `Logged meeting attendance for ${selectedGroup.group_name}`);
      setIsAttendanceModalOpen(false);
      setSelectedGroup(null);
    } catch {
      addToast('error', 'Action Failed', 'Could not record attendance.');
    }
  };

  const getGroupMembers = (groupId: string) => clients.filter(c => c.group_id === groupId);

  const filteredGroups = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return clientGroups.filter(g => {
      if (g.approval_status !== 'Approved') return false;
      const matchesSearch =
        !term ||
        g.group_name.toLowerCase().includes(term) ||
        g.group_code.toLowerCase().includes(term);
      const matchesBranch = filters.branch === 'All' || g.branch_id === filters.branch;
      const matchesOfficer = filters.officer === 'All' || g.loan_officer_id === filters.officer;
      const matchesDay = filters.day === 'All' || (g.meeting_day || '') === filters.day;
      return matchesSearch && matchesBranch && matchesOfficer && matchesDay;
    });
  }, [clientGroups, filters]);

  const totalMembers = filteredGroups.reduce((s, g) => s + getGroupMembers(g.id).length, 0);
  const totalSavings = filteredGroups.reduce((s, g) => s + Number(g.group_savings || 0), 0);

  const officerName = (g: ClientGroup) =>
    g.loan_officer_name || officers.find(o => o.id === g.loan_officer_id)?.full_name || 'Unassigned';

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const selectCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0B4394]/40 disabled:bg-slate-100 disabled:text-slate-500';
  const labelCls = 'mb-1 block text-[11px] font-bold text-slate-700';

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="rounded-2xl bg-[#0B4394] p-6 text-white shadow-xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <Building className="h-3.5 w-3.5 text-amber-400" />
          Group Register
        </div>
        <h1 className="text-2xl font-black tracking-tight">Group List</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          All peer lending groups with their officers, meeting schedules and membership.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Groups', value: String(filteredGroups.length), icon: Building },
          { label: 'Registered Members', value: String(totalMembers), icon: Users },
          { label: 'Group Savings', value: formatUGX(totalSavings), icon: PiggyBank }
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B4394]/10 text-[#0B4394]">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="text-base font-black text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar (matches Group List layout) */}
      <form onSubmit={applyFilters} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={labelCls}>Select Branch</label>
            <select
              value={branchDraft}
              disabled={!canSelectBranch}
              onChange={(e) => {
                setBranchDraft(e.target.value);
                if (!isLoanOfficer) setOfficerDraft('All');
              }}
              className={selectCls}
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.branch_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Loan Officer</label>
            <select
              value={officerDraft}
              disabled={!canSelectOfficer}
              onChange={(e) => setOfficerDraft(e.target.value)}
              className={selectCls}
            >
              {isLoanOfficer ? (
                <option value={user?.id || 'All'}>{user?.full_name}</option>
              ) : (
                <>
                  <option value="All">-- Select --</option>
                  {officerOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className={labelCls}>Meeting Day</label>
            <select value={dayDraft} onChange={(e) => setDayDraft(e.target.value)} className={selectCls}>
              <option value="All">-- Select --</option>
              {MEETING_DAYS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-900"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-stretch gap-2">
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by Group name / Group code"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4394]/40"
          />
          <button
            type="submit"
            className="flex items-center justify-center rounded-lg bg-[#0B4394] px-4 text-white hover:bg-blue-900"
            aria-label="Search groups"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="hidden md:block">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[14%]" />
            </colgroup>

            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600">
                <th className="px-2 py-3">Branch</th>
                <th className="px-2 py-3">LO</th>
                <th className="px-2 py-3">Code</th>
                <th className="px-2 py-3">Group</th>
                <th className="px-2 py-3">Day</th>
                <th className="px-2 py-3">Freq.</th>
                <th className="px-2 py-3">Location</th>
                <th className="px-2 py-3">Time</th>
                <th className="px-2 py-3">Formed</th>
                <th className="px-2 py-3 text-right">Members</th>
                <th className="px-2 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400">
                    No groups found. Use <Link to="/group-create" className="font-bold text-[#0B4394]">Groups &rsaquo; Group Create</Link> to register one.
                  </td>
                </tr>
              )}
              {filteredGroups.map(group => (
                <tr key={group.id} className="transition-colors hover:bg-slate-50">
                  <td className="truncate px-2 py-3 font-semibold text-slate-700" title={group.branch || '—'}>{group.branch || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700" title={officerName(group)}>{officerName(group)}</td>
                  <td className="truncate px-2 py-3 font-bold text-[#0B4394]" title={group.group_code}>{group.group_code}</td>
                  <td className="truncate px-2 py-3 font-bold text-slate-900" title={group.group_name}>{group.group_name}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_day || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_frequency || 'Weekly'}</td>
                  <td className="truncate px-2 py-3 text-slate-700" title={group.meeting_location || group.village || '—'}>{group.meeting_location || group.village || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{group.meeting_time || '—'}</td>
                  <td className="truncate px-2 py-3 text-slate-700">{formatDate(group.formation_date)}</td>
                  <td className="px-2 py-3 text-right font-bold text-slate-900">{getGroupMembers(group.id).length}</td>

                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button

                        onClick={() => openAttendanceModal(group)}
                        className="rounded-lg bg-amber-400 p-1 text-blue-950 transition-colors hover:bg-amber-500"
                        title="Take Meeting Attendance"
                      >
                        <CheckSquare className="h-4 w-4" />
                      </button>
                      {!isAuditor && (
                        <>
                          <button
                            onClick={() => openEditModal(group)}
                            className="rounded-lg bg-blue-50 p-1 text-[#0B4394] transition-colors hover:bg-blue-100"
                            title="Edit Group"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(group)}
                              className="rounded-lg bg-red-50 p-1 text-red-600 transition-colors hover:bg-red-100"
                              title="Delete Group"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
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
          {filteredGroups.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-400">No groups found.</p>
          )}
          {filteredGroups.map(group => (
            <div key={group.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">{group.group_name}</p>
                  <p className="text-[11px] font-bold text-[#0B4394]">{group.group_code}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {group.meeting_frequency || 'Weekly'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <p>Branch: <strong className="text-slate-900">{group.branch || '—'}</strong></p>
                <p>LO: <strong className="text-slate-900">{officerName(group)}</strong></p>
                <p>Day: <strong className="text-slate-900">{group.meeting_day || '—'}</strong></p>
                <p>Time: <strong className="text-slate-900">{group.meeting_time || '—'}</strong></p>
                <p>Location: <strong className="text-slate-900">{group.meeting_location || group.village || '—'}</strong></p>
                <p>Formed: <strong className="text-slate-900">{formatDate(group.formation_date)}</strong></p>
                <p>Members: <strong className="text-slate-900">{getGroupMembers(group.id).length}</strong></p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button onClick={() => openAttendanceModal(group)} className="rounded-lg bg-amber-400 p-1.5 text-blue-950">
                  <CheckSquare className="h-4 w-4" />
                </button>
                {!isAuditor && (
                  <>
                    <button onClick={() => openEditModal(group)} className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(group)} className="rounded-lg bg-red-50 p-1.5 text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Group Modal */}
      {isEditModalOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between bg-[#0B4394] p-5 text-white">
              <h3 className="text-base font-bold">Edit Client Group</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-300 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-3.5 p-4 text-xs md:p-6">
              <div>
                <label className="form-label">Group Name *</label>
                <input
                  type="text"
                  required
                  value={formData.group_name}
                  onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="form-label">Branch *</label>
                  <select
                    required
                    value={formData.branch_id}
                    onChange={(e) => {
                      const branch = branches.find(b => b.id === e.target.value);
                      setFormData({ ...formData, branch_id: e.target.value, branch: branch?.branch_name || '' });
                    }}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  >
                    <option value="">{branches.length ? 'Select Branch' : 'No branches available'}</option>
                    {branches.filter(b => b.status === 'Active').map(b => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Village</label>
                  <input
                    type="text"
                    value={formData.village}
                    onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="form-label">Meeting Day</label>
                  <select
                    value={formData.meeting_day}
                    onChange={(e) => setFormData({ ...formData, meeting_day: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  >
                    {MEETING_DAYS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Frequency</label>
                  <select
                    value={formData.meeting_frequency}
                    onChange={(e) => setFormData({ ...formData, meeting_frequency: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  >
                    {['Daily', 'Weekly', 'Monthly'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Meeting Time</label>
                  <input
                    type="text"
                    value={formData.meeting_time}
                    onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="form-label">Formation Date</label>
                  <input
                    type="date"
                    value={formData.formation_date}
                    onChange={(e) => setFormData({ ...formData, formation_date: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full rounded-xl border px-3 py-2 font-medium"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Meeting Location</label>
                <input
                  type="text"
                  value={formData.meeting_location}
                  onChange={(e) => setFormData({ ...formData, meeting_location: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 font-medium"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B4394] px-5 py-2 font-bold text-white shadow-md hover:bg-blue-900"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Register Modal */}
      {isAttendanceModalOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between bg-amber-500 p-5 text-blue-950">
              <h3 className="flex items-center gap-2 text-base font-black">
                <CheckSquare className="h-5 w-5" />
                Meeting Attendance Register
              </h3>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-blue-950 hover:opacity-75">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAttendanceSubmit} className="space-y-4 p-4 text-xs md:p-6">
              <div>
                <label className="form-label">Group Name</label>
                <input
                  type="text"
                  disabled
                  value={selectedGroup.group_name}
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Meeting Date</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="form-label">Members Present</label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border bg-slate-50 p-3">
                  {getGroupMembers(selectedGroup.id).map(m => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedAttendees.includes(m.id)}
                        onChange={(e) =>
                          setSelectedAttendees(
                            e.target.checked
                              ? [...selectedAttendees, m.id]
                              : selectedAttendees.filter(id => id !== m.id)
                          )
                        }
                        className="rounded text-[#0B4394] focus:ring-0"
                      />
                      <span>{m.full_name} ({m.client_number})</span>
                    </label>
                  ))}
                  {getGroupMembers(selectedGroup.id).length === 0 && (
                    <p className="text-[11px] text-slate-400">No members assigned to this group yet.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="form-label">Meeting Minutes / Notes</label>
                <textarea
                  value={attendanceNotes}
                  onChange={(e) => setAttendanceNotes(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border px-3 py-2 font-medium"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsAttendanceModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 font-black text-blue-950 shadow-md hover:bg-amber-600"
                >
                  Save Attendance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
