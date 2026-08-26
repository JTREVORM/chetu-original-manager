import React, { useState } from 'react';
import { Info, HeartCrack } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { MemberListBase, LoanDetailsInfoModal, type MemberRow } from './MemberList';
import { ActionButton, Field, MisModal, shortDate, useMisScope } from '../components/mis/MisKit';

/** Member Death List — deceased members, with the death declaration action. */
export const MemberDeathList: React.FC = () => {
  const { loans } = useDatabase();

  const [infoFor, setInfoFor] = useState<MemberRow | null>(null);
  const memberLoans = (clientId: string) => loans.filter((l) => l.client_id === clientId);

  return (
    <>
      <MemberListBase
        title="Member Death List"
        statuses={['Inactive']}
        extraFilter={(c) => Boolean(c.death_date)}
        extraColumns={[
          {
            key: 'death_date',
            label: 'Date of Death',
            width: '10%',
            render: (r) => shortDate(r.client.death_date),
            text: (r) => shortDate(r.client.death_date),
          },
        ]}
        extraActions={(r) => (
          <ActionButton tone="amber" title="Loan details info" onClick={() => setInfoFor(r)}>
            <Info className="h-3 w-3" />
          </ActionButton>
        )}
      />

      <LoanDetailsInfoModal
        row={infoFor}
        loans={infoFor ? memberLoans(infoFor.client.id) : []}
        onClose={() => setInfoFor(null)}
      />
    </>
  );
};

/** Member Death Application — declare an active member deceased. */
export const MemberDeathApplication: React.FC = () => {
  const { declareClientDeath, loans } = useDatabase();
  const { addToast } = useNotifications();
  const scope = useMisScope();

  const [declareFor, setDeclareFor] = useState<MemberRow | null>(null);
  const canDeclare = scope.isAdmin || scope.isBranchManager;
  const memberLoans = (clientId: string) => loans.filter((l) => l.client_id === clientId);

  return (
    <>
      <MemberListBase
        title="Member Death Application"
        statuses={['Active']}
        extraActions={(r) =>
          canDeclare ? (
            <ActionButton tone="red" title="Declare deceased" onClick={() => setDeclareFor(r)}>
              <HeartCrack className="h-3 w-3" />
            </ActionButton>
          ) : (
            <span className="text-[10px] font-semibold text-slate-400">View only</span>
          )
        }
      />

      <DeclareDeathModal
        row={declareFor}
        loans={declareFor ? memberLoans(declareFor.client.id) : []}
        onClose={() => setDeclareFor(null)}
        onSave={async (deathDate) => {
          if (!declareFor) return;
          await declareClientDeath(declareFor.client.id, deathDate);
          addToast('info', 'Member Recorded Deceased', `${declareFor.client.full_name} was moved to the Death List.`);
          setDeclareFor(null);
        }}
      />
    </>
  );
};

const DeclareDeathModal: React.FC<{
  row: MemberRow | null;
  loans: { outstanding_balance: number }[];
  onClose: () => void;
  onSave: (deathDate: string) => Promise<void>;
}> = ({ row, loans, onClose, onSave }) => {
  const [deathDate, setDeathDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  if (!row) return null;

  const outstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);

  return (
    <MisModal open onClose={onClose} title="Member Death Application" width="max-w-xl">
      <div className="form-section-title">Member Information</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Member Code">
          <input readOnly value={row.client.client_number} className="form-field bg-slate-100" />
        </Field>
        <Field label="Member Name">
          <input readOnly value={row.client.full_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Group">
          <input readOnly value={row.group_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Outstanding Balance">
          <input readOnly value={outstanding.toLocaleString()} className="form-field bg-slate-100 font-bold" />
        </Field>
      </div>

      <div className="form-section-title mt-5">Declaration</div>
      <Field label="Date Of Death *">
        <input type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} className="form-field" />
      </Field>
      <p className="mt-2 text-[11px] text-slate-500">
        The member will be marked inactive and moved to the Member Death List. Any outstanding balance stays on the loan
        for follow-up.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          disabled={!deathDate || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(deathDate);
            } finally {
              setSaving(false);
            }
          }}
          className="rounded bg-chetu-red px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm Death Record'}
        </button>
      </div>
    </MisModal>
  );
};
