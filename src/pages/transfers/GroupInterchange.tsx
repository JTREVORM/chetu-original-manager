import React, { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import type { Client } from "../../types/database.types";
import {
  ActionButton,
  Field,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  shortDate,
  useMisScope,
  type MisColumn,
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";

interface Row {
  client: Client;
  group_name: string;
  group_code: string;
  branch_name: string;
  officer_name: string;
  officer_id: string;
  group_id: string;
  branch_id: string;
}

/**
 * Group Interchange — move a member into a different group in the same branch.
 * Both groups sit under one manager so there is nothing to negotiate; the move
 * is immediate. Crossing a branch boundary is rejected by the database and has
 * to go through Member Branch Transfer instead.
 */
export const GroupInterchange: React.FC = () => {
  const scope = useMisScope();
  const { clients, clientGroups, transferMemberGroup } = useDatabase();
  const { addToast } = useNotifications();

  const canMove = !scope.isAuditor;

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ branchId: "", officerId: "", groupId: "", search: "" });
  const [active, setActive] = useState<Row | null>(null);
  const [toGroupId, setToGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    return clients
      .filter((c) => c.approval_status === "Approved" && c.status === "Active" && !c.death_date)
      .map((c) => {
        const group = c.group_id ? groupById.get(c.group_id) : undefined;
        const officerId = c.loan_officer_id || group?.loan_officer_id || "";
        return {
          client: c,
          group_name: group?.group_name || "—",
          group_code: group?.group_code || "—",
          branch_name: scope.branchName(c.branch_id),
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          officer_id: officerId,
          group_id: group?.id || "",
          branch_id: c.branch_id || "",
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clientGroups, scope.officers, scope.activeBranches]);

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

  // Same branch, approved, active, and not the group they are already in.
  const destinations = useMemo(
    () =>
      clientGroups.filter(
        (g) =>
          g.branch_id === active?.branch_id &&
          g.approval_status === "Approved" &&
          g.status === "Active" &&
          g.id !== active?.group_id,
      ),
    [clientGroups, active?.branch_id, active?.group_id],
  );

  const confirmMove = async () => {
    if (!active) return;
    if (!toGroupId) {
      addToast("warning", "Choose a group", "Select the group this member is moving into.");
      return;
    }
    setBusy(true);
    try {
      await transferMemberGroup(active.client.id, toGroupId, reason.trim() || undefined);
      const to = clientGroups.find((g) => g.id === toGroupId);
      addToast(
        "success",
        "Member moved",
        `${active.client.full_name} is now in ${to?.group_name || "the new group"}.`,
      );
      setActive(null);
    } catch (error) {
      addToast(
        "error",
        "Move failed",
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
      width: "11%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "11%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "code",
      label: "Member Code",
      width: "11%",
      render: (r) => r.client.client_number,
      text: (r) => r.client.client_number,
    },
    {
      key: "name",
      label: "Member Name",
      width: "18%",
      render: (r) => <span className="font-semibold text-slate-900">{r.client.full_name}</span>,
      text: (r) => r.client.full_name,
    },
    {
      key: "grp",
      label: "Current Group",
      width: "15%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "gcode",
      label: "Group Code",
      width: "12%",
      render: (r) => r.group_code,
      text: (r) => r.group_code,
    },
    {
      key: "joined",
      label: "Registered",
      width: "10%",
      render: (r) => shortDate(r.client.date_registered),
    },
    {
      key: "act",
      label: "Action",
      width: "6%",
      align: "center",
      render: (r) =>
        canMove ? (
          <ActionButton
            onClick={() => {
              setActive(r);
              setToGroupId("");
              setReason("");
            }}
            title="Move to another group"
            tone="navy"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </ActionButton>
        ) : (
          <span className="text-[10px] text-slate-400">View</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={<ReportExportButtons title="Group Interchange" columns={columns} rows={filtered} />}
      >
        Group Interchange
      </MisPageTitle>

      <MisFilters
        title="Group Interchange"
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
        mobileSubtitle={(r) => `${r.client.client_number} • ${r.group_name}`}
      />

      <MisModal
        open={!!active}
        onClose={() => setActive(null)}
        title="Move Member to Another Group"
        width="max-w-md"
      >
        {active && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{active.client.full_name}</p>
              <p className="text-slate-500">
                {active.client.client_number} • currently in {active.group_name} •{" "}
                {active.branch_name}
              </p>
            </div>

            <Field label="Move Into Group *">
              <select
                value={toGroupId}
                onChange={(e) => setToGroupId(e.target.value)}
                className="form-field"
              >
                <option value="">-- Select --</option>
                {destinations.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.group_name} ({g.group_code})
                  </option>
                ))}
              </select>
            </Field>
            {destinations.length === 0 && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                There is no other approved active group in {active.branch_name}. To move this member
                to a different branch, use Member Branch Transfer.
              </p>
            )}

            <Field label="Reason">
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Group split, meeting day clash, member request…"
                className="form-field resize-none"
              />
            </Field>

            <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
              The member takes on the new group's loan officer. Any open loans stay with the member
              and follow them.
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
                disabled={busy || destinations.length === 0}
                onClick={confirmMove}
                className="rounded bg-[#0B4394] px-5 py-2 font-bold text-white hover:bg-[#093672] disabled:opacity-50"
              >
                {busy ? "Moving…" : "Move Member"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
