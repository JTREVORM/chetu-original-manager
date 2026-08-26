import React, { useMemo, useState } from 'react';
import {
  Field,
  MisFilters,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  todayISO,
  monthStartISO,
  useMisScope,
  type MisColumn,
} from '../../components/mis/MisKit';
import { ReportExportButtons } from '../../components/mis/ReportExport';
import { FEES, storedLoanFees } from '../../lib/fees';
import { useDatabase } from '../../context/DatabaseContext';
import { matchScope, useLoanRows, useMemberFees, type LoanRow } from './reportData';

type FeeKind = 'Admission' | 'Loan';

interface Row {
  id: string;
  kind: FeeKind;
  date: string;
  branch_id: string;
  branch_name: string;
  officer_id: string;
  officer_name: string;
  group_id: string;
  group_name: string;
  member_name: string;
  member_code: string;
  reference: string;
  admission: number;
  passbook: number;
  processing: number;
  crb: number;
  security: number;
  groupMaintenance: number;
  total: number;
}

const EMPTY = {
  admission: 0, passbook: 0, processing: 0, crb: 0, security: 0, groupMaintenance: 0, total: 0,
};

/**
 * Fee Collection Report — every charge the institution has taken, in one
 * reconcilable table.
 *
 *   Admission     UGX 5,000 + passbook UGX 5,000, once per member
 *   Loan          4% processing + 1% CRB + 15% security + UGX 2,000 group
 *                 maintenance, once per loan at disbursement
 *
 * The loan figures come from what was stored on the loan at approval, not from
 * today's schedule, so a rate change never restates fee income already earned.
 * The security deposit is shown separately in the totals because it is
 * refundable — it is money held, not income.
 */
