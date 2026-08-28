/**
 * Staff assigned to this branch.
 *
 * Row level security on `profiles` limits reads to Administrators and Auditors,
 * so for anyone else this says so rather than showing an empty table that would
 * read as "this branch has no staff".
 */
import React from "react";
import { ExternalLink, Users } from "lucide-react";
import { useNavigate } from "../../../lib/router-compat";
import { CLOSED_LOAN_STATUSES } from "../../../types/database.types";
import { MisTable, money, shortDate, type MisColumn } from "../../mis/MisKit";
import { EmptyState, NoticeBar, Panel, StatTile, StatusPill } from "../BranchUi";
import type { StaffMember } from "../useStaffDirectory";
import type { BranchTabProps } from "./shared";

const ROLE_TONES: Record<string, string> = {
  Administrator: "bg-[#0B4394]/10 text-[#0B4394]",
  "Branch Manager": "bg-violet-50 text-violet-700",
  "Loan Officer": "bg-emerald-50 text-emerald-700",
  Auditor: "bg-amber-50 text-amber-700",
};

export const BranchStaff: React.FC<BranchTabProps> = ({
  branch,
  slice,
  branchStaff,
  canReadDirectory,
  canManage,
}) => {
  const navigate = useNavigate();

  const openLoansFor = (officerId: string) =>
    slice.loans.filter((loan) => {
      if (CLOSED_LOAN_STATUSES.includes(loan.status) || loan.status === "Pending") return false;
      return slice.clients.find((c) => c.id === loan.client_id)?.loan_officer_id === officerId;
    }).length;

  const collectedBy = (officerId: string) =>
    slice.repayments
      .filter((r) => r.recorded_by === officerId)
      .reduce((total, r) => total + Number(r.amount_paid || 0), 0);

  const columns: MisColumn<StaffMember>[] = [
    {
      key: "name",
      label: "Staff Name",
      width: "20%",
      render: (row) => <span className="font-semibold text-slate-800">{row.full_name}</span>,
      text: (row) => row.full_name,
    },
    {
      key: "contact",
      label: "Phone",
      width: "12%",
      render: (row) => row.phone_number || "—",
      text: (row) => row.phone_number || "—",
    },
    {
      key: "role",
      label: "Role",
      width: "14%",
      render: (row) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ROLE_TONES[row.role] || "bg-slate-100 text-slate-600"}`}
        >
          {row.role}
        </span>
      ),
      text: (row) => row.role,
    },
    {
      key: "status",
      label: "Status",
      width: "10%",
      render: (row) => <StatusPill status={row.status} />,
      text: (row) => row.status,
    },
    {
      key: "loans",
      label: "Active Loans",
      width: "10%",
      align: "right",
      render: (row) => money(openLoansFor(row.id)),
      text: (row) => String(openLoansFor(row.id)),
    },
    {
      key: "collected",
      label: "Collections Recorded",
      width: "14%",
      align: "right",
      render: (row) => `UGX ${money(collectedBy(row.id))}`,
      text: (row) => `UGX ${money(collectedBy(row.id))}`,
    },
    {
      key: "since",
      label: "Member Since",
      width: "12%",
      render: (row) => shortDate(row.created_at),
      text: (row) => shortDate(row.created_at),
    },
    {
      key: "act",
      label: "Action",
      width: "8%",
      render: () =>
        canManage ? (
          <button
            type="button"
            onClick={() => navigate("/users")}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4394] hover:underline"
          >
            Manage <ExternalLink className="h-3 w-3" />
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  const byRole = (role: string) => branchStaff.filter((s) => s.role === role).length;

  if (!canReadDirectory) {
    return (
      <NoticeBar tone="blue">
        The staff directory is readable by Administrators and Auditors only, so this list cannot be
        shown to your role. Branch assignments are managed under User Management.
      </NoticeBar>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Staff assigned" value={money(branchStaff.length)} />
        <StatTile label="Branch managers" value={money(byRole("Branch Manager"))} />
        <StatTile label="Loan officers" value={money(byRole("Loan Officer"))} />
        <StatTile
          label="Active accounts"
          value={money(branchStaff.filter((s) => s.status === "Active").length)}
        />
      </div>

      <Panel
        title="Staff at this branch"
        subtitle="Assignment is set on each staff account under User Management."
        right={
          canManage && (
            <button
              type="button"
              onClick={() => navigate("/users")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              Open User Management <ExternalLink className="h-3 w-3" />
            </button>
          )
        }
      >
        {branchStaff.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff assigned to this branch"
            message={`Add ${branch.branch_name} to a staff member's branch list under User Management to give them access.`}
          />
        ) : (
          <MisTable
            columns={columns}
            rows={branchStaff}
            rowKey={(row) => row.id}
            emptyMessage="No staff assigned to this branch."
            mobileTitle={(row) => row.full_name}
            mobileSubtitle={(row) => row.role}
          />
        )}
      </Panel>
    </div>
  );
};
