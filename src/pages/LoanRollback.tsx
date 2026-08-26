import React, { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import type { Client, Loan, LoanRepayment } from '../types/database.types';
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
import { ReportExportButtons } from '../components/mis/ReportExport';

type Tab = 'disbursement' | 'repayment';

interface DisbursementRow {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

interface ReceiptRow {
  repayment: LoanRepayment;
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

/**
 * Loan Rollback — undo a disbursement that never actually happened, or reverse
 * a receipt that was entered against the wrong loan or for the wrong amount.
 * Both are Administrator-only and every rollback is written to the reversal
 * ledger so the correction itself is auditable.
 */
export const LoanRollback: React.FC = () => {
  const scope = useMisScope();
  const { loans, clients, clientGroups, repayments, undoDisbursement, undoRepayment } = useDatabase();
  const { addToast } = useNotifications();

  const canUndo = scope.isAdmin;

  const [tab, setTab] = useState<Tab>('disbursement');
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '', tab: 'disbursement' as Tab });
  const [target, setTarget] = useState<{ kind: Tab; id: string; label: string; detail: string; amount: number } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const groupById = useMemo(() => new Map(clientGroups.map((g) => [g.id, g])), [clientGroups]);
  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

  const describe = (client: Client) => {
    const group = client.group_id ? groupById.get(client.group_id) : undefined;
    const officerId = client.loan_officer_id || group?.loan_officer_id || '';
    return {
      group_name: group?.group_name || '—',
      branch_name: scope.branchName(client.branch_id),
      officer_id: officerId,
      group_id: group?.id || '',
      branch_id: client.branch_id || '',
    };
  };

  // Only loans that are disbursed but have taken no money yet can be rolled
  // back cleanly — anything with receipts has to have those reversed first.
  const disbursementRows = useMemo(() => {
    const paidLoanIds = new Set(repayments.map((r) => r.loan_id));
    return loans
      .filter((l) => l.status === 'Active' && !paidLoanIds.has(l.id))
      .map<DisbursementRow | null>((loan) => {
        const client = clientById.get(loan.client_id);
        if (!client) return null;
        return { loan, client, ...describe(client) };
      })
      .filter((r): r is DisbursementRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, repayments, clientById, groupById, scope.officers, scope.activeBranches]);

  const receiptRows = useMemo(
    () =>
      repayments
        .map<ReceiptRow | null>((repayment) => {
          const loan = loanById.get(repayment.loan_id);
          const client = clientById.get(repayment.client_id);
          if (!loan || !client) return null;
          return { repayment, loan, client, ...describe(client) };
        })
        .filter((r): r is ReceiptRow => r !== null)
        .sort((a, b) => (a.repayment.payment_date < b.repayment.payment_date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repayments, loanById, clientById, groupById, scope.officers, scope.activeBranches],
  );

  const matchesScope = (row: { officer_id: string; group_id: string; branch_id: string }, haystack: string) => {
    const q = applied.search.trim().toLowerCase();
    if (applied.branchId && row.branch_id !== applied.branchId) return false;
    if (applied.officerId && row.officer_id !== applied.officerId) return false;
    if (applied.groupId && row.group_id !== applied.groupId) return false;
    if (q && !haystack.toLowerCase().includes(q)) return false;
    return true;
  };

  const filteredDisbursements = useMemo(
    () =>
      disbursementRows.filter((r) =>
        matchesScope(r, `${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number}`),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disbursementRows, applied],
  );

  const filteredReceipts = useMemo(
    () =>
      receiptRows.filter((r) =>
        matchesScope(
          r,
          `${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number} ${r.repayment.receipt_number}`,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receiptRows, applied],
  );

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search, tab });
  };

  const confirmUndo = async () => {
    if (!target) return;
    if (!reason.trim()) {
      addToast('warning', 'Reason required', 'Say why this transaction is being reversed.');
      return;
    }
    setBusy(true);
    try {
      if (target.kind === 'disbursement') {
        await undoDisbursement(target.id, reason.trim());
        addToast('success', 'Disbursement rolled back', `${target.label} is back in the disbursement queue.`);
      } else {
        await undoRepayment(target.id, reason.trim());
        addToast('success', 'Receipt reversed', `${target.label} has been reversed.`);
      }
      setTarget(null);
      setReason('');
    } catch (error) {
      addToast('error', 'Rollback failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const disbursementColumns: MisColumn<DisbursementRow>[] = [
    { key: 'branch', label: 'Branch', width: '11%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'group', label: 'Group Name', width: '12%', render: (r) => r.group_name, text: (r) => r.group_name },
    { key: 'mcode', label: 'Member Code', width: '11%', render: (r) => r.client.client_number, text: (r) => r.client.client_number },
    {
      key: 'mname',
      label: 'Member Name',
      width: '15%',
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    { key: 'loan', label: 'Loan No', width: '13%', render: (r) => r.loan.loan_number, text: (r) => r.loan.loan_number },
    { key: 'amt', label: 'Principal', width: '11%', align: 'right', render: (r) => money(r.loan.principal_amount) },
    { key: 'on', label: 'Disbursed On', width: '11%', render: (r) => shortDate(r.loan.disbursed_at) },
    {
      key: 'act',
      label: 'Action',
      width: '6%',
      align: 'center',
      render: (r) =>
        canUndo ? (
          <ActionButton
            onClick={() => {
              setTarget({
                kind: 'disbursement',
                id: r.loan.id,
                label: r.loan.loan_number,
                detail: `${r.client.full_name} • disbursed ${shortDate(r.loan.disbursed_at)}`,
                amount: Number(r.loan.principal_amount),
              });
              setReason('');
            }}
            title="Undo this disbursement"
            tone="amber"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  const receiptColumns: MisColumn<ReceiptRow>[] = [
    { key: 'branch', label: 'Branch', width: '10%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'group', label: 'Group Name', width: '11%', render: (r) => r.group_name, text: (r) => r.group_name },
    {
      key: 'mname',
      label: 'Member Name',
      width: '14%',
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    { key: 'loan', label: 'Loan No', width: '12%', render: (r) => r.loan.loan_number, text: (r) => r.loan.loan_number },
    { key: 'rcpt', label: 'Receipt No', width: '13%', render: (r) => r.repayment.receipt_number, text: (r) => r.repayment.receipt_number },
    { key: 'type', label: 'Type', width: '9%', render: (r) => r.repayment.collection_type || 'Regular' },
    { key: 'amt', label: 'Amount', width: '10%', align: 'right', render: (r) => money(r.repayment.amount_paid) },
    { key: 'on', label: 'Paid On', width: '9%', render: (r) => shortDate(r.repayment.payment_date) },
    {
      key: 'act',
      label: 'Action',
      width: '6%',
      align: 'center',
      render: (r) =>
        canUndo ? (
          <ActionButton
            onClick={() => {
              setTarget({
                kind: 'repayment',
                id: r.repayment.id,
                label: r.repayment.receipt_number,
                detail: `${r.client.full_name} • loan ${r.loan.loan_number} • paid ${shortDate(r.repayment.payment_date)}`,
                amount: Number(r.repayment.amount_paid),
              });
              setReason('');
            }}
            title="Reverse this receipt"
            tone="amber"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  const showingReceipts = applied.tab === 'repayment';

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          showingReceipts ? (
            <ReportExportButtons title="Loan Rollback - Receipts" columns={receiptColumns} rows={filteredReceipts} />
          ) : (
            <ReportExportButtons
              title="Loan Rollback - Disbursements"
              columns={disbursementColumns}
              rows={filteredDisbursements}
            />
          )
        }
      >
        Loan Rollback
      </MisPageTitle>

      {!canUndo && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Reversing a disbursement or a receipt is an Administrator action. You can review the transactions here.
        </p>
      )}

      <MisFilters
        title="Loan Rollback"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number / Receipt number"
      >
        <ScopeFields scope={scope} />
        <Field label="Transaction">
          <select value={tab} onChange={(e) => setTab(e.target.value as Tab)} className="form-field">
            <option value="disbursement">Undo Disbursement</option>
            <option value="repayment">Undo Repayment / Settlement</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      {showingReceipts ? (
        <MisTable
          columns={receiptColumns}
          rows={hasSearched ? filteredReceipts : []}
          rowKey={(r) => r.repayment.id}
          hasSearched={hasSearched}
          emptyMessage="No receipts found."
          idleMessage="Choose your filters and press Search."
          mobileTitle={(r) => r.client.full_name}
          mobileSubtitle={(r) => `${r.repayment.receipt_number} • ${money(r.repayment.amount_paid)}`}
        />
      ) : (
        <MisTable
          columns={disbursementColumns}
          rows={hasSearched ? filteredDisbursements : []}
          rowKey={(r) => r.loan.id}
          hasSearched={hasSearched}
          emptyMessage="No disbursements can be rolled back. A loan with receipts must have those reversed first."
          idleMessage="Choose your filters and press Search."
          mobileTitle={(r) => r.client.full_name}
          mobileSubtitle={(r) => `${r.loan.loan_number} • ${money(r.loan.principal_amount)}`}
        />
      )}

      <MisModal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.kind === 'repayment' ? 'Reverse Receipt' : 'Undo Disbursement'}
        width="max-w-md"
      >
        {target && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{target.label}</p>
              <p className="text-slate-500">{target.detail}</p>
              <p className="mt-1 font-bold text-[#0B4394]">{money(target.amount)}</p>
            </div>

            <Field label="Reason *">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  target.kind === 'repayment'
                    ? 'Receipt captured against the wrong member, duplicate entry…'
                    : 'Cash was never handed over, wrong loan disbursed…'
                }
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
              {target.kind === 'repayment'
                ? 'The receipt is deleted and the repayment schedule is rebuilt from the receipts that remain.'
                : 'The loan returns to the disbursement queue and the cash withdrawal is reversed with a matching deposit in the branch ledger.'}
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTarget(null)} className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmUndo}
                className="rounded bg-amber-600 px-5 py-2 font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? 'Reversing…' : 'Confirm Rollback'}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
