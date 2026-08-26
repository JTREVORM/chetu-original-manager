import React, { useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { useNotifications } from '../context/NotificationContext';
import { CLOSED_LOAN_STATUSES, type Client, type Loan, type PaymentMethod } from '../types/database.types';
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

interface SettlementRow {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
  paid_to_date: number;
  weeks_remaining: number;
}

const METHODS: PaymentMethod[] = ['Cash', 'Bank Transfer', 'Mobile Money'];

/**
 * Loan Settlement — a member clears the whole remaining balance in one payment
 * before the schedule runs out. The security deposit still held on the loan is
 * released against the settlement, so the amount actually collected is the
 * outstanding balance less that deposit.
 */
export const LoanSettlement: React.FC = () => {
  const scope = useMisScope();
  const { loans, clients, clientGroups, repayments, settleLoan } = useDatabase();
  const { addToast } = useNotifications();

  const canSettle = !scope.isAuditor;

  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: '', officerId: '', groupId: '', search: '' });
  const [active, setActive] = useState<SettlementRow | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const today = new Date();

    return loans
      .filter((l) => !CLOSED_LOAN_STATUSES.includes(l.status) && l.status !== 'Pending' && Number(l.outstanding_balance) > 0)
      .map<SettlementRow | null>((loan) => {
        const client = clientById.get(loan.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || '';
        const paid = repayments
          .filter((r) => r.loan_id === loan.id)
          .reduce((sum, r) => sum + Number(r.amount_paid), 0);
        const weeksLeft = Math.max(
          0,
          Math.ceil((new Date(loan.final_due_date).getTime() - today.getTime()) / (7 * 86400000)),
        );
        return {
          loan,
          client,
          group_name: group?.group_name || '—',
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || '',
          branch_id: client.branch_id || '',
          paid_to_date: paid,
          weeks_remaining: weeksLeft,
        };
      })
      .filter((r): r is SettlementRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, repayments, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay = `${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId, search });
  };

  const securityHeld = active ? Number(active.loan.security_balance || 0) : 0;
  const outstanding = active ? Number(active.loan.outstanding_balance) : 0;
  const netPayable = Math.max(0, outstanding - securityHeld);

  const openSettle = (row: SettlementRow) => {
    setActive(row);
    setAmount(String(Math.max(0, Number(row.loan.outstanding_balance) - Number(row.loan.security_balance || 0))));
    setMethod('Cash');
    setNotes('');
  };

  const confirmSettle = async () => {
    if (!active) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      addToast('warning', 'Enter an amount', 'The settlement amount must be greater than zero.');
      return;
    }
    setBusy(true);
    try {
      await settleLoan(active.loan.id, value, method, notes.trim() || undefined);
      addToast('success', 'Loan settled', `${active.loan.loan_number} is closed with a settlement of ${money(value)}.`);
      setActive(null);
    } catch (error) {
      addToast('error', 'Settlement failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const columns: MisColumn<SettlementRow>[] = [
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
    { key: 'loan', label: 'Loan No', width: '10%', render: (r) => r.loan.loan_number, text: (r) => r.loan.loan_number },
    { key: 'prin', label: 'Principal', width: '9%', align: 'right', render: (r) => money(r.loan.principal_amount) },
    { key: 'paid', label: 'Paid To Date', width: '9%', align: 'right', render: (r) => money(r.paid_to_date) },
    {
      key: 'out',
      label: 'Outstanding',
      width: '9%',
      align: 'right',
      render: (r) => <span className="font-bold text-chetu-red">{money(r.loan.outstanding_balance)}</span>,
    },
    { key: 'wks', label: 'Weeks Left', width: '6%', align: 'center', render: (r) => r.weeks_remaining },
    {
      key: 'act',
      label: 'Action',
      width: '5%',
      align: 'center',
      render: (r) =>
        canSettle ? (
          <ActionButton onClick={() => openSettle(r)} title="Settle this loan" tone="green">
            <Banknote className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle right={<ReportExportButtons title="Loan Settlement" columns={columns} rows={filtered} />}>Loan Settlement</MisPageTitle>

      <MisFilters
        title="Loan Settlement"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage="No open loans found for settlement."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${money(r.loan.outstanding_balance)} outstanding`}
      />

      <MisModal open={!!active} onClose={() => setActive(null)} title="Settle Loan" width="max-w-lg">
        {active && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.client.full_name}</p>
              <p className="text-slate-500">
                {active.loan.loan_number} • {active.group_name} • Final due {shortDate(active.loan.final_due_date)}
              </p>
            </div>

            <div className="space-y-1.5 rounded border border-slate-200 p-3">
              <SummaryLine label="Total amount payable" value={money(active.loan.total_amount_payable)} />
              <SummaryLine label="Paid to date" value={money(active.paid_to_date)} />
              <SummaryLine label="Outstanding balance" value={money(outstanding)} />
              <SummaryLine label="Security deposit held" value={`- ${money(securityHeld)}`} />
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold">
                <span className="text-slate-800">Net settlement due</span>
                <span className="text-[#0B4394]">{money(netPayable)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Settlement Amount *">
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="form-field"
                />
              </Field>
              <Field label="Payment Method">
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="form-field">
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for early settlement"
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
              Settling closes the loan and marks every remaining week as paid. This cannot be undone from this screen —
              an Administrator has to reverse it from Loan Rollback.
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setActive(null)} className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmSettle}
                className="rounded bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Settling…' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};

const SummaryLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
);
