import React, { useMemo, useState } from 'react';
import { Pencil, Info, History, FileUp, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { Client, Loan } from '../types/database.types';
import {
  ActionButton,
  Field,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  useMisScope,
  type MisColumn,
} from '../components/mis/MisKit';

export interface MemberRow {
  client: Client;
  branch_name: string;
  officer_name: string;
  group_code: string;
  group_name: string;
  product_name: string;
  officer_id: string;
  group_id: string;
}

/** Shared member listing used by Member List, Inactive, Death and Rejected screens. */
export const MemberListBase: React.FC<{
  title: string;
  statuses: string[];
  /** Which admission approval states to include. Defaults to Approved-only members. */
  approvalStatuses?: string[];
  /** Extra client-side predicate, e.g. isolating deceased members within the Inactive status. */
  extraFilter?: (client: Client) => boolean;
  extraActions?: (row: MemberRow) => React.ReactNode;
  extraColumns?: MisColumn<MemberRow>[];
}> = ({ title, statuses, approvalStatuses = ['Approved'], extraFilter, extraActions, extraColumns = [] }) => {
  const scope = useMisScope();
  const { clients, clientGroups, loanProducts, loans, updateClient } = useDatabase();
  const { addToast } = useNotifications();

  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '' });

  const [infoFor, setInfoFor] = useState<MemberRow | null>(null);
  const [uploadFor, setUploadFor] = useState<MemberRow | null>(null);
  const [historyFor, setHistoryFor] = useState<MemberRow | null>(null);
  const [editFor, setEditFor] = useState<MemberRow | null>(null);

  const defaultProduct = loanProducts[0]?.product_name || 'Umodzi Micro Loan';

  const rows: MemberRow[] = useMemo(() => {
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    return clients
      .filter((c) => statuses.includes(c.status))
      .filter((c) => approvalStatuses.includes(c.approval_status))
      .filter((c) => !extraFilter || extraFilter(c))
      .map((c) => {
        const group = c.group_id ? groupById.get(c.group_id) : undefined;
        const officerId = c.loan_officer_id || group?.loan_officer_id || '';
        return {
          client: c,
          branch_name: scope.branchName(c.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          group_code: group?.group_code || '—',
          group_name: group?.group_name || '—',
          product_name: defaultProduct,
          officer_id: officerId,
          group_id: group?.id || '',
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clientGroups, statuses.join(','), approvalStatuses.join(','), extraFilter, defaultProduct, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.client.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay = `${r.group_name} ${r.group_code} ${r.client.full_name} ${r.client.client_number} ${r.client.phone_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search });
  };

  const memberLoans = (clientId: string): Loan[] => loans.filter((l) => l.client_id === clientId);

  const columns: MisColumn<MemberRow>[] = [
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'lo', label: 'LO', width: '10%', render: (r) => r.officer_name, text: (r) => r.officer_name },
    { key: 'product', label: 'Product', width: '11%', render: (r) => r.product_name, text: (r) => r.product_name },
    { key: 'gcode', label: 'Group Code', width: '9%', render: (r) => r.group_code, text: (r) => r.group_code },
    { key: 'gname', label: 'Group Name', width: '10%', render: (r) => r.group_name, text: (r) => r.group_name },
    { key: 'mcode', label: 'Member Code', width: '11%', render: (r) => r.client.client_number, text: (r) => r.client.client_number },
    {
      key: 'mname',
      label: 'Member Name',
      width: '13%',
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    { key: 'phone', label: 'Phone Number', width: '11%', render: (r) => r.client.phone_number, text: (r) => r.client.phone_number },
    ...extraColumns,
    {
      key: 'action',
      label: 'Action',
      width: '16%',
      render: (r) => (
        <div className="flex items-center gap-1">
          {extraActions ? (
            extraActions(r)
          ) : (
            <>
              <ActionButton tone="blue" title="Edit member" onClick={() => setEditFor(r)}>
                <Pencil className="h-3 w-3" />
              </ActionButton>
              <ActionButton tone="amber" title="Loan details info" onClick={() => setInfoFor(r)}>
                <Info className="h-3 w-3" />
              </ActionButton>
              <ActionButton tone="green" title="Loan history report" onClick={() => setHistoryFor(r)}>
                <History className="h-3 w-3" />
              </ActionButton>
              <ActionButton tone="navy" title="Financial file upload" onClick={() => setUploadFor(r)}>
                <FileUp className="h-3 w-3" />
              </ActionButton>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle>{title}</MisPageTitle>

      <MisFilters
        title={title}
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name, code / Member name, code / Contact Number"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.client.id}
        hasSearched={hasSearched}
        emptyMessage="No members found."
        idleMessage="Select branch, officer or group and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => r.client.client_number}
      />

      <LoanDetailsInfoModal row={infoFor} loans={infoFor ? memberLoans(infoFor.client.id) : []} onClose={() => setInfoFor(null)} />
      <LoanHistoryModal row={historyFor} loans={historyFor ? memberLoans(historyFor.client.id) : []} onClose={() => setHistoryFor(null)} />
      <FinancialFileUploadModal row={uploadFor} onClose={() => setUploadFor(null)} />
      <EditBusinessInfoModal
        row={editFor}
        onClose={() => setEditFor(null)}
        onSave={async (patch) => {
          if (!editFor) return;
          await updateClient(editFor.client.id, patch);
          addToast('success', 'Member Updated', `${editFor.client.full_name} updated.`);
          setEditFor(null);
        }}
      />
    </div>
  );
};

const InfoCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="grid grid-cols-[minmax(0,45%)_minmax(0,55%)] gap-2 border-b border-slate-100 py-1.5">
    <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    <span className="min-w-0 break-words text-[11px] font-bold text-slate-900">{value}</span>
  </div>
);

export const LoanDetailsInfoModal: React.FC<{ row: MemberRow | null; loans: Loan[]; onClose: () => void }> = ({
  row,
  loans,
  onClose,
}) => {
  if (!row) return null;
  const securityTotal = loans.reduce((s, l) => s + Number(l.security_balance || 0), 0);
  return (
    <MisModal open onClose={onClose} title="Loan Details Info">
      <div className="form-section-title">Member Information</div>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <InfoCell label="Member Code" value={row.client.client_number} />
        <InfoCell label="Member Name" value={row.client.full_name} />
        <InfoCell label="Branch Name" value={row.branch_name} />
        <InfoCell label="Group Name" value={row.group_name} />
        <InfoCell label="Admission Date" value={shortDate(row.client.date_registered)} />
        <InfoCell label="Member Type" value={row.client.member_type || 'Member'} />
        <InfoCell label="LO Name" value={row.officer_name} />
        <InfoCell label="Member Status" value={row.client.status} />
        <InfoCell label="Security Balance" value={money(securityTotal)} />
        <InfoCell label="Contact Number" value={row.client.phone_number} />
      </div>

      <div className="form-section-title mt-5">Loan Information</div>
      <div className="overflow-hidden rounded border border-slate-200">
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2">
              <th>Loan No</th>
              <th>Disburse Date</th>
              <th className="text-right">Principal</th>
              <th className="text-right">Interest</th>
              <th className="text-right">Total</th>
              <th className="text-right">Security</th>
              <th className="text-center">Cycle</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loans.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-slate-400">
                  No loans recorded for this member.
                </td>
              </tr>
            )}
            {loans.map((l) => (
              <tr key={l.id} className="[&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-2">
                <td title={l.loan_number}>{l.loan_number}</td>
                <td>{shortDate(l.disbursed_at)}</td>
                <td className="text-right">{money(l.principal_amount)}</td>
                <td className="text-right">{money(l.total_interest_amount)}</td>
                <td className="text-right">{money(l.total_amount_payable)}</td>
                <td className="text-right">{money(l.security_balance)}</td>
                <td className="text-center">{l.cycle_number || 1}</td>
                <td>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{l.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MisModal>
  );
};

export const LoanHistoryModal: React.FC<{ row: MemberRow | null; loans: Loan[]; onClose: () => void }> = ({
  row,
  loans,
  onClose,
}) => {
  if (!row) return null;
  return (
    <MisModal open onClose={onClose} title={`Loan History — ${row.client.full_name}`} width="max-w-2xl">
      <ul className="space-y-2">
        {loans.length === 0 && <li className="py-6 text-center text-xs text-slate-400">No loan history.</li>}
        {loans.map((l) => (
          <li key={l.id} className="rounded border border-slate-200 p-3 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900">{l.loan_number}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{l.status}</span>
            </div>
            <p className="mt-1 text-slate-600">
              Principal {money(l.principal_amount)} · Payable {money(l.total_amount_payable)} · Outstanding{' '}
              {money(l.outstanding_balance)} · Cycle {l.cycle_number || 1}
            </p>
            <p className="mt-0.5 text-slate-500">
              Disbursed {shortDate(l.disbursed_at)} · Final due {shortDate(l.final_due_date)}
            </p>
          </li>
        ))}
      </ul>
    </MisModal>
  );
};

interface DocRow {
  id: string;
  document_name: string;
  uploaded_at: string;
  period_from: string | null;
  period_to: string | null;
  file_url: string;
}

export const FinancialFileUploadModal: React.FC<{ row: MemberRow | null; onClose: () => void }> = ({ row, onClose }) => {
  const { addToast } = useNotifications();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [name, setName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [fileData, setFileData] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState('');

  React.useEffect(() => {
    if (!row || loadedFor === row.client.id) return;
    setLoadedFor(row.client.id);
    (async () => {
      const { data } = await supabase
        .from('client_documents')
        .select('id, document_name, uploaded_at, period_from, period_to, file_url')
        .eq('client_id', row.client.id)
        .order('uploaded_at', { ascending: false });
      setDocs((data || []) as DocRow[]);
    })();
  }, [row, loadedFor]);

  if (!row) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onloadend = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!name.trim() || !fileData) {
      addToast('error', 'Missing Details', 'Enter a document name and choose a file.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('client_documents')
      .insert([
        {
          client_id: row.client.id,
          document_type: 'Bank Statement',
          document_name: name.trim(),
          file_url: fileData,
          period_from: periodFrom || null,
          period_to: periodTo || null,
        },
      ])
      .select('id, document_name, uploaded_at, period_from, period_to, file_url')
      .single();
    setSaving(false);
    if (error) {
      addToast('error', 'Upload Failed', error.message);
      return;
    }
    setDocs((p) => [data as DocRow, ...p]);
    setName('');
    setFileData('');
    setPeriodFrom('');
    setPeriodTo('');
    addToast('success', 'Document Uploaded', 'Financial file saved.');
  };

  return (
    <MisModal open onClose={onClose} title="Member Bank Statement" width="max-w-2xl">
      <Field label="Document Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="form-field" />
      </Field>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Period From">
          <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="form-field" />
        </Field>
        <Field label="Period To">
          <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="form-field" />
        </Field>
      </div>

      <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded border border-dashed border-slate-300 py-8 text-center hover:bg-slate-50">
        <FileUp className="mb-2 h-5 w-5 text-slate-400" />
        <span className="text-[11px] text-slate-500">{fileData ? 'File ready to submit' : 'Click to upload or drag and drop'}</span>
        <input type="file" className="hidden" onChange={handleFile} />
      </label>

      <div className="mt-4 flex justify-center gap-3">
        <button type="button" onClick={onClose} className="rounded bg-chetu-red px-6 py-2 text-[12px] font-bold text-white">
          No
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded bg-emerald-500 px-6 py-2 text-[12px] font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Submit'}
        </button>
      </div>

      <div className="form-section-title mt-6">Uploaded Documents</div>
      <div className="overflow-hidden rounded border border-slate-200">
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2">
              <th>Doc Name</th>
              <th>Uploaded Date</th>
              <th>Period From</th>
              <th>Period To</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-5 text-center text-slate-400">
                  No documents uploaded.
                </td>
              </tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="[&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-2">
                <td title={d.document_name}>{d.document_name}</td>
                <td>{shortDate(d.uploaded_at)}</td>
                <td>{shortDate(d.period_from)}</td>
                <td>{shortDate(d.period_to)}</td>
                <td className="text-center">
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 items-center rounded bg-amber-500 px-2 text-[10px] font-bold text-white"
                  >
                    Details
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MisModal>
  );
};

export const EditBusinessInfoModal: React.FC<{
  row: MemberRow | null;
  onClose: () => void;
  onSave: (patch: Partial<Client>) => Promise<void>;
}> = ({ row, onClose, onSave }) => {
  const [form, setForm] = useState({ occupation: '', employer: '', physical_address: '' });
  const [loadedFor, setLoadedFor] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!row || loadedFor === row.client.id) return;
    setLoadedFor(row.client.id);
    setForm({
      occupation: row.client.occupation || '',
      employer: row.client.employer || '',
      physical_address: row.client.physical_address || '',
    });
  }, [row, loadedFor]);

  if (!row) return null;

  return (
    <MisModal open onClose={onClose} title={`Business Information — ${row.client.full_name}`} width="max-w-xl">
      <p className="mb-3 text-[11px] text-slate-500">
        Only the business information, family guarantor and group guarantor details can be edited here.
      </p>
      <Field label="Business / Occupation">
        <input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} className="form-field" />
      </Field>
      <div className="mt-3">
        <Field label="Employer / Business Name">
          <input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} className="form-field" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Business Address">
          <input
            value={form.physical_address}
            onChange={(e) => setForm({ ...form, physical_address: e.target.value })}
            className="form-field"
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave(form);
          setSaving(false);
        }}
        className="btn-save mt-5"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </MisModal>
  );
};

export const MemberList: React.FC = () => <MemberListBase title="Member List" statuses={['Active']} />;

export default MemberList;
export { Users };
