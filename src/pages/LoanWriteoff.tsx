import React, { useMemo, useState } from "react";
import { Ban } from "lucide-react";
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
  useMisScope,
  type MisColumn,
} from "../components/mis/MisKit";
import { ReportExportButtons } from "../components/mis/ReportExport";

interface WriteoffRow {
  loan: Loan;
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

/**
 * Loan Writeoff — the last step for a loan already declared a bad debt on the
 * Bad Loans List. Writing off destroys a receivable, so only an Administrator
 * can do it and the reason is kept against the loan.
 */
export const LoanWriteoff: React.FC = () => {
  const scope = useMisScope();
  const { loans, clients, clientGroups, writeOffLoan } = useDatabase();
  const { addToast } = useNotifications();

  const canWriteOff = scope.isAdmin;

  const [view, setView] = useState<"pending" | "written-off">("pending");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    search: "",
    view: "pending",
  });
  const [active, setActive] = useState<WriteoffRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));

    return loans
      .filter((l) => l.is_bad_debt || l.status === "Written Off")
      .map<WriteoffRow | null>((loan) => {
        const client = clientById.get(loan.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";
        return {
          loan,
          client,
          group_name: group?.group_name || "—",
          branch_name: scope.branchName(client.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          branch_id: client.branch_id || "",
        };
      })
      .filter((r): r is WriteoffRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      const isWrittenOff = r.loan.status === "Written Off";
      if (applied.view === "pending" ? isWrittenOff : !isWrittenOff) return false;
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
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
      view,
    });
  };

  const confirmWriteoff = async () => {
    if (!active) return;
    if (!reason.trim()) {
      addToast("warning", "Reason required", "Explain why this loan cannot be recovered.");
      return;
    }
    setBusy(true);
    try {
      await writeOffLoan(active.loan.id, reason.trim());
      addToast("success", "Loan written off", `${active.loan.loan_number} has been written off.`);
      setActive(null);
      setReason("");
    } catch (error) {
      addToast(
        "error",
        "Write-off failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const showingWrittenOff = applied.view === "written-off";

  const columns: MisColumn<WriteoffRow>[] = [
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
      key: "prin",
      label: "Principal",
      width: "9%",
      align: "right",
      render: (r) => money(r.loan.principal_amount),
    },
    showingWrittenOff
      ? {
          key: "amt",
          label: "Written Off",
          width: "9%",
          align: "right",
          render: (r) => (
            <span className="font-bold text-chetu-red">{money(r.loan.writeoff_amount ?? 0)}</span>
          ),
        }
      : {
          key: "out",
          label: "Outstanding",
          width: "9%",
          align: "right",
          render: (r) => (
            <span className="font-bold text-chetu-red">{money(r.loan.outstanding_balance)}</span>
          ),
        },
    showingWrittenOff
      ? {
          key: "on",
          label: "Written Off On",
          width: "8%",
          render: (r) => shortDate(r.loan.writeoff_at),
        }
      : {
          key: "on",
          label: "Declared On",
          width: "8%",
          render: (r) => shortDate(r.loan.bad_debt_declared_at),
        },
    {
      key: "why",
      label: showingWrittenOff ? "Write-off Reason" : "Bad Debt Comment",
      width: showingWrittenOff ? "15%" : "10%",
      render: (r) => (showingWrittenOff ? r.loan.writeoff_reason : r.loan.bad_debt_comment) || "—",
      text: (r) => (showingWrittenOff ? r.loan.writeoff_reason : r.loan.bad_debt_comment) || "—",
    },
    ...(showingWrittenOff
      ? []
      : [
          {
            key: "act",
            label: "Action",
            width: "5%",
            align: "center" as const,
            render: (r: WriteoffRow) =>
              canWriteOff ? (
                <ActionButton
                  onClick={() => {
                    setActive(r);
                    setReason("");
                  }}
                  title="Write off this loan"
                  tone="red"
                >
                  <Ban className="h-3.5 w-3.5" />
                </ActionButton>
              ) : (
                <span className="text-[10px] text-slate-400">View</span>
              ),
          },
        ]),
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={<ReportExportButtons title="Loan Writeoff" columns={columns} rows={filtered} />}
      >
        Loan Writeoff
      </MisPageTitle>

      <MisFilters
        title="Loan Writeoff"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code / Loan number"
      >
        <ScopeFields scope={scope} />
        <Field label="Show">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as "pending" | "written-off")}
            className="form-field"
          >
            <option value="pending">Bad Debts Awaiting Write-off</option>
            <option value="written-off">Already Written Off</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      {!canWriteOff && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Writing a loan off is an Administrator action. You can review the list here.
        </p>
      )}

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.loan.id}
        hasSearched={hasSearched}
        emptyMessage={
          showingWrittenOff
            ? "No written-off loans found."
            : "No bad debts awaiting write-off. Declare them on the Bad Loans List first."
        }
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.loan.loan_number} • ${money(r.loan.outstanding_balance)}`}
      />

      <MisModal
        open={!!active}
        onClose={() => setActive(null)}
        title="Write Off Loan"
        width="max-w-md"
      >
        {active && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.client.full_name}</p>
              <p className="text-slate-500">
                {active.loan.loan_number} • {active.group_name} • {active.branch_name}
              </p>
            </div>

            <div className="flex justify-between rounded border border-red-200 bg-red-50 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-800">
                Amount to write off
              </span>
              <span className="text-sm font-bold text-chetu-red">
                {money(active.loan.outstanding_balance)}
              </span>
            </div>

            <Field label="Reason *">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Member untraceable, security exhausted, board resolution reference…"
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
              This closes the loan permanently and removes the balance from the portfolio. Only
              another Administrator can reopen it.
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmWriteoff}
                className="rounded bg-chetu-red px-5 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Writing off…" : "Confirm Write Off"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
