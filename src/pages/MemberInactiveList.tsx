import React, { useMemo, useState } from 'react';
import { Info, UserCheck } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { MemberListBase, LoanDetailsInfoModal, type MemberRow } from './MemberList';
import { ActionButton, Field, MisModal, money, shortDate, useMisScope } from '../components/mis/MisKit';

/** Member Inactive List — inactive members with Info + Re-Admission actions. */
export const MemberInactiveList: React.FC = () => {
  const { clientGroups, loans, updateClient } = useDatabase();
  const { addToast } = useNotifications();
  const scope = useMisScope();
  // Auditors are read-only: they may inspect members but never re-admit them.
  const canReadmit = !scope.isAuditor;

  const [infoFor, setInfoFor] = useState<MemberRow | null>(null);
  const [readmitFor, setReadmitFor] = useState<MemberRow | null>(null);

  const memberLoans = (clientId: string) => loans.filter((l) => l.client_id === clientId);

  return (
    <>
      <MemberListBase
        title="Member Inactive List"
        statuses={['Inactive']}
        extraFilter={(c) => !c.death_date}
        extraColumns={[
          {
            key: 'inactive_date',
            label: 'Inactive Date',
            width: '9%',
            render: (r) => shortDate(r.client.inactive_date),
            text: (r) => shortDate(r.client.inactive_date),
          },
          {
            key: 'reason',
            label: 'Reason',
            width: '10%',
            render: (r) => r.client.inactive_reason || '—',
            text: (r) => r.client.inactive_reason || '—',
          },
        ]}
        extraActions={(r) => (
          <>
            <ActionButton tone="amber" title="Loan details info" onClick={() => setInfoFor(r)}>
              <Info className="h-3 w-3" />
            </ActionButton>
            {canReadmit && (
              <ActionButton tone="green" title="Re-Admission" onClick={() => setReadmitFor(r)}>
                <UserCheck className="h-3 w-3" />
              </ActionButton>
            )}
          </>
        )}
      />

      <LoanDetailsInfoModal
        row={infoFor}
        loans={infoFor ? memberLoans(infoFor.client.id) : []}
        onClose={() => setInfoFor(null)}
      />

      <ReAdmissionModal
        row={readmitFor}
        groups={clientGroups.filter((g) => g.status === 'Active')}
        onClose={() => setReadmitFor(null)}
        onSave={async (patch, summary) => {
          if (!readmitFor) return;
          await updateClient(readmitFor.client.id, patch);
          addToast('success', 'Member Re-Admitted', `${readmitFor.client.full_name} — ${summary}`);
          setReadmitFor(null);
        }}
      />
    </>
  );
};

const ReAdmissionModal: React.FC<{
  row: MemberRow | null;
  groups: { id: string; group_name: string; group_code: string; branch_id?: string }[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>, summary: string) => Promise<void>;
}> = ({ row, groups, onClose, onSave }) => {
  const [groupId, setGroupId] = useState('');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank'>('Cash');
  const [admissionFee, setAdmissionFee] = useState('0');
  const [passbookFee, setPassbookFee] = useState('0');
  const [bankName, setBankName] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => Number(admissionFee || 0) + Number(passbookFee || 0), [admissionFee, passbookFee]);

  if (!row) return null;

  const submit = async () => {
    if (!groupId) return;
    setSaving(true);
    const group = groups.find((g) => g.id === groupId);
    try {
      await onSave(
        {
          group_id: groupId,
          branch_id: group?.branch_id || row.client.branch_id,
          status: 'Active',
          inactive_reason: null,
          inactive_date: null,
          readmitted_at: new Date().toISOString(),
          date_registered: admissionDate,
        },
        `Re-admitted to ${group?.group_name || 'group'} (${paymentMode}, ${money(total)})`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <MisModal open onClose={onClose} title="Member Re-Admission to Group">
      <div className="form-section-title">Member Information</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Member Code">
          <input readOnly value={row.client.client_number} className="form-field bg-slate-100" />
        </Field>
        <Field label="Member Name">
          <input readOnly value={row.client.full_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Previous Group">
          <input readOnly value={row.group_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Contact Number">
          <input readOnly value={row.client.phone_number} className="form-field bg-slate-100" />
        </Field>
      </div>

      <div className="form-section-title mt-5">Re-Admission Details</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Select New Group *">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="form-field">
            <option value="">-- Select --</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_name} ({g.group_code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Re-Admission Date">
          <input type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="form-field" />
        </Field>
        <Field label="Admission Fee">
          <input type="number" value={admissionFee} onChange={(e) => setAdmissionFee(e.target.value)} className="form-field" />
        </Field>
        <Field label="Passbook Fee">
          <input type="number" value={passbookFee} onChange={(e) => setPassbookFee(e.target.value)} className="form-field" />
        </Field>
        <Field label="Payment Mode">
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as 'Cash' | 'Bank')} className="form-field">
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
          </select>
        </Field>
        <Field label="Total Amount">
          <input readOnly value={money(total)} className="form-field bg-slate-100 font-bold" />
        </Field>
        {paymentMode === 'Bank' && (
          <>
            <Field label="Bank Name">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="form-field" />
            </Field>
            <Field label="Reference / Slip No">
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="form-field" />
            </Field>
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          disabled={!groupId || saving}
          onClick={submit}
          className="rounded bg-[#0B4394] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Re-Admit Member'}
        </button>
      </div>
    </MisModal>
  );
};
