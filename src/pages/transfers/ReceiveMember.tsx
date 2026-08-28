import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import type { Transfer } from "../../types/database.types";
import {
  ActionButton,
  Field,
  MisFilters,
  MisModal,
  MisPageTitle,
  MisTable,
  SearchButton,
  shortDate,
  useMisScope,
  type MisColumn,
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useStaffNames } from "../reports/reportData";

interface Row {
  transfer: Transfer;
  member_name: string;
  member_code: string;
  from_branch: string;
  to_branch: string;
  from_group: string;
  requested_by: string;
  requested_on: string;
}

/**
 * Receive Member — the destination side of a branch transfer. Only a Branch
 * Manager of the receiving branch (or an Administrator) can accept or reject,
 * and accepting is where the destination group and officer are chosen.
 *
 * The member's own record is not readable here until the transfer completes,
 * so the names come off the transfer row and the database function does the
 * actual move.
 */
export const ReceiveMember: React.FC = () => {
  const scope = useMisScope();
  const {
    transfers,
    clients,
    clientGroups,
    branches,
    receiveMemberTransfer,
    rejectMemberTransfer,
  } = useDatabase();
  const { addToast } = useNotifications();
  const staffName = useStaffNames();

  const canAction = scope.isAdmin || scope.isBranchManager;
  const myBranchIds = scope.isAdmin || scope.isAuditor ? null : scope.myBranches;

  const [state, setState] = useState("Pending");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ search: "", state: "Pending" });

  const [accepting, setAccepting] = useState<Row | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [toGroupId, setToGroupId] = useState("");
  const [toOfficerId, setToOfficerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const branchName = (id?: string | null) =>
      branches.find((b) => b.id === id)?.branch_name || "—";

    return (
      transfers
        .filter((t) => t.transfer_type === "Member Branch")
        // Incoming only: this screen is the receiving branch's inbox.
        .filter((t) => (myBranchIds === null ? true : myBranchIds.includes(t.to_branch_id || "")))
        .map((t) => {
          const client = t.client_id ? clientById.get(t.client_id) : undefined;
          return {
            transfer: t,
            member_name: client?.full_name || "Incoming member",
            member_code: client?.client_number || t.client_id || "—",
            from_branch: branchName(t.from_branch_id),
            to_branch: branchName(t.to_branch_id),
            from_group: t.from_group_id ? groupById.get(t.from_group_id)?.group_name || "—" : "—",
            requested_by: staffName(t.requested_by),
            requested_on: t.requested_at.split("T")[0]!,
          };
        })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, clients, clientGroups, branches, myBranchIds?.join(",")]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (applied.state && r.transfer.status !== applied.state) return false;
      if (q && !`${r.member_name} ${r.member_code} ${r.from_branch}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, applied]);

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ search, state });
  };

  // Only approved groups in the receiving branch can take the member.
  const destinationGroups = useMemo(
    () =>
      clientGroups.filter(
        (g) =>
          g.branch_id === accepting?.transfer.to_branch_id &&
          g.approval_status === "Approved" &&
          g.status === "Active",
      ),
    [clientGroups, accepting?.transfer.to_branch_id],
  );

  const destinationOfficers = useMemo(
    () =>
      scope.officers.filter((o) =>
        (o.branch_ids || []).includes(accepting?.transfer.to_branch_id || ""),
      ),
    [scope.officers, accepting?.transfer.to_branch_id],
  );

  const openAccept = (row: Row) => {
    setAccepting(row);
    setToGroupId(row.transfer.to_group_id || "");
    setToOfficerId(row.transfer.to_officer_id || "");
  };

  const confirmAccept = async () => {
    if (!accepting) return;
    setBusy(true);
    try {
      await receiveMemberTransfer(
        accepting.transfer.id,
        toGroupId || undefined,
        toOfficerId || undefined,
      );
      addToast(
        "success",
        "Member received",
        `${accepting.member_name} now belongs to ${accepting.to_branch}.`,
      );
      setAccepting(null);
    } catch (error) {
      addToast(
        "error",
        "Could not receive",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) {
      addToast("warning", "Reason required", "Say why this member is not being accepted.");
      return;
    }
    setBusy(true);
    try {
      await rejectMemberTransfer(rejecting.transfer.id, reason.trim());
      addToast(
        "info",
        "Transfer rejected",
        `${rejecting.member_name} stays in ${rejecting.from_branch}.`,
      );
      setRejecting(null);
      setReason("");
    } catch (error) {
      addToast(
        "error",
        "Could not reject",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const columns: MisColumn<Row>[] = [
    {
      key: "code",
      label: "Member Code",
      width: "11%",
      render: (r) => r.member_code,
      text: (r) => r.member_code,
    },
    {
      key: "name",
      label: "Member Name",
      width: "16%",
      render: (r) => <span className="font-semibold text-slate-900">{r.member_name}</span>,
      text: (r) => r.member_name,
    },
    {
      key: "from",
      label: "From Branch",
      width: "12%",
      render: (r) => r.from_branch,
      text: (r) => r.from_branch,
    },
    {
      key: "fromgrp",
      label: "From Group",
      width: "12%",
      render: (r) => r.from_group,
      text: (r) => r.from_group,
    },
    {
      key: "to",
      label: "To Branch",
      width: "12%",
      render: (r) => r.to_branch,
      text: (r) => r.to_branch,
    },
    { key: "on", label: "Sent On", width: "9%", render: (r) => shortDate(r.requested_on) },
    {
      key: "by",
      label: "Sent By",
      width: "11%",
      render: (r) => r.requested_by,
      text: (r) => r.requested_by,
    },
    {
      key: "why",
      label: "Reason",
      width: "11%",
      render: (r) => r.transfer.rejection_reason || r.transfer.reason || "—",
      text: (r) => r.transfer.rejection_reason || r.transfer.reason || "—",
    },
    {
      key: "act",
      label: "Action",
      width: "6%",
      align: "center",
      render: (r) => {
        if (r.transfer.status !== "Pending") {
          return (
            <span
              className={`text-[10px] font-bold ${r.transfer.status === "Completed" ? "text-emerald-700" : "text-chetu-red"}`}
            >
              {r.transfer.status === "Completed" ? "Received" : "Rejected"}
            </span>
          );
        }
        if (!canAction) return <span className="text-[10px] text-slate-400">View</span>;
        return (
          <div className="flex items-center justify-center gap-1">
            <ActionButton onClick={() => openAccept(r)} title="Receive this member" tone="green">
              <Check className="h-3.5 w-3.5" />
            </ActionButton>
            <ActionButton
              onClick={() => {
                setRejecting(r);
                setReason("");
              }}
              title="Reject this transfer"
              tone="red"
            >
              <X className="h-3.5 w-3.5" />
            </ActionButton>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={<ReportExportButtons title="Receive Member" columns={columns} rows={filtered} />}
      >
        Receive Member
      </MisPageTitle>

      {!canAction && (
        <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
          Receiving a member is done by a Branch Manager of the receiving branch. You can review
          incoming transfers here.
        </p>
      )}

      <MisFilters
        title="Receive Member"
        cols={3}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Member name, code / Sending branch"
      >
        <Field label="Status">
          <select value={state} onChange={(e) => setState(e.target.value)} className="form-field">
            <option value="Pending">Waiting to be received</option>
            <option value="Completed">Received</option>
            <option value="Rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.transfer.id}
        hasSearched={hasSearched}
        emptyMessage="No incoming member transfers."
        idleMessage="Choose a status and press Search."
        mobileTitle={(r) => r.member_name}
        mobileSubtitle={(r) => `${r.from_branch} → ${r.to_branch}`}
      />

      <MisModal
        open={!!accepting}
        onClose={() => setAccepting(null)}
        title="Receive Member"
        width="max-w-lg"
      >
        {accepting && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">{accepting.member_name}</p>
              <p className="text-slate-500">
                {accepting.member_code} • {accepting.from_branch} → {accepting.to_branch}
              </p>
              {accepting.transfer.reason && (
                <p className="mt-1 text-slate-600">Reason given: {accepting.transfer.reason}</p>
              )}
            </div>

            <Field label="Place in Group">
              <select
                value={toGroupId}
                onChange={(e) => setToGroupId(e.target.value)}
                className="form-field"
              >
                <option value="">-- Decide later --</option>
                {destinationGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.group_name} ({g.group_code})
                  </option>
                ))}
              </select>
            </Field>
            {destinationGroups.length === 0 && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                This branch has no approved active groups yet. You can still receive the member and
                place them later.
              </p>
            )}

            <Field label="Assign to Loan Officer">
              <select
                value={toOfficerId}
                onChange={(e) => setToOfficerId(e.target.value)}
                className="form-field"
              >
                <option value="">-- Use the group's officer --</option>
                {destinationOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
              Accepting moves the member and any open loans into your branch. Collections become
              your branch's responsibility from that moment.
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAccepting(null)}
                className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmAccept}
                className="rounded bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Receiving…" : "Receive Member"}
              </button>
            </div>
          </div>
        )}
      </MisModal>

      <MisModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject Transfer"
        width="max-w-md"
      >
        {rejecting && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Rejecting sends <strong className="text-slate-900">{rejecting.member_name}</strong>{" "}
              back to <strong className="text-slate-900">{rejecting.from_branch}</strong>. Nothing
              about the member changes.
            </p>
            <Field label="Reason *">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="No suitable group, outstanding arrears, sent in error…"
                className="form-field resize-none"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded bg-slate-100 px-4 py-2 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmReject}
                className="rounded bg-chetu-red px-5 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        )}
      </MisModal>
    </div>
  );
};
