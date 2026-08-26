import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useNotifications } from '../../context/NotificationContext';
import { X, Eye, EyeOff, Lock, UserCheck, ShieldCheck, ChevronLeft } from 'lucide-react';
import { Avatar } from './Avatar';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { logAudit } = useDatabase();
  const { addToast } = useNotifications();

  const [view, setView] = useState<'details' | 'password'>('details');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen || !user) return null;

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError('');
    setSuccess('');
  };

  const handleOpenPassword = () => {
    resetPasswordForm();
    setView('password');
  };

  const handleBackToDetails = () => {
    resetPasswordForm();
    setView('details');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    if (currentPassword !== newPassword) {
      setSuccess('Password changed successfully.');
      logAudit('Password Change', 'User Profile', `${user.full_name} changed their account password.`, user.id);
      addToast('success', 'Password Updated', 'Your password has been changed successfully.');
      setTimeout(() => {
        resetPasswordForm();
        setView('details');
      }, 1200);
    } else {
      setError('New password must be different from current password.');
    }
  };

  const handleClose = () => {
    resetPasswordForm();
    setView('details');
    onClose();
  };

  const PasswordField = ({
    label,
    value,
    onChange,
    show,
    onToggleShow,
    placeholder
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    placeholder: string;
  }) => (
    <div>
      <label className="form-label">{label}</label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Lock className="h-4 w-4" />
        </div>
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
        {/* Identity card — the avatar, who they are and what they can reach. */}
        <div className="bg-[#0B4394] px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar
                src={user.avatar_url}
                name={user.full_name}
                className="h-14 w-14 shrink-0 rounded-full ring-2 ring-white/30"
              />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold leading-tight">{user.full_name}</h3>
                <p className="mt-0.5 text-[12px] text-blue-200">{user.phone_number}</p>
                <span className="mt-1.5 inline-block rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {user.role}
                </span>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close profile"
              className="shrink-0 rounded p-1.5 text-blue-100 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {view === 'details' && (
          <div className="p-5">
            <dl className="divide-y divide-slate-100">
              <Row label="Phone number" value={user.phone_number || '—'} hint="This is also your sign-in name" />
              {user.email && <Row label="Account email" value={user.email} hint="Derived from your phone number" />}
              <Row label="Role" value={user.role} />
              <Row label="Status" value={user.status || 'Active'} />
              <Row
                label="Member since"
                value={new Date(user.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              />
            </dl>

            <button
              type="button"
              onClick={handleOpenPassword}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Lock className="h-4 w-4" />
              Change password
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Your name, role and branch are maintained by an Administrator in User Management.
            </p>
          </div>
        )}

        {/* Password Change View */}
        {view === 'password' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <button
              type="button"
              onClick={handleBackToDetails}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Profile
            </button>

            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <UserCheck className="w-4 h-4 text-chetu-blue shrink-0" />
              <p className="text-[11px] font-semibold text-slate-700">
                Enter your current password and choose a new one.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-800 font-medium">
                <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <PasswordField
              label="Current Password *"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(!showCurrent)}
              placeholder="Enter current password"
            />

            <PasswordField
              label="New Password *"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew(!showNew)}
              placeholder="Enter new password"
            />

            <PasswordField
              label="Confirm New Password *"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(!showConfirm)}
              placeholder="Re-enter new password"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleBackToDetails}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-chetu-blue text-white rounded-xl text-xs font-bold shadow-md hover:bg-chetu-darkblue"
              >
                Update Password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="py-2.5">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-[13px] font-semibold text-slate-900">{value}</dd>
    {hint && <dd className="text-[11px] text-slate-400">{hint}</dd>}
  </div>
);
