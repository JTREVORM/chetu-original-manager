/** Lending groups formed at this branch. */
import React, { useMemo } from "react";
import { UsersRound } from "lucide-react";
import { useNavigate } from "../../../lib/router-compat";
import { CLOSED_LOAN_STATUSES, type ClientGroup } from "../../../types/database.types";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { EmptyState, Panel, StatTile, StatusPill } from "../BranchUi";
import type { BranchTabProps } from "./shared";

export const BranchGroups: React.FC<BranchTabProps> = ({ slice, metrics }) => {
  const navigate = useNavigate();

  const perGroup = useMemo(() => {
    const clientsByGroup = new Map<string, string[]>();
    for (const client of slice.clients) {
      if (!client.group_id) continue;
      const list = clientsByGroup.get(client.group_id) || [];
      list.push(client.id);
      clientsByGroup.set(client.group_id, list);
    }

    const stats = new Map<
      string,
      { members: number; activeLoans: number; outstanding: number; savings: number }
    >();
    for (const group of slice.groups) {
      const memberIds = new Set(clientsByGroup.get(group.id) || []);
      const loans = slice.loans.filter(
        (l) =>
          memberIds.has(l.client_id) &&
          !CLOSED_LOAN_STATUSES.includes(l.status) &&
          l.status !== "Pending",
      );
      const savings = slice.savingsAccounts
        .filter((a) => (a.client_id && memberIds.has(a.client_id)) || a.group_id === group.id)
        .reduce((total, a) => total + Number(a.balance || 0), 0);
      stats.set(group.id, {
        members: memberIds.size,
        activeLoans: loans.length,
        outstanding: loans.reduce((total, l) => total + Number(l.outstanding_balance || 0), 0),
        savings,
      });
    }
    return stats;
  }, [slice]);

  const stat = (id: string) =>
    perGroup.get(id) || { members: 0, activeLoans: 0, outstanding: 0, savings: 0 };

  const columns: MisColumn<ClientGroup>[] = [
    {
      key: "name",
      label: "Group Name",
      width: "20%",
      render: (r) => <span className="font-semibold text-slate-800">{r.group_name}</span>,
      text: (r) => r.group_name,
    },
    {
      key: "code",
      label: "Group ID",
      width: "11%",
      render: (r) => r.group_code,
      text: (r) => r.group_code,
    },
    {
      key: "leader",
      label: "Chairperson",
      width: "15%",
      render: (r) => r.chairperson || <span className="text-slate-400">Not recorded</span>,
      text: (r) => r.chairperson || "Not recorded",
    },
    {
      key: "officer",
      label: "Loan Officer",
      width: "14%",
      render: (r) => r.loan_officer_name || <span className="text-slate-400">Unassigned</span>,
      text: (r) => r.loan_officer_name || "Unassigned",
    },
    {
      key: "members",
      label: "Members",
      width: "8%",
      align: "right",
      render: (r) => money(stat(r.id).members),
      text: (r) => String(stat(r.id).members),
    },
    {
      key: "loans",
      label: "Active Loans",
      width: "9%",
      align: "right",
      render: (r) => money(stat(r.id).activeLoans),
      text: (r) => String(stat(r.id).activeLoans),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      width: "12%",
      align: "right",
      render: (r) => `UGX ${money(stat(r.id).outstanding)}`,
      text: (r) => `UGX ${money(stat(r.id).outstanding)}`,
    },
    {
      key: "savings",
      label: "Savings",
      width: "11%",
      align: "right",
      render: (r) => `UGX ${money(stat(r.id).savings)}`,
      text: (r) => `UGX ${money(stat(r.id).savings)}`,
    },
    {
      key: "meeting",
      label: "Meeting Day",
      width: "9%",
      render: (r) => r.meeting_day || "—",
      text: (r) => r.meeting_day || "—",
    },
    {
      key: "formed",
      label: "Formed",
      width: "10%",
      render: (r) => shortDate(r.formation_date),
      text: (r) => shortDate(r.formation_date),
    },
    {
      key: "status",
      label: "Status",
      width: "9%",
      render: (r) => <StatusPill status={r.status} />,
      text: (r) => r.status,
    },
    {
      key: "act",
      label: "Action",
      width: "8%",
      render: () => (
        <button
          type="button"
          onClick={() => navigate("/client-groups")}
          className="text-[11px] font-bold text-[#0B4394] hover:underline"
        >
          Open
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total groups" value={money(metrics.groups.total)} />
        <StatTile
          label="Active groups"
          value={money(metrics.groups.active)}
          tone="text-emerald-600"
        />
        <StatTile
          label="Awaiting approval"
          value={money(slice.groups.filter((g) => g.approval_status === "Pending").length)}
          tone="text-amber-600"
        />
        <StatTile
          label="Members in groups"
          value={money(slice.clients.filter((c) => c.group_id).length)}
        />
      </div>

      <Panel title="Groups" subtitle="Every group formed under this branch">
        {slice.groups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No groups at this branch yet"
            message="Groups formed here will appear in this list."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={slice.groups}
            rowKey={(r) => r.id}
            emptyMessage="No groups at this branch."
            mobileTitle={(r) => r.group_name}
            mobileSubtitle={(r) => r.group_code}
          />
        )}
      </Panel>
    </div>
  );
};
