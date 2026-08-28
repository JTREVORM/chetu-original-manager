import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import type { Client, Loan } from "../types/database.types";
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
  useMisScope,
  type MisColumn,
} from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";

interface BadRow {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  ageing_days: number;
}

const AGEING = [
  { label: "All", value: "" },
  { label: "1 - 30 Days", value: "1-30" },
  { label: "31 - 60 Days", value: "31-60" },
  { label: "61 - 90 Days", value: "61-90" },
  { label: "Above 90 Days", value: "90+" },
];

const inBucket = (days: number, bucket: string) => {
  if (!bucket) return true;
  if (bucket === "1-30") return days >= 1 && days <= 30;
  if (bucket === "31-60") return days >= 31 && days <= 60;
  if (bucket === "61-90") return days >= 61 && days <= 90;
  return days > 90;
};

/** Bad Loans List — ageing analysis with per-loan comment + Declare Bad Debts. */
export const BadLoansList: React.FC = () => {
  const scope = useMisScope();
  // Declaring bad debts is a management action; officers and auditors only view.
  const canDeclare = scope.isAdmin || scope.isBranchManager;
  const { loans, clients, clientGroups, repayments, refetch } = useDatabase();
  const { addToast } = useNotifications();

  const [asOn, setAsOn] = useState(todayISO());
  const [ageing, setAgeing] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    search: "",
    ageing: "",
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const asOnMs = new Date(asOn).getTime();

    return loans
      .filter(
        (l) =>
          ["Active", "Overdue", "Defaulted"].includes(l.status) &&
          Number(l.outstanding_balance) > 0,
      )
      .map<BadRow | null>((l) => {
        const client = clientById.get(l.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const last = repayments
          .filter((r) => r.loan_id === l.id)
          .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))[0];
        const since =
          last?.payment_date || l.first_repayment_date || l.disbursed_at || l.created_at;
        const ageingDays = Math.max(0, Math.floor((asOnMs - new Date(since).getTime()) / 86400000));
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";
        return {
          loan: l,
          client,
          group_name: group?.group_name || "—",
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          ageing_days: ageingDays,
        };
      })
      .filter((r): r is BadRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, repayments, asOn, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.client.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (!inBucket(r.ageing_days, applied.ageing)) return false;
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
      ageing,
    });
  };

  const declare = async () => {
    const picked = filtered.filter((r) => selected[r.loan.id]);
    if (picked.length === 0) {
      addToast("warning", "No loans selected", "Tick the loans you want to declare as bad debts.");
      return;
    }
    setSaving(true);
    try {
      for (const r of picked) {
        const comment = comments[r.loan.id]?.trim() || "Declared as bad debt";
        const { error } = await supabase
          .from("loans")
          .update({
            is_bad_debt: true,
            bad_debt_declared_at: new Date().toISOString(),
            bad_debt_comment: comment,
            writeoff_status: "Declared",
          })
          .eq("id", r.loan.id);
        if (error) throw error;
        await supabase.from("bad_loan_comments").insert({ loan_id: r.loan.id, comment });
      }
      addToast("success", "Bad Debts Declared", `${picked.length} loan(s) marked as bad debt.`);
      setSelected({});
      setComments({});
      await refetch({ silent: true });
    } catch (error) {
      addToast(
        "error",
        "Declaration failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: MisColumn<BadRow>[] = [
    {
      key: "pick",
      label: "",
      width: "4%",
      align: "center",
      render: (r) => (
        <input
          type="checkbox"
          checked={!!selected[r.loan.id]}
          onChange={(e) => setSelected((prev) => ({ ...prev, [r.loan.id]: e.target.checked }))}
          aria-label={`Select loan ${r.loan.loan_number}`}
        />
      ),
    },
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
      width: "10%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "mcode",
      label: "Member Code",
      width: "9%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "mname",
      label: "Member Name",
      width: "12%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    {
      key: "loan",
      label: "Loan No",
      width: "10%",
      render: (r) => r.loan.loan_number,
      text: (r) => r.loan.loan_number,
    },
    {
      key: "out",
      label: "Outstanding",
      width: "9%",
      align: "right",
      render: (r) => money(r.loan.outstanding_balance),
    },
    {
      key: "age",
      label: "Ageing (Days)",
      width: "8%",
      align: "center",
      render: (r) => <span className="font-bold text-chetu-red">{r.ageing_days}</span>,
    },
    {
      key: "last",
      label: "Status",
      width: "8%",
      render: (r) => (r.loan.is_bad_debt ? "Bad Debt" : r.loan.status),
    },
    {
      key: "comment",
      label: "Comment",
      width: "12%",
      render: (r) => (
        <input
          value={comments[r.loan.id] || ""}
          onChange={(e) => setComments((prev) => ({ ...prev, [r.loan.id]: e.target.value }))}
          placeholder="Add comment"
          className="form-field h-7 w-full text-[11px]"
        />
      ),
    },
  ];

  const visibleColumns = canDeclare
    ? columns
    : columns.filter((c) => c.key !== "pick" && c.key !== "comment");

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons title="Bad Loans List" columns={visibleColumns} rows={filtered} />
        }
      >
        Bad Loans List
      </MisPageTitle>

      <MisFilters
        title="Bad Loans List"
        cols={6}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <Field label="As On Date">
          <input
            type="date"
            value={asOn}
            onChange={(e) => setAsOn(e.target.value)}
            className="form-field"
          />
        </Field>
        <Field label="Ageing">
          <select value={ageing} onChange={(e) => setAgeing(e.target.value)} className="form-field">
            {AGEING.map((a) => (
              <option key={a.label} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={visibleColumns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage="No bad loans found."
        idleMessage="Choose the as-on date and ageing bucket, then press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${r.ageing_days} days`}
      />

      {hasSearched && filtered.length > 0 && canDeclare && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[11px] text-slate-500">
            Showing {filtered.length} loan(s) as on {shortDate(asOn)}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={declare}
            className="rounded bg-chetu-red px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Declare Bad Debts"}
          </button>
        </div>
      )}
    </div>
  );
};
