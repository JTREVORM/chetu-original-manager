import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import type { Client, LoanApplication } from '../types/database.types';
import {
  ActionButton,
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
import { ReportExportButtons } from '../components/mis/ReportExport';

interface RejectedRow {
  app: LoanApplication;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

/**
 * Loan Rejected List — applications a Branch Manager turned down. The officer
 * who raised the application can push it back into the approval queue once the
 * reason has been addressed.
 */
export const LoanRejectedList: React.FC = () => {
  const scope = useMisScope();
  const { loanApplications, clients, clientGroups, resubmitLoanApplication } = useDatabase();
  const { addToast } = useNotifications();

  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '' });
  const [confirming, setConfirming] = useState<RejectedRow | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));

    return loanApplications
      .filter((a) => a.status === 'Rejected')
      .map<RejectedRow | null>((app) => {
        const client = clientById.get(app.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || '';
        return {
          app,
          client,
          group_name: group?.group_name || '—',
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || '',
          branch_id: client.branch_id || '',
        };
      })
      .filter((r): r is RejectedRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanApplications, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      // An officer only ever sees the applications they submitted.
      if (scope.isLoanOfficer && r.app.submitted_by !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay = `${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.app.application_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search });
  };

  const canResubmit = !scope.isAuditor;

  const confirmResubmit = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await resubmitLoanApplication(confirming.app.id);
      addToast('success', 'Sent for approval', `${confirming.app.application_number} is back in the approval queue.`);
      setConfirming(null);
    } catch (error) {
      addToast('error', 'Could not resubmit', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const columns: MisColumn<RejectedRow>[] = [
    { key: 'branch', label: 'Branch', width: '9%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'lo', label: 'LO', width: '9%', render: (r) => r.officer_name, text: (r) => r.officer_name },
    { key: 'group', label: 'Group Name', width: '10%', render: (r) => r.group_name, text: (r) => r.group_name },
    { key: 'mcode', label: 'Member Code', width: '9%', render: (r) => r.client.client_number, text: (r) => r.client.client_number },
    {
      key: 'mname',
      label: 'Member Name',
      width: '12%',
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    { key: 'appno', label: 'Application No', width: '11%', render: (r) => r.app.application_number, text: (r) => r.app.application_number },
    { key: 'amt', label: 'Amount', width: '9%', align: 'right', render: (r) => money(r.app.requested_amount) },
    { key: 'wks', label: 'Weeks', width: '5%', align: 'center', render: (r) => r.app.requested_weeks },
    { key: 'on', label: 'Rejected On', width: '8%', render: (r) => shortDate(r.app.updated_at || r.app.created_at) },
    {
      key: 'reason',
      label: 'Reason',
      width: '13%',
      render: (r) => <span className="text-chetu-red">{r.app.rejection_reason || '—'}</span>,
      text: (r) => r.app.rejection_reason || '—',
    },
    {
      key: 'act',
      label: 'Action',
      width: '5%',
      align: 'center',
      render: (r) =>
        canResubmit ? (
          <ActionButton onClick={() => setConfirming(r)} title="Resubmit for approval" tone="navy">
            <RotateCcw className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title="Loan Rejected List" columns={columns} rows={filtered} />}>Loan Rejected List</MisPageTitle>

      <MisFilters
        title="Loan Rejected List"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Application number"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.app.id}
        hasSearched={hasSearched}
        emptyMessage="No rejected loan applications found."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.app.application_number} • ${money(r.app.requested_amount)}`}
      />

      <MisModal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Resubmit Loan Application"
        width="max-w-md"
      >
        {confirming && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Send <strong className="text-slate-900">{confirming.app.application_number}</strong> for{' '}
              <strong className="text-slate-900">{confirming.client.full_name}</strong> back to the Branch Manager for
              approval?
            </p>
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <p className="font-bold uppercase text-[10px] tracking-wide text-amber-800">Rejection reason</p>
              <p className="mt-1 text-slate-700">{confirming.app.rejection_reason || 'No reason recorded.'}</p>
            </div>
            <p className="text-slate-500">
              Correct the member or loan details first if the reason still applies — resubmitting does not change the
              application.
            </p>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmResubmit}
                className="rounded bg-[#0B4394] px-5 py-2 font-bold text-white hover:bg-[#093672] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send for Approval'}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