export const FeeCollectionReport: React.FC = () => {
  const scope = useMisScope();
  const { clients, clientGroups } = useDatabase();
  const { rows: loanRows, loading: loansLoading } = useLoanRows(scope);
  const { memberFees, loading: feesLoading } = useMemberFees();

  const [from, setFrom] = useState(monthStartISO());
  const [till, setTill] = useState(todayISO());
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: '', officerId: '', groupId: '', search: '', from: '', till: '', kind: '',
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId, officerId: scope.officerId, groupId: scope.groupId,
      search, from, till, kind,
    });
  };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));

    for (const fee of memberFees) {
      const client = clientById.get(fee.client_id);
      if (!client) continue;
      const group = client.group_id ? groupById.get(client.group_id) : undefined;
      const admission = Number(fee.admission_fee || 0);
      const passbook = Number(fee.passbook_fee || 0);
      out.push({
        id: `fee-${fee.id}`,
        kind: 'Admission',
        date: fee.created_at.split('T')[0]!,
        branch_id: fee.branch_id || client.branch_id || '',
        branch_name: scope.branchName(fee.branch_id || client.branch_id),
        officer_id: client.loan_officer_id || group?.loan_officer_id || '',
        officer_name: group?.loan_officer_name || scope.officerName(client.loan_officer_id),
        group_id: group?.id || '',
        group_name: group?.group_name || '—',
        member_name: client.full_name,
        member_code: client.client_number,
        reference: fee.receipt_number || '—',
        ...EMPTY,
        admission,
        passbook,
        total: admission + passbook + Number(fee.crb_fee || 0),
      });
    }

    for (const r of loanRows) {
      // Fees are earned when the money goes out, so undisbursed loans are not
      // fee income yet.
      if (!r.loan.disbursed_at) continue;
      const taken = storedLoanFees(r.loan);
      out.push({
        id: `loan-${r.loan.id}`,
        kind: 'Loan',
        date: r.loan.disbursed_at.split('T')[0]!,
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        officer_id: r.officer_id,
        officer_name: r.officer_name,
        group_id: r.group_id,
        group_name: r.group_name,
        member_name: r.client.full_name,
        member_code: r.client.client_number,
        reference: r.loan.loan_number,
        ...EMPTY,
        processing: taken.processingFee,
        crb: taken.crbFee,
        security: taken.securityDeposit,
        groupMaintenance: taken.groupMaintenanceFee,
        total: taken.totalDeductions,
      });
    }

    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberFees, loanRows, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (applied.kind && r.kind !== applied.kind) return false;
      if (applied.from && r.date < applied.from) return false;
      if (applied.till && r.date > applied.till) return false;
      if (q && !`${r.member_name} ${r.member_code} ${r.group_name} ${r.reference}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const totals = useMemo(() => {
    const t = { ...EMPTY };
    for (const r of filtered) {
      t.admission += r.admission;
      t.passbook += r.passbook;
      t.processing += r.processing;
      t.crb += r.crb;
      t.security += r.security;
      t.groupMaintenance += r.groupMaintenance;
      t.total += r.total;
    }
    // The security deposit is refundable, so it is not income.
    return { ...t, income: t.total - t.security };
  }, [filtered]);

  const columns: MisColumn<Row>[] = [
    { key: 'date', label: 'Date', width: '7%', render: (r) => shortDate(r.date) },
    {
      key: 'kind',
      label: 'Charge',
      width: '7%',
      render: (r) => (
        <span className={`font-bold ${r.kind === 'Admission' ? 'text-[#0B4394]' : 'text-emerald-700'}`}>{r.kind}</span>
      ),
      text: (r) => r.kind,
    },
    { key: 'branch', label: 'Branch', width: '8%', render: (r) => r.branch_name, text: (r) => r.branch_name },
    { key: 'group', label: 'Group', width: '9%', render: (r) => r.group_name, text: (r) => r.group_name },
    {
      key: 'member',
      label: 'Member',
      width: '12%',
      render: (r) => (
        <span className="font-semibold text-slate-900">
          {r.member_name}
          <span className="block text-[10px] font-normal text-slate-400">{r.member_code}</span>
        </span>
      ),
      text: (r) => r.member_name,
    },
    { key: 'ref', label: 'Reference', width: '10%', render: (r) => r.reference, text: (r) => r.reference },
    { key: 'adm', label: 'Admission', width: '7%', align: 'right', render: (r) => (r.admission ? money(r.admission) : '—'), text: (r) => String(r.admission) },
    { key: 'pass', label: 'Passbook', width: '7%', align: 'right', render: (r) => (r.passbook ? money(r.passbook) : '—'), text: (r) => String(r.passbook) },
    { key: 'proc', label: `Processing ${FEES.processingFeePct}%`, width: '8%', align: 'right', render: (r) => (r.processing ? money(r.processing) : '—'), text: (r) => String(r.processing) },
    { key: 'crb', label: `CRB ${FEES.crbFeePct}%`, width: '7%', align: 'right', render: (r) => (r.crb ? money(r.crb) : '—'), text: (r) => String(r.crb) },
    { key: 'gm', label: 'Group Maint.', width: '7%', align: 'right', render: (r) => (r.groupMaintenance ? money(r.groupMaintenance) : '—'), text: (r) => String(r.groupMaintenance) },
    {
      key: 'sec',
      label: `Security ${FEES.securityDepositPct}%`,
      width: '8%',
      align: 'right',
      render: (r) => (r.security ? <span className="text-slate-500">{money(r.security)}</span> : '—'),
      text: (r) => String(r.security),
    },
    {
      key: 'tot',
      label: 'Total',
      width: '8%',
      align: 'right',
      render: (r) => <span className="font-bold text-[#0B4394]">{money(r.total)}</span>,
      text: (r) => String(r.total),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Fee Collection Report"
            period={`${shortDate(applied.from || from)} to ${shortDate(applied.till || till)}`}
            columns={columns}
            rows={filtered}
            meta={[
              ['Admission fee', `UGX ${FEES.admissionFee.toLocaleString()}`],
              ['Passbook fee', `UGX ${FEES.passbookFee.toLocaleString()}`],
              ['Processing fee', `${FEES.processingFeePct}% of principal`],
              ['CRB fee', `${FEES.crbFeePct}% of principal`],
              ['Security deposit', `${FEES.securityDepositPct}% of principal (refundable)`],
              ['Group maintenance', `UGX ${FEES.groupMaintenanceFee.toLocaleString()} per loan`],
            ]}
          />
        }
      >
        Fee Collection Report
      </MisPageTitle>

      <MisFilters
        title="Fee Collection Report"
        cols={6}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name, code / Group / Loan or receipt number"
      >
        <ScopeFields scope={scope} />
        <Field label="From Date">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-field" />
        </Field>
        <Field label="Till Date">
          <input type="date" value={till} onChange={(e) => setTill(e.target.value)} className="form-field" />
        </Field>
        <Field label="Charge Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="form-field">
            <option value="">All</option>
            <option value="Admission">Admission &amp; Passbook</option>
            <option value="Loan">Loan Charges</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.id}
        loading={hasSearched && (loansLoading || feesLoading)}
        hasSearched={hasSearched}
        emptyMessage="No fees were collected in this period."
        idleMessage="Choose the period and scope, then press Search."
        mobileTitle={(r) => r.member_name}
        mobileSubtitle={(r) => `${r.kind} • ${r.reference} • ${money(r.total)}`}
        footer={
          filtered.length > 0 && (
            <div className="space-y-1.5 px-4 py-3 text-xs font-bold text-slate-700">
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1">
                <span>Admission: {money(totals.admission)}</span>
                <span>Passbook: {money(totals.passbook)}</span>
                <span>Processing: {money(totals.processing)}</span>
                <span>CRB: {money(totals.crb)}</span>
                <span>Group maint.: {money(totals.groupMaintenance)}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-200 pt-1.5">
                <span className="font-normal text-slate-500">
                  Security held (refundable): {money(totals.security)}
                </span>
                <span className="text-emerald-700">Fee income: {money(totals.income)}</span>
                <span className="text-[#0B4394]">Total collected: {money(totals.total)}</span>
              </div>
            </div>
          )
        }
      />
    </div>
  );
};
