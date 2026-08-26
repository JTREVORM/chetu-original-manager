import React, { useState } from 'react';
import { useNavigate } from '../lib/router-compat';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { FEES } from '../lib/fees';
import { AlertTriangle, Building2, FileText, Save, UserCog } from 'lucide-react';

const RESET_PHRASE = 'DELETE ALL DATA';

/**
 * System Settings — institution-wide configuration.
 *
 * Auditors can reach this screen (they can see the whole administrative
 * section) but must not change anything, so the form renders read-only for
 * them rather than failing at save time. `updateSettings` enforces the same
 * rule server-side; this is the courtesy half of it.
 */
export const Settings: React.FC = () => {
  const { settings, updateSettings, clearAllData } = useDatabase();
  const { addToast } = useNotifications();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    company_name: settings.company_name,
    default_currency: settings.default_currency,
    receipt_footer: settings.receipt_footer,
    report_header: settings.report_header,
  });
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      await updateSettings(form);
      addToast('success', 'Settings saved', 'The institution configuration has been updated.');
    } catch (error) {
      addToast('error', 'Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirmText !== RESET_PHRASE) return;
    setResetting(true);
    try {
      await clearAllData();
      addToast('success', 'System reset', 'All operational data has been cleared. Signing you out.');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (error) {
      addToast('error', 'Reset failed', error instanceof Error ? error.message : 'Please try again.');
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4 pb-16">
      <PageBand
        title="System Settings"
        subtitle="Institution identity, the standing fee schedule and printed document text. Applies to every branch."
      />

      {!isAdmin && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          These settings are maintained by an Administrator. You are viewing them read-only.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Panel title="Institution">
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <label className="form-label" htmlFor="company_name">Registered name</label>
              <input
                id="company_name"
                type="text"
                required
                readOnly={!isAdmin}
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                className="form-field"
              />
              <Hint>Printed at the head of every report, receipt and loan agreement.</Hint>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="form-label" htmlFor="currency">Currency code</label>
                <input
                  id="currency"
                  type="text"
                  required
                  readOnly={!isAdmin}
                  value={form.default_currency}
                  onChange={(e) => set('default_currency', e.target.value.toUpperCase())}
                  className="form-field"
                />
                <Hint>Shown against every amount in the system.</Hint>
              </div>
            </div>
            {/* Interest and processing-fee defaults used to be editable here but
                nothing consumed them: a loan takes its rate from its product and
                its charges from the fee schedule below. Leaving them in place
                let an Administrator "change the processing fee" with no effect,
                while the screen showed two different numbers for the same fee. */}
            <Hint>
              Interest rates are set per loan product in{' '}
              <button type="button" onClick={() => navigate('/loan-products')} className="font-semibold text-[#0B4394] underline">
                Loan Products
              </button>
              , not here — each product keeps the rate it was saved with. Loan charges are fixed by the fee schedule
              below.
            </Hint>
          </div>
        </Panel>

        {/* The fee schedule is deliberately not editable here: it is applied at
            approval and written onto each loan, so changing it in a form would
            imply it could be restated retroactively. */}
        <Panel title="Fee schedule">
          <div className="p-4 sm:p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <FeeRow label="Admission fee" value={`UGX ${FEES.admissionFee.toLocaleString()}`} note="once per member" />
              <FeeRow label="Passbook fee" value={`UGX ${FEES.passbookFee.toLocaleString()}`} note="once per member" />
              <FeeRow label="Loan processing fee" value={`${FEES.processingFeePct}%`} note="of principal" />
              <FeeRow label="CRB fee" value={`${FEES.crbFeePct}%`} note="of principal" />
              <FeeRow label="Security deposit" value={`${FEES.securityDepositPct}%`} note="of principal, refundable" />
              <FeeRow label="Group maintenance" value={`UGX ${FEES.groupMaintenanceFee.toLocaleString()}`} note="per loan" />
            </dl>
            <Hint>
              Charges are stored on each loan when it is approved, so a loan always reports what it was actually
              charged. Changing the schedule affects new loans only and is a code change, not a setting.
            </Hint>
          </div>
        </Panel>

        <Panel title="Document text">
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <label className="form-label" htmlFor="report_header">Report header</label>
              <input
                id="report_header"
                type="text"
                readOnly={!isAdmin}
                value={form.report_header}
                onChange={(e) => set('report_header', e.target.value)}
                className="form-field"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="receipt_footer">Receipt footer</label>
              <textarea
                id="receipt_footer"
                rows={2}
                readOnly={!isAdmin}
                value={form.receipt_footer}
                onChange={(e) => set('receipt_footer', e.target.value)}
                className="form-field resize-none"
              />
              <Hint>Appears at the foot of every printed receipt.</Hint>
            </div>
          </div>
        </Panel>

        <Panel title="Related modules">
          <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <LinkRow icon={Building2} title="Branch Network" desc="Create branches and attach staff." onClick={() => navigate('/branches')} />
            <LinkRow icon={UserCog} title="User Management" desc="Staff accounts, roles and branches." onClick={() => navigate('/users')} />
            <LinkRow icon={FileText} title="Audit Logs" desc="Every action recorded, by whom and when." onClick={() => navigate('/audit-logs')} />
          </div>
        </Panel>

        {isAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] px-6 text-base font-semibold text-white hover:bg-[#093672] disabled:opacity-50 sm:h-10 sm:w-auto sm:text-[13px]"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}
      </form>

      {/* Destructive operations, kept clearly apart from ordinary configuration. */}
      {isAdmin && (
        <section className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-xs">
          <h2 className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-red-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Danger zone
          </h2>
          <div className="space-y-3 p-4 sm:p-5">
            <div>
              <p className="text-[13px] font-semibold text-slate-900">Reset all operational data</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                Permanently deletes every member, group, loan, application, repayment, savings record, expense, bank
                transaction and audit log. Staff accounts, branches and these settings are kept.{' '}
                <span className="font-semibold text-red-700">There is no undo and no backup is taken.</span>
              </p>
            </div>

            {!resetOpen ? (
              <button
                type="button"
                onClick={() => { setResetOpen(true); setConfirmText(''); }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-red-300 px-4 text-[13px] font-semibold text-red-700 hover:bg-red-50"
              >
                Reset all data…
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
                <label className="form-label" htmlFor="confirm">
                  Type <span className="font-bold text-red-700">{RESET_PHRASE}</span> to confirm
                </label>
                <input
                  id="confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  placeholder={RESET_PHRASE}
                  className="form-field"
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => { setResetOpen(false); setConfirmText(''); }}
                    className="h-10 rounded-lg bg-slate-100 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={confirmText !== RESET_PHRASE || resetting}
                    onClick={handleReset}
                    className="h-10 rounded-lg bg-red-700 px-5 text-[13px] font-bold text-white hover:bg-red-800 disabled:opacity-40"
                  >
                    {resetting ? 'Resetting…' : 'Permanently delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

export const PageBand: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({
  title, subtitle, right,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-xs sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
    <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      {title}
    </h2>
    {children}
  </section>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">{children}</p>
);

const FeeRow: React.FC<{ label: string; value: string; note: string }> = ({ label, value, note }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
    <dt className="text-[13px] text-slate-600">
      {label}
      <span className="ml-1.5 text-[11px] text-slate-400">{note}</span>
    </dt>
    <dd className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">{value}</dd>
  </div>
);

const LinkRow: React.FC<{ icon: React.ElementType; title: string; desc: string; onClick: () => void }> = ({
  icon: Icon, title, desc, onClick,
}) => (
  <button type="button" onClick={onClick} className="flex items-start gap-3 p-4 text-left hover:bg-slate-50">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#0B4394]/10 text-[#0B4394]">
      <Icon className="h-4.5 w-4.5" />
    </span>
    <span className="min-w-0">
      <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
      <span className="block text-[12px] leading-snug text-slate-500">{desc}</span>
    </span>
  </button>
);
