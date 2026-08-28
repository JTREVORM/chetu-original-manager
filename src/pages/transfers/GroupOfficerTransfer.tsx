import React, { useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import { CLOSED_LOAN_STATUSES, type ClientGroup } from "../../types/database.types";
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
  group: ClientGroup;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  branch_id: string;
  members: number;
  open_loans: number;
  outstanding: number;
}

/**
 * Group LO Transfer — hand a whole group over to a different loan officer.
 * The group and every member in it move together in one database call, so the
 * group and its members can never end up disagreeing about who their officer
 * is. Only management can reassign, and only within their own branches.
 */
export const GroupOfficerTransfer: React.FC = () => {
  const scope = useMisScope();
  const { clientGroups, clients, loans, transferGroupOfficer } = useDatabase();
  const { addToast } = useNotifications();

  const canTransfer = scope.isAdmin || scope.isBranchManager;

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [active, setActive] = useState<Row | null>(null);
  const [toOfficerId, setToOfficerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const membersByGroup = new Map<string, string[]>();
    for (const c of clients) {
      if (!c.group_id) continue;
      const list = membersByGroup.get(c.group_id) || [];
      list.push(c.id);
      membersByGroup.set(c.group_id, list);
    }

    return clientGroups
      .filter((g) => g.approval_status === "Approved")
      .map((g) => {
        const memberIds = new Set(membersByGroup.get(g.id) || []);
        const open = loans.filter(
          (l) =>
            memberIds.has(l.client_id) &&
            !CLOSED_LOAN_STATUSES.includes(l.status) &&
            l.status !== "Pending",
        );
        return {
          group: g,
          branch_name: scope.branchName(g.branch_id),
          officer_name: g.loan_officer_name || scope.officerName(g.loan_officer_id),
          officer_id: g.loan_officer_id || "",
          branch_id: g.branch_id || "",
          members: memberIds.size,
          open_loans: open.length,
          outstanding: open.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGroups, clients, loans, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group.id !== applied.groupId) return false;
      if (q && !`${r.group.group_name} ${r.group.group_code}`.toLowerCase().includes(q))
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

  // The database enforces this too, but filtering here keeps the list honest:
  // an officer must be attached to the group's branch and not already hold it.
  const candidates = useMemo(
    () =>
      scope.officers.filter(
        (o) =>
          (o.branch_ids || []).includes(active?.branch_id || "") && o.id !== active?.officer_id,
      ),
    [scope.officers, active?.branch_id, active?.officer_id],
  );

  const confirmTransfer = async () => {
    if (!active) return;
    if (!toOfficerId) {
      addToast("warning", "Choose an officer", "Select the loan officer taking over this group.");
      return;
    }
    setBusy(true);
    try {
      await transferGroupOfficer(active.group.id, toOfficerId, reason.trim() || undefined);
      const to = scope.officers.find((o) => o.id === toOfficerId);
      addToast(
        "success",
        "Group reassigned",
        `${active.group.group_name} and ${active.members} member(s) moved to ${to?.full_name || "the new officer"}.`,
      );
      setActive(null);
    } catch (error) {
      addToast(
        "error",
        "Reassignment failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const columns: MisColumn<Row>[] = [
    {
      key: "branch",
      label: "Branch",
      width: "12%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "code",
      label: "Group Code",
      width: "12%",
      render: (r) => r.group.group_code,
      text: (r) => r.group.group_code,
    },
    {
      key: "name",
      label: "Group Name",
      width: "17%",
      render: (r) => <span className="font-semibold text-slate-900">{r.group.group_name}</span>,
      text: (r) => r.group.group_name,
    },
    {
      key: "lo",
      label: "Current LO",
      width: "14%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    { key: "members", label: "Members", width: "8%", align: "center", render: (r) => r.members },
    {
      key: "loans",
      label: "Open Loans",
      width: "8%",
      align: "center",
      render: (r) => r.open_loans,
    },
    {
      key: "out",
      label: "Outstanding",
      width: "11%",
      align: "right",
      render: (r) => (r.outstanding > 0 ? money(r.outstanding) : "—"),
      text: (r) => money(r.outstanding),
    },
    {
      key: "formed",
      label: "Formed",
      width: "9%",
      render: (r) => shortDate(r.group.formation_date),
    },
    {
      key: "act",
      label: "Action",
      width: "6%",
      align: "center",
      render: (r) =>
        canTransfer ? (
          <ActionButton
            onClick={() => {
              setActive(r);
              setToOfficerId("");
              setReason("");
            }}
            title="Reassign to another loan officer"
            tone="navy"
          >
            <UserCog className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={<ReportExportButtons title="Group LO Transfer" columns={columns} rows={filtered} />}
      >
        Group LO Transfer
      </MisPageTitle>

      {!canTransfer && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Reassigning a group is done by a Branch Manager or an Administrator. You can review group
          assignments here.
        </p>
      )}

      <MisFilters
        title="Group LO Transfer"
        cols={4}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Group name / Group code"
      >
        <ScopeFields scope={scope} />
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.group.id}
        hasSearched={hasSearched}
        emptyMessage="No groups found for this selection."
        idleMessage="Choose your filters and press Search."
        mobileTitle={(r) => r.group.group_name}
        mobileSubtitle={(r) => `${r.group.group_code} • ${r.officer_name}`}
      />

      <MisModal
        open={!!active}
        onClose={() => setActive(null)}
        title="Reassign Group to Another Officer"
        width="max-w-md"
      >
        {active && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.group.group_name}</p>
              <p className="text-slate-500">
                {active.group.group_code} • {active.branch_name} • currently {active.officer_name}
              </p>
              <p className="mt-1 text-slate-600">
                {active.members} member{active.members === 1 ? "" : "s"}
                {active.open_loans > 0 && (
                  <>
                    {" "}
                    • {active.open_loans} open loan(s), {money(active.outstanding)} outstanding
                  </>
                )}
              </p>
            </div>

            <Field label="New Loan Officer *">
              <select
                value={toOfficerId}
                onChange={(e) => setToOfficerId(e.target.value)}
                className="form-field"
              >
                <option value="">-- Select --</option>
                {candidates.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </Field>
            {candidates.length === 0 && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                There is no other active loan officer attached to {active.branch_name}. Assign one
                to this branch in User Management first.
              </p>
            )}

            <Field label="Reason">
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Officer resigned, workload rebalance, route change…"
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
              The group and all {active.members} member{active.members === 1 ? "" : "s"} move to the
              new officer together, and their portfolio moves with them.
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
                disabled={busy || candidates.length === 0}
                onClick={confirmTransfer}
                className="rounded bg-[#0B4394] px-5 py-2 font-bold text-white hover:bg-[#093672] disabled:opacity-50"
              >
                {busy ? "Reassigning…" : "Reassign Group"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
