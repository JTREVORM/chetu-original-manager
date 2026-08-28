import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import type { Client, Loan } from "../types/database.types";
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
  todayISO,
  useMisScope,
  type MisColumn,
} from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";

interface ReturnRow {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  previous_amount: number;
  present_amount: number;
}

/** Loan Security Return List — closed loans whose member security is refundable. */
export const LoanSecurityReturnList: React.FC = () => {
  const scope = useMisScope();
  // Returning member security is a management action.
  const canReturn = scope.isAdmin || scope.isBranchManager;
  const { loans, clients, clientGroups, refetch } = useDatabase();
  const { addToast } = useNotifications();

  const [search, setSearch] = useState("");
  const [returnDate, setReturnDate] = useState(todayISO());
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [detailsFor, setDetailsFor] = useState<ReturnRow | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));

    return loans
      .filter((l) => Number(l.security_balance || 0) > 0)
      .map<ReturnRow | null>((l) => {
        const client = clientById.get(l.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";
        return {
          loan: l,
          client,
          group_name: group?.group_name || "—",
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          previous_amount: Number(l.security_amount || 0),
          present_amount: Number(l.security_balance || 0),
        };
      })
      .filter((r): r is ReturnRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.client.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (q) {
        const hay =
          `${r.group_name} ${r.client.full_name} ${r.client.client_number} ${r.loan.loan_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
    });
  };

  const processReturn = async (row: ReturnRow, amount: number) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("loan_security_returns").insert({
        loan_id: row.loan.id,
        client_id: row.client.id,
        branch_id: row.client.branch_id ?? null,
        return_date: returnDate,
        return_amount: amount,
        previous_amount: row.previous_amount,
        present_amount: Math.max(0, row.present_amount - amount),
        duration_weeks: row.loan.loan_period_weeks || 0,
        principal: row.loan.principal_amount,
        interest: row.loan.total_interest_amount,
        status: "Returned",
      });
      if (error) throw error;

      const { error: loanError } = await supabase
        .from("loans")
        .update({ security_balance: Math.max(0, row.present_amount - amount) })
        .eq("id", row.loan.id);
      if (loanError) throw loanError;

      addToast(
        "success",
        "Security Returned",
        `${money(amount)} returned to ${row.client.full_name}.`,
      );
      setDetailsFor(null);
      await refetch({ silent: true });
    } catch (error) {
      addToast(
        "error",
        "Return failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: MisColumn<ReturnRow>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "9%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "9%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "group",
      label: "Group Name",
      width: "11%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "mcode",
      label: "Member Code",
      width: "10%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "mname",
      label: "Member Name",
      width: "13%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    {
      key: "loan",
      label: "Loan No",
      width: "11%",
      render: (r) => r.loan.loan_number,
      text: (r) => r.loan.loan_number,
    },
    {
      key: "dur",
      label: "Duration",
      width: "7%",
      align: "center",
      render: (r) => `${r.loan.loan_period_weeks || 0} wks`,
    },
    {
      key: "prev",
      label: "Previous Amt",
      width: "10%",
      align: "right",
      render: (r) => money(r.previous_amount),
    },
    {
      key: "pres",
      label: "Present Amt",
      width: "10%",
      align: "right",
      render: (r) => money(r.present_amount),
    },
    {
      key: "action",
      label: "Action",
      width: "7%",
      render: (r) => (
        <ActionButton tone="amber" title="Security return details" onClick={() => setDetailsFor(r)}>
          <Info className="h-3 w-3" />
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons
            title="Loan Security Return List"
            columns={columns}
            rows={filtered}
          />
        }
      >
        Loan Security Return List
      </MisPageTitle>

      <MisFilters
        title="Loan Security Return List"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <Field label="Return Date">
          <input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="form-field"
          />
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage="No security returns pending."
        idleMessage="Select branch, officer or group and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${money(r.present_amount)}`}
      />

      <SecurityReturnModal
        row={detailsFor}
        readOnly={!canReturn}
        saving={saving}
        returnDate={returnDate}
        onClose={() => setDetailsFor(null)}
        onSubmit={processReturn}
      />
    </div>
  );
};

const SecurityReturnModal: React.FC<{
  row: ReturnRow | null;
  saving: boolean;
  readOnly?: boolean;
  returnDate: string;
  onClose: () => void;
  onSubmit: (row: ReturnRow, amount: number) => Promise<void>;
}> = ({ row, saving, readOnly, returnDate, onClose, onSubmit }) => {
  const [amount, setAmount] = useState("");
  if (!row) return null;
  const value = amount === "" ? row.present_amount : Number(amount || 0);

  return (
    <MisModal open onClose={onClose} title="Loan Security Return Details" width="max-w-2xl">
      <div className="form-section-title">Member Information</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Member Code">
          <input readOnly value={row.client.client_number} className="form-field bg-slate-100" />
        </Field>
        <Field label="Member Name">
          <input readOnly value={row.client.full_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Group Name">
          <input readOnly value={row.group_name} className="form-field bg-slate-100" />
        </Field>
        <Field label="Branch">
          <input readOnly value={row.branch_name} className="form-field bg-slate-100" />
        </Field>
      </div>

      <div className="form-section-title mt-5">Loan Information</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Loan No">
          <input readOnly value={row.loan.loan_number} className="form-field bg-slate-100" />
        </Field>
        <Field label="Disburse Date">
          <input
            readOnly
            value={shortDate(row.loan.disbursed_at)}
            className="form-field bg-slate-100"
          />
        </Field>
        <Field label="Principal">
          <input
            readOnly
            value={money(row.loan.principal_amount)}
            className="form-field bg-slate-100"
          />
        </Field>
        <Field label="Interest">
          <input
            readOnly
            value={money(row.loan.total_interest_amount)}
            className="form-field bg-slate-100"
          />
        </Field>
        <Field label="Previous Security">
          <input readOnly value={money(row.previous_amount)} className="form-field bg-slate-100" />
        </Field>
        <Field label="Present Security">
          <input readOnly value={money(row.present_amount)} className="form-field bg-slate-100" />
        </Field>
        <Field label="Return Date">
          <input readOnly value={shortDate(returnDate)} className="form-field bg-slate-100" />
        </Field>
        <Field label="Return Amount *">
          <input
            type="number"
            value={amount === "" ? String(row.present_amount) : amount}
            onChange={(e) => setAmount(e.target.value)}
            className="form-field"
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600"
        >
          Cancel
        </button>
        {!readOnly && (
          <button
            type="button"
            disabled={saving || value <= 0 || value > row.present_amount}
            onClick={() => onSubmit(row, value)}
            className="rounded bg-[#0B4394] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Return Security"}
          </button>
        )}
      </div>
    </MisModal>
  );
};
