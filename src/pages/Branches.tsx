import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { Branch } from '../types/database.types';
import { Building2, Plus, X, Pencil, Trash2, Users, MapPin, Phone } from 'lucide-react';

const emptyForm = {
  branch_name: '',
  branch_code: '',
  location: '',
  phone: '',
  manager_name: '',
  status: 'Active' as 'Active' | 'Inactive'
};

export const Branches: React.FC = () => {
  const { isAdmin, isAuditor } = useAuth();
  const { branches, clients, clientGroups, addBranch, updateBranch, deleteBranch } = useDatabase();
  const canManage = isAdmin && !isAuditor;
  const { addToast } = useNotifications();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...emptyForm, branch_code: `BR-${String(branches.length + 1).padStart(3, '0')}` });
    setIsModalOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setFormData({
      branch_name: branch.branch_name,
      branch_code: branch.branch_code,
      location: branch.location || '',
      phone: branch.phone || '',
      manager_name: branch.manager_name || '',
      status: branch.status
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateBranch(editing.id, formData);
        addToast('success', 'Branch Updated', `${formData.branch_name} was updated.`);
      } else {
        await addBranch(formData);
        addToast('success', 'Branch Created', `${formData.branch_name} is now available across the system.`);
      }
      setIsModalOpen(false);
      setEditing(null);
      setFormData(emptyForm);
    } catch (err) {
      addToast('error', 'Save Failed', err instanceof Error ? err.message : 'Could not save branch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (branch: Branch) => {
    try {
      await deleteBranch(branch.id);
      addToast('success', 'Branch Removed', `${branch.branch_name} was deleted.`);
    } catch (err) {
      addToast('error', 'Delete Failed', err instanceof Error ? err.message : 'Could not delete branch');
    } finally {
      setConfirmDelete(null);
    }
  };

  const countFor = (branchId: string) => ({
    clients: clients.filter(c => c.branch_id === branchId).length,
    groups: clientGroups.filter(g => g.branch_id === branchId).length
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          Branch Network
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Branch Network</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Every branch the institution operates. Staff, groups and members are all attached to one.
        </p>
      </div>

      {canManage && (
        <button
          onClick={openCreate}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-5 text-base font-semibold text-white hover:bg-[#093672] sm:h-10 sm:w-auto sm:text-[13px]"
        >
          <Plus className="h-4 w-4" />
          New branch
        </button>
      )}


      {branches.length === 0 && (
        <div className="bg-white p-8 rounded-lg border border-dashed border-slate-300 text-center">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No branches yet.</p>
          <p className="text-[11px] text-slate-500 mt-1">Create your first branch to start assigning loan officers and members.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {branches.map(branch => {
          const counts = countFor(branch.id);
          return (
            <div key={branch.id} className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{branch.branch_name}</h3>
                  <p className="text-[11px] font-semibold text-slate-500">{branch.branch_code}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${branch.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                  {branch.status}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-600">
                {branch.location && (
                  <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-chetu-blue" />{branch.location}</p>
                )}
                {branch.phone && (
                  <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-chetu-blue" />{branch.phone}</p>
                )}
                {branch.manager_name && (
                  <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-chetu-blue" />{branch.manager_name}</p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-700">
                <span>{counts.clients} members</span>
                <span>{counts.groups} groups</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button onClick={() => openEdit(branch)} className="flex items-center gap-1 text-chetu-blue hover:underline text-xs font-bold">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                {confirmDelete === branch.id ? (
                  <>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs font-bold text-slate-500 hover:underline">Cancel</button>
                    <button onClick={() => handleDelete(branch)} className="text-xs font-bold text-red-600 hover:underline">Confirm</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(branch.id)} className="flex items-center gap-1 text-red-600 hover:underline text-xs font-bold">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div data-testid="branch-modal" className="w-[calc(100vw-1.5rem)] md:w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-chetu-blue text-white flex items-center justify-between">
              <h3 className="text-base font-bold">{editing ? 'Edit Branch' : 'Create New Branch'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditing(null); }} className="text-slate-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="form-label">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={formData.branch_name}
                  onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                  placeholder="e.g. Mbarara Branch"
                  className="form-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Branch Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.branch_code}
                    onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
                    className="form-field"
                  />
                </div>
                <div>
                  <label className="form-label">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                    className="form-field"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Location / Town</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="form-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Branch Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="form-field"
                  />
                </div>
                <div>
                  <label className="form-label">Branch Manager</label>
                  <input
                    type="text"
                    value={formData.manager_name}
                    onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
                    className="form-field"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-4 border-t md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditing(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-chetu-blue text-white rounded-xl text-xs font-bold shadow-md hover:bg-chetu-darkblue disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
