import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { Profile, UserRole } from '../types/database.types';
import { supabase } from '../lib/supabase';
import { adminUsers } from '../lib/admin-users.functions';
import { sendNotification } from '../lib/notify';

import { UserCog, UserPlus, Plus, Key, X, Lock, Camera, Pencil } from 'lucide-react';
import { Avatar } from '../components/common/Avatar';

export const UserManagement: React.FC = () => {
  const { user, isAuditor, isAdmin } = useAuth();
  const { logAudit, branches, dataVersion } = useDatabase();
  const { addToast } = useNotifications();

  const [usersList, setUsersList] = useState<Profile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    password: '',
    role: 'Loan Officer' as UserRole,
    email: '',
    branch_ids: [] as string[]
  });

  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone_number: '',
    role: 'Loan Officer' as UserRole,
    email: '',
    status: 'Active' as 'Active' | 'Inactive' | 'Suspended',
    branch_ids: [] as string[]
  });

  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [editAvatarPreview, setEditAvatarPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setUsersList(data as Profile[]);
    setIsLoadingUsers(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [dataVersion]);

  // All privileged actions (create, edit role/status, reset password) go through
  // a server function that holds the service-role key server-side and re-checks
  // that the caller is an active Administrator before doing anything.
  const callAdminUsers = async (payload: Record<string, unknown>) => {
    return (await adminUsers({ data: payload as never })) as { profile?: Profile };
  };


  const isSelf = (u: Profile) => !!user && u.id === user.id;

  const openCreateModal = () => {
    setFormData({ full_name: '', phone_number: '', password: '', role: 'Loan Officer', email: '', branch_ids: [] });
    setAvatarPreview('');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (u: Profile) => {
    setEditingUser(u);
    setEditFormData({
      full_name: u.full_name,
      phone_number: u.phone_number,
      role: u.role,
      email: u.email || '',
      status: u.status,
      branch_ids: u.branch_ids || []
    });
    setEditAvatarPreview(u.avatar_url || '');
    setIsEditModalOpen(true);
  };

  // Branch attachment constrains branch-scoped staff; Administrators and
  // Auditors always work across the whole institution.
  const toggleBranch = (list: string[], id: string) =>
    list.includes(id) ? list.filter(b => b !== id) : [...list, id];

  const saveBranchAttachment = async (profileId: string, role: UserRole, branchIds: string[]) => {
    const value = role === 'Loan Officer' || role === 'Branch Manager' ? branchIds : [];
    const { error } = await supabase.from('profiles').update({ branch_ids: value }).eq('id', profileId);
    if (error) throw new Error(`Saved the user, but branch attachment failed: ${error.message}`);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneRegex = /^07\d{8}$/;
    if (!phoneRegex.test(formData.phone_number.trim())) {
      addToast('error', 'Validation Error', 'Phone number must be exactly 10 digits and start with 07 (e.g. 0772123456).');
      return;
    }
    if ((formData.role === 'Loan Officer' || formData.role === 'Branch Manager') && formData.branch_ids.length === 0) {
      addToast('error', 'Validation Error', 'Select at least one branch for this loan officer.');
      return;
    }
    if (formData.password.length < 8) {
      addToast('error', 'Validation Error', 'Password must be at least 8 characters.');
      return;
    }
    // The email is the sign-in credential, so it has to be real and present.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email.trim())) {
      addToast('error', 'Validation Error', 'Enter a valid email address — it is what this user signs in with.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await callAdminUsers({
        action: 'create',
        full_name: formData.full_name,
        phone_number: formData.phone_number.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
        branch_ids: formData.branch_ids
      });

      if (result?.profile?.id) {
        await saveBranchAttachment(result.profile.id, formData.role, formData.branch_ids);
      }

      addToast('success', 'User Created', `Created ${formData.role} user ${formData.full_name}`);
      logAudit('User Creation', 'User Management', `New ${formData.role} account created for ${formData.full_name} (${formData.phone_number}).`, result?.profile?.id);
      await sendNotification({
        title: 'Staff account created',
        message: `${formData.full_name} was added as a ${formData.role}.`,
        type: 'System',
        audience: 'admins',
        link_url: '/users',
        excludeId: user?.id,
        includeActor: true,
      });
      setIsCreateModalOpen(false);
      setFormData({ full_name: '', phone_number: '', password: '', role: 'Loan Officer', email: '', branch_ids: [] });
      setAvatarPreview('');
      fetchUsers();
    } catch (err) {
      addToast('error', 'Creation Failed', err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const phoneRegex = /^07\d{8}$/;
    if (!phoneRegex.test(editFormData.phone_number.trim())) {
      addToast('error', 'Validation Error', 'Phone number must be exactly 10 digits and start with 07 (e.g. 0772123456).');
      return;
    }

    if ((editFormData.role === 'Loan Officer' || editFormData.role === 'Branch Manager') && editFormData.branch_ids.length === 0) {
      addToast('error', 'Validation Error', 'Select at least one branch for this loan officer.');
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editFormData.email.trim())) {
      addToast('error', 'Validation Error', 'Enter a valid email address — it is what this user signs in with.');
      return;
    }

    setIsSubmitting(true);
    try {
      await callAdminUsers({
        action: 'update',
        id: editingUser.id,
        full_name: editFormData.full_name,
        phone_number: editFormData.phone_number.trim(),
        email: editFormData.email.trim().toLowerCase(),
        role: editFormData.role,
        status: editFormData.status,
        branch_ids: editFormData.branch_ids
      });

      await saveBranchAttachment(editingUser.id, editFormData.role, editFormData.branch_ids);

      addToast('success', 'User Updated', `Updated profile for ${editFormData.full_name}`);
      logAudit('Updated User Profile', 'User Management', `Updated profile for ${editFormData.full_name} (${editFormData.phone_number}). Role: ${editFormData.role}, Status: ${editFormData.status}.`, editingUser.id);
      await sendNotification({
        title: 'Staff account updated',
        message: `${editFormData.full_name} is now a ${editFormData.role} (${editFormData.status}).`,
        type: 'System',
        audience: 'admins',
        recipientIds: [editingUser.id],
        link_url: '/users',
        excludeId: user?.id,
        includeActor: true,
      });
      setIsEditModalOpen(false);
      setEditingUser(null);
      setEditAvatarPreview('');
      fetchUsers();
    } catch (err) {
      addToast('error', 'Update Failed', err instanceof Error ? err.message : 'Could not update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    if (newPassword.length < 8) {
      addToast('error', 'Validation Error', 'Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await callAdminUsers({ action: 'resetPassword', id: selectedUser.id, password: newPassword });
      addToast('success', 'Password Reset', `Successfully updated password for ${selectedUser.full_name}`);
      logAudit('Password Reset', 'User Management', `Password was reset for user account: ${selectedUser.full_name} (${selectedUser.phone_number}).`, selectedUser.id);
      await sendNotification({
        title: 'Password reset',
        message: `An Administrator reset the password for ${selectedUser.full_name}.`,
        type: 'Alert',
        audience: 'admins',
        recipientIds: [selectedUser.id],
        link_url: '/users',
        excludeId: user?.id,
        includeActor: true,
      });
      setIsResetModalOpen(false);
      setNewPassword('');
      setSelectedUser(null);
    } catch (err) {
      addToast('error', 'Reset Failed', err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (target: Profile) => {
    const nextStatus = target.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await callAdminUsers({ action: 'setStatus', id: target.id, status: nextStatus });
      addToast('info', 'User Status Updated', `${target.full_name} is now ${nextStatus}`);
      logAudit('User Status Updated', 'User Management', `${target.full_name}'s account status changed to ${nextStatus}.`, target.id);
      const reactivated = nextStatus === 'Active';
      await sendNotification({
        title: reactivated ? 'Staff account reactivated' : 'Staff account deactivated',
        message: reactivated
          ? `${target.full_name} (${target.role}) can sign in again.`
          : `${target.full_name} (${target.role}) can no longer sign in.`,
        // A deactivation is a control event, so it is flagged rather than filed.
        type: reactivated ? 'System' : 'Alert',
        audience: 'admins',
        // The person themselves is told too — it decides whether they can work.
        recipientIds: [target.id],
        link_url: '/users',
        excludeId: user?.id,
        includeActor: true,
      });
      fetchUsers();
    } catch (err) {
      addToast('error', 'Update Failed', err instanceof Error ? err.message : 'Could not change status');
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleEditAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <UserCog className="h-3.5 w-3.5 text-amber-400" />
          Staff Accounts
        </div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Staff accounts, the role each one holds and the branches they are attached to.
        </p>
      </div>

      {isAdmin && !isAuditor && (
        <button
          onClick={openCreateModal}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-5 text-base font-semibold text-white hover:bg-[#093672] sm:h-10 sm:w-auto sm:text-[13px]"
        >
          <UserPlus className="h-4 w-4" />
          New staff account
        </button>
      )}


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoadingUsers && (
          <p className="text-xs text-slate-500 col-span-full">Loading staff accounts…</p>
        )}
        {!isLoadingUsers && usersList.length === 0 && (
          <p className="text-xs text-slate-500 col-span-full">No staff accounts yet.</p>
        )}
        {usersList.map((u) => {
          const self = isSelf(u);
          return (
            <div key={u.id} className={`bg-white p-5 rounded-lg border shadow-xs flex flex-col justify-between space-y-4 ${self ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3">
                <Avatar
                  src={u.avatar_url}
                  name={u.full_name}
                  className={`w-12 h-12 shrink-0 rounded-xl ring-2 ${self ? 'ring-amber-300' : 'ring-slate-100'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.role === 'Administrator' ? 'bg-amber-100 text-amber-800' :
                      u.role === 'Branch Manager' ? 'bg-indigo-100 text-indigo-800' :
                      u.role === 'Auditor' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {u.role}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {self && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 uppercase tracking-wide">
                          Current Session
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        u.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {u.status}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">{u.full_name}</h3>
                  <p className="text-xs text-slate-500 truncate">{u.phone_number}</p>
                  {u.email && <p className="text-[10px] text-slate-400 truncate">{u.email}</p>}
                  {(u.role === 'Loan Officer' || u.role === 'Branch Manager') && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Branches: {(u.branch_ids || []).length === 0
                        ? 'None attached'
                        : branches.filter(b => (u.branch_ids || []).includes(b.id)).map(b => b.branch_name).join(', ') || 'Unknown'}
                    </p>
                  )}
                </div>
              </div>

              {!isAuditor && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => !self && toggleUserStatus(u)}
                    disabled={self}
                    className={`text-xs font-bold px-3 py-1 rounded-xl border transition-colors ${
                      self
                        ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                        : u.status === 'Active'
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={self ? 'Cannot modify your own account' : `Toggle ${u.status}`}
                  >
                    {self ? 'Locked' : u.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => !self && openEditModal(u)}
                      disabled={self}
                      className={`flex items-center gap-1 ${self ? 'text-slate-300 cursor-not-allowed' : 'text-[#0B4394] hover:underline'}`}
                      title={self ? 'Cannot edit your own account' : 'Edit User'}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">Edit</span>
                    </button>
                    <button
                      onClick={() => !self && (() => { setSelectedUser(u); setIsResetModalOpen(true); })()}
                      disabled={self}
                      className={`flex items-center gap-1 ${self ? 'text-slate-300 cursor-not-allowed' : 'text-amber-600 hover:underline'}`}
                      title={self ? 'Cannot reset your own password here' : 'Reset Password'}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">Reset</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-[calc(100vw-1.5rem)] md:w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Register New Staff User</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="form-label">Profile Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                    >
                      Upload Photo
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g. Sarah Namubiru"
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="+256 700 000 000"
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Password *</label>
                <input
                  type="text"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Set initial password"
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@example.com"
                  className="form-field"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This is what the staff member signs in with. They can also sign in with their phone number.
                </p>
              </div>

              <div>
                <label className="form-label">User Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="form-field"
                >
                  <option value="Loan Officer">Loan Officer</option>
                  <option value="Branch Manager">Branch Manager</option>
                  <option value="Administrator">Administrator</option>
                  <option value="Auditor">Auditor</option>
                </select>
              </div>

                  {(formData.role === 'Loan Officer' || formData.role === 'Branch Manager') && (
                <div>
                  <label className="form-label">Attached Branches *</label>
                  {branches.length === 0 ? (
                    <p className="text-[11px] text-amber-600 font-semibold">No branches exist yet. Create branches first in the Branch Network module.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {branches.map(b => (
                        <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={formData.branch_ids.includes(b.id)}
                            onChange={() => setFormData({ ...formData, branch_ids: toggleBranch(formData.branch_ids, b.id) })}
                          />
                          <span>{b.branch_name} <span className="text-slate-400">({b.branch_code})</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">Branch Managers and Loan Officers only see records in their attached branches.</p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-4 border-t md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0B4394] text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-900 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating…' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-[calc(100vw-1.5rem)] md:w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Edit User Profile</h3>
              <button onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={editFormData.phone_number}
                  onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })}
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="name@example.com"
                  className="form-field"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Changing this changes what the user signs in with.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">User Role *</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                    className="form-field"
                  >
                    <option value="Loan Officer">Loan Officer</option>
                    <option value="Branch Manager">Branch Manager</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Auditor">Auditor</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Status *</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                    className="form-field"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

                  {(editFormData.role === 'Loan Officer' || editFormData.role === 'Branch Manager') && (
                <div>
                  <label className="form-label">Attached Branches *</label>
                  {branches.length === 0 ? (
                    <p className="text-[11px] text-amber-600 font-semibold">No branches exist yet. Create branches first in the Branch Network module.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {branches.map(b => (
                        <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={editFormData.branch_ids.includes(b.id)}
                            onChange={() => setEditFormData({ ...editFormData, branch_ids: toggleBranch(editFormData.branch_ids, b.id) })}
                          />
                          <span>{b.branch_name} <span className="text-slate-400">({b.branch_code})</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">Branch Managers and Loan Officers only see records in their attached branches.</p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-4 border-t md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-[calc(100vw-1.5rem)] md:w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-amber-500 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Reset User Password
              </h3>
              <button onClick={() => { setIsResetModalOpen(false); setNewPassword(''); setSelectedUser(null); }} className="text-white hover:opacity-75">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="form-label">User Name</label>
                <input
                  type="text"
                  disabled
                  value={selectedUser.full_name}
                  className="form-field"
                />
              </div>

              <div>
                <label className="form-label">New Password *</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium border-amber-200 focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">User will use this password for their next login.</p>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-4 border-t md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => { setIsResetModalOpen(false); setNewPassword(''); setSelectedUser(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md hover:bg-amber-600 disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
