/** Members admitted at this branch, with their loan and savings position. */
import React, { useMemo, useState } from "react";
import { UsersRound } from "lucide-react";
import { CLOSED_LOAN_STATUSES, type Client } from "../../../types/database.types";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { EmptyState, Panel, StatTile, StatusPill } from "../BranchUi";
import type { BranchTabProps } from "./shared";

export const BranchMembers: React.FC<BranchTabProps> = ({ slice, metrics }) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [groupId, setGroupId] = useState("All");

  const loanBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const loan of slice.loans) {
      if (CLOSED_LOAN_STATUSES.includes(loan.status) || loan.status === "Pending") continue;
      map.set(
        loan.client_id,
        (map.get(loan.client_id) || 0) + Number(loan.outstanding_balance || 0),
      );
    }
    return map;
  }, [slice.loans]);

  const savingsBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of slice.savingsAccounts) {
      if (!account.client_id) continue;
      map.set(account.client_id, (map.get(account.client_id) || 0) + Number(account.balance || 0));
    }
    return map;
  }, [slice.savingsAccounts]);

  const groupName = (id?: string) =>
    id ? slice.groups.find((g) => g.id === id)?.group_name || "—" : "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return slice.clients.filter((client) => {
      if (status !== "All" && client.status !== status) return false;
      if (groupId !== "All" && client.group_id !== groupId) return false;
      if (!term) return true;
      return [client.full_name, client.client_number, client.phone_number].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(term),
      );
    });
  }, [slice.clients, search, status, groupId]);

  const columns: MisColumn<Client>[] = [
    {
      key: "number",
      label: "Member ID",
      width: "12%",
      render: (r) => r.client_number,
      text: (r) => r.client_number,
    },
    {
      key: "name",
      label: "Member Name",
      width: "20%",
      render: (r) => <span className="font-semibold text-slate-800">{r.full_name}</span>,
      text: (r) => r.full_name,
    },
    {
      key: "phone",
      label: "Phone",
      width: "12%",
      render: (r) => r.phone_number || "—",
      text: (r) => r.phone_number || "—",
    },
    {
      key: "group",
      label: "Group",
      width: "16%",
      render: (r) => groupName(r.group_id),
      text: (r) => groupName(r.group_id),
    },
    {
      key: "loan",
      label: "Loan Balance",
      width: "13%",
      align: "right",
      render: (r) => `UGX ${money(loanBalances.get(r.id) || 0)}`,
      text: (r) => `UGX ${money(loanBalances.get(r.id) || 0)}`,
    },
    {
      key: "savings",
      label: "Savings Balance",
      width: "13%",
      align: "right",
      render: (r) => `UGX ${money(savingsBalances.get(r.id) || 0)}`,
      text: (r) => `UGX ${money(savingsBalances.get(r.id) || 0)}`,
    },
    {
      key: "status",
      label: "Status",
      width: "9%",
      render: (r) => <StatusPill status={r.status === "Active" ? "Active" : r.status} />,
      text: (r) => r.status,
    },
    {
      key: "joined",
      label: "Registered",
      width: "10%",
      render: (r) => shortDate(r.date_registered),
      text: (r) => shortDate(r.date_registered),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total members" value={money(metrics.members.total)} />
        <StatTile
          label="Active members"
          value={money(metrics.members.active)}
          tone="text-emerald-600"
        />
        <StatTile label="New (last 30 days)" value={money(metrics.members.new30)} />
        <StatTile
          label="Dormant / inactive"
          value={money(metrics.members.dormant)}
          tone={metrics.members.dormant > 0 ? "text-amber-600" : "text-slate-900"}
        />
      </div>

      <Panel title="Members" subtitle={`${rows.length} of ${slice.clients.length} shown`}>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="form-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, member ID or phone…"
            aria-label="Search members"
          />
          <select
            className="form-field"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">Status: All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Blacklisted">Blacklisted</option>
          </select>
          <select
            className="form-field"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            aria-label="Filter by group"
          >
            <option value="All">Group: All</option>
            {slice.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.group_name}
              </option>
            ))}
          </select>
        </div>

        {slice.clients.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No members at this branch yet"
            message="Members admitted here will appear in this list."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            emptyMessage="No members match these filters."
            mobileTitle={(r) => r.full_name}
            mobileSubtitle={(r) => r.client_number}
          />
        )}
      </Panel>
    </div>
  );
};
