import React, { useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Calendar,
  Camera,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/common/Avatar';

/** What each role may reach, stated plainly rather than as a permission matrix. */
const ROLE_SUMMARY: Record<string, string> = {
  Administrator: 'Full access to every branch, staff account and system setting.',
  'Branch Manager': 'Approvals, disbursements and reporting for your assigned branches.',
  'Loan Officer': 'Your own groups and members: admissions, applications and collections.',
  Auditor: 'Read-only access across the institution, including the audit trail.',
};

const MIN_PASSWORD = 8;

export const ProfilePage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { branches, logAudit } = useDatabase();
  const { addToast } = useNotifications();

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const myBranches = useMemo(() => {
    const ids = user?.branch_ids || [];
    if (!ids.length) return [];
    return branches.filter((b) => ids.includes(b.id));
  }, [branches, user?.branch_ids]);

  if (!user) return null;

  const joined = new Date(user.created_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Not an image', 'Choose a JPG or PNG file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('error', 'Photo too large', 'Choose an image under 2 MB.');
      return;
    }

    setAvatarBusy(true);
    try {
      // Stored inline on the profile row as a data URL, the same way User
      // Management already handles staff photos — no storage bucket involved.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: dataUrl })
        .eq('id', user.id);
      if (dbError) throw dbError;

      await refreshProfile();
      await logAudit('Profile Photo Updated', 'User Profile', `${user.full_name} updated their profile photo.`, user.id);
      addToast('success', 'Photo updated', 'Your profile photo has been changed.');
    } catch (err) {
      addToast('error', 'Upload failed', err instanceof Error ? err.message : 'Could not update your photo.');
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!current || !next || !confirm) return setError('Fill in all three fields.');
    if (next.length < MIN_PASSWORD) return setError(`Your new password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return setError('The new password and its confirmation do not match.');
    if (next === current) return setError('Your new password must be different from your current one.');

    setSaving(true);
    try {
      // Re-authenticate first: Supabase will happily change the password of an
      // open session without proving the current one, which would let anyone
      // at an unlocked screen take over the account.
      const email = user.email;
      if (!email) throw new Error('This account has no email address on file. Ask an Administrator to reset it.');

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) {
        setError('Your current password is not correct.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;

      await logAudit('Password Change', 'User Profile', `${user.full_name} changed their account password.`, user.id);
      addToast('success', 'Password changed', 'Use your new password the next time you sign in.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  const strength = passwordStrength(next);

  return (
    <div className="space-y-5 pb-12">
      {/* Identity banner — the same navy header every admin screen opens with. */}
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <UserRound className="h-3.5 w-3.5 text-amber-400" />
          My Profile
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Avatar
              src={user.avatar_url}
              name={user.full_name}
              className="h-20 w-20 rounded-full ring-4 ring-white/25"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              title="Change profile photo"
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-blue-950 ring-2 ring-[#0B4394] transition hover:bg-amber-400 disabled:opacity-70"
            >
              {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{user.full_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-blue-950">
                <BadgeCheck className="h-3.5 w-3.5" />
                {user.role}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  (user.status || 'Active') === 'Active'
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'bg-red-400/20 text-red-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    (user.status || 'Active') === 'Active' ? 'bg-emerald-300' : 'bg-red-300'
                  }`}
                />
                {user.status || 'Active'}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-blue-100">
              {ROLE_SUMMARY[user.role] || 'Your access is set by an Administrator.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ---------- Account details ---------- */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-xs lg:col-span-2">
          <header className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Account details</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Your name, role and branches are maintained by an Administrator in User Management.
            </p>
          </header>

          <dl className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
            <DetailRow icon={Phone} label="Phone number" value={user.phone_number || '—'} hint="Also your sign-in name" />
            <DetailRow icon={Mail} label="Account email" value={user.email || '—'} hint="Used for password changes" />
            <DetailRow icon={ShieldCheck} label="Role" value={user.role} />
            <DetailRow icon={Calendar} label="Member since" value={joined} />
          </dl>

          <div className="border-t border-slate-200 px-5 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Building2 className="h-3.5 w-3.5" />
              Branch access
            </p>
            {myBranches.length ? (
              <div className="flex flex-wrap gap-2">
                {myBranches.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700"
                  >
                    <Building2 className="h-3.5 w-3.5 text-[#0B4394]" />
                    {b.branch_name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">
                Institution-wide — you are not restricted to particular branches.
              </p>
            )}
          </div>
        </section>

        {/* ---------- Change password ---------- */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
          <header className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <KeyRound className="h-4 w-4 text-[#0B4394]" />
              Change password
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              You will stay signed in on this device.
            </p>
          </header>

          <form onSubmit={handlePassword} className="space-y-3.5 p-5">
            <PasswordInput
              label="Current password"
              value={current}
              onChange={setCurrent}
              show={showCurrent}
              onToggle={() => setShowCurrent((s) => !s)}
              autoComplete="current-password"
            />
            <div>
              <PasswordInput
                label="New password"
                value={next}
                onChange={setNext}
                show={showNext}
                onToggle={() => setShowNext((s) => !s)}
                autoComplete="new-password"
              />
              {next && (
                <div className="mt-2">
                  <div className="flex h-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-full flex-1 rounded-full ${i < strength.score ? strength.bar : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className={`mt-1 text-[11px] font-semibold ${strength.text}`}>{strength.label}</p>
                </div>
              )}
            </div>
            <PasswordInput
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              show={showNext}
              onToggle={() => setShowNext((s) => !s)}
              autoComplete="new-password"
              match={confirm ? confirm === next : undefined}
            />

            {error && (
              <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] text-[13px] font-semibold text-white transition hover:bg-[#093672] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {saving ? 'Changing…' : 'Change password'}
            </button>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Use at least {MIN_PASSWORD} characters. If you have forgotten your current password, an Administrator can
              reset it from User Management.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}> = ({ icon: Icon, label, value, hint }) => (
  <div className="bg-white px-5 py-3.5">
    <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </dt>
    <dd className="mt-1 break-words text-[13px] font-semibold text-slate-900">{value}</dd>
    {hint && <dd className="mt-0.5 text-[11px] text-slate-400">{hint}</dd>}
  </div>
);

const PasswordInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  /** When set, shows a tick or a cross for "matches the new password". */
  match?: boolean;
}> = ({ label, value, onChange, show, onToggle, autoComplete, match }) => (
  <div>
    <label className="form-label">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={`form-field pr-10 ${
          match === false ? 'border-red-400!' : match === true ? 'border-emerald-400!' : ''
        }`}
      />
      <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2.5">
        {match === true && <Check className="h-4 w-4 text-emerald-600" />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  </div>
);

/** A rough four-step meter — length first, then variety. */
function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= MIN_PASSWORD) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak password', bar: 'bg-red-500', text: 'text-red-600' };
  if (score === 2) return { score: 2, label: 'Fair password', bar: 'bg-amber-500', text: 'text-amber-600' };
  if (score === 3) return { score: 3, label: 'Good password', bar: 'bg-sky-500', text: 'text-sky-600' };
  return { score: 4, label: 'Strong password', bar: 'bg-emerald-500', text: 'text-emerald-600' };
}
