import React, { useMemo, useState } from "react";
import { Send, X } from "lucide-react";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import { CLOSED_LOAN_STATUSES, type Client } from "../../types/database.types";
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
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";

interface Row {
  client: Client;
  group_name: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
  open_loans: number;
  outstanding: number;
  pending_transfer: boolean;
}

/**
 * Member Branch Transfer — send a member to another branch. Nothing moves
 * until the receiving branch accepts on the Receive Member screen, so this
 * only raises the request.
 */
export const MemberBranchTransfer: React.FC = () => {
  const scope = useMisScope();
  const {
    clients,
    clientGroups,
    loans,
    branches,
    transfers,
    requestMemberTransfer,
    cancelMemberTransfer,
  } = useDatabase();
  const { addToast } = useNotifications();

  const canSend = !scope.isAuditor;

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [active, setActive] = useState<Row | null>(null);
  const [toBranchId, setToBranchId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const pendingByClient = new Set(
      transfers
        .filter((t) => t.status === "Pending" && t.client_id)
        .map((t) => t.client_id as string),
    );

    return clients
      .filter((c) => c.approval_status === "Approved" && c.status === "Active" && !c.death_date)
      .map((c) => {
        const group = c.group_id ? groupById.get(c.group_id) : undefined;
        const officerId = c.loan_officer_id || group?.loan_officer_id || "";
        const open = loans.filter(
          (l) =>
            l.client_id === c.id &&
            !CLOSED_LOAN_STATUSES.includes(l.status) &&
            l.status !== "Pending",
        );
        return {
          client: c,
          group_name: group?.group_name || "—",
          branch_name: scope.branchName(c.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          branch_id: c.branch_id || "",
          open_loans: open.length,
          outstanding: open.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0),
          pending_transfer: pendingByClient.has(c.id),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clientGroups, loans, transfers, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      if (
        q &&
        !`${r.group_name} ${r.client.full_name} ${r.client.client_number}`.toLowerCase().includes(q)
      )
        return false;
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

  // Only branches other than the member's current one can receive them.
  const destinations = useMemo(
    () => branches.filter((b) => b.status === "Active" && b.id !== active?.branch_id),
    [branches, active?.branch_id],
  );

  const openSend = (row: Row) => {
    setActive(row);
    setToBranchId("");
    setReason("");
  };

  const confirmSend = async () => {
    if (!active) return;
    if (!toBranchId) {
      addToast("warning", "Choose a branch", "Select the branch that will receive this member.");
      return;
    }
    if (!reason.trim()) {
      addToast("warning", "Reason required", "Say why this member is being transferred.");
      return;
    }
    setBusy(true);
    try {
      await requestMemberTransfer({
        clientId: active.client.id,
        toBranchId,
        reason: reason.trim(),
      });
      addToast("success", "Transfer sent", `${active.client.full_name} is waiting to be received.`);
      setActive(null);
    } catch (error) {
      addToast(
        "error",
        "Transfer failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (row: Row) => {
    const pending = transfers.find((t) => t.client_id === row.client.id && t.status === "Pending");
    if (!pending) return;
    try {
      await cancelMemberTransfer(pending.id);
      addToast("info", "Transfer withdrawn", `${row.client.full_name} stays in this branch.`);
    } catch (error) {
      addToast(
        "error",
        "Could not withdraw",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const columns: MisColumn<Row>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "10%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "10%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "group",
      label: "Group",
      width: "11%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "code",
      label: "Member Code",
      width: "10%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "name",
      label: "Member Name",
      width: "15%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    {
      key: "joined",
      label: "Registered",
      width: "9%",
      render: (r) => shortDate(r.client.date_registered),
    },
    {
      key: "loans",
      label: "Open Loans",
      width: "7%",
      align: "center",
      render: (r) => r.open_loans,
    },
    {
      key: "out",
      label: "Outstanding",
      width: "10%",
      align: "right",
      render: (r) =>
        r.outstanding > 0 ? (
          <span className="font-bold text-chetu-red">{money(r.outstanding)}</span>
        ) : (
          "—"
        ),
      text: (r) => money(r.outstanding),
    },
    {
      key: "state",
      label: "Status",
      width: "9%",
      render: (r) =>
        r.pending_transfer ? (
          <span className="font-bold text-amber-600">Awaiting receipt</span>
        ) : (
          "In branch"
        ),
      text: (r) => (r.pending_transfer ? "Awaiting receipt" : "In branch"),
    },
    {
      key: "act",
      label: "Action",
      width: "6%",
      align: "center",
      render: (r) => {
        if (!canSend) return <span className="text-[10px] text-slate-400">View</span>;
        return r.pending_transfer ? (
          <ActionButton onClick={() => withdraw(r)} title="Withdraw this transfer" tone="red">
            <X className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <ActionButton onClick={() => openSend(r)} title="Transfer to another branch" tone="navy">
            <Send className="h-3.5 w-3.5" />
          </ActionButton>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={
          <ReportExportButtons title="Member Branch Transfer" columns={columns} rows={filtered} />
        }
      >
        Member Branch Transfer
      </MisPageTitle>

      <MisFilters
        title="Member Branch Transfer"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Member name, code"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.client.id}
        hasSearched={hasSearched}
        emptyMessage="No members found for this selection."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.client.full_name}
        mobileSubtitle={(r) => `${r.client.client_number} • ${r.branch_name}`}
      />

      <MisModal
        open={!!active}
        onClose={() => setActive(null)}
        title="Transfer Member to Another Branch"
        width="max-w-lg"
      >
        {active && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.client.full_name}</p>
              <p className="text-slate-500">
                {active.client.client_number} • {active.group_name} • {active.branch_name}
              </p>
            </div>

            {active.open_loans > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <p className="font-bold">
                  {active.open_loans} open loan{active.open_loans === 1 ? "" : "s"} —{" "}
                  {money(active.outstanding)} outstanding
                </p>
                <p className="mt-0.5">
                  The loans move with the member and the receiving branch takes over collections.
                  Settle first if that is not what you intend.
                </p>
              </div>
            )}

            <Field label="Receiving Branch *">
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className="form-field"
              >
                <option value="">-- Select --</option>
                {destinations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reason *">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Member has relocated, closer branch, group restructure…"
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
              The member stays in this branch until a Branch Manager at the receiving branch accepts
              them. They pick the destination group and officer at that point.
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
                onClick={confirmSend}
                className="rounded bg-[#0B4394] px-5 py-2 font-bold text-white hover:bg-[#093672] disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send Transfer"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
