/**
 * The branch record itself, plus the audit trail of changes made to it.
 *
 * The trail comes from `audit_logs`, which every branch mutation already writes
 * to, so nothing new is recorded to build this view.
 */
import React, { useMemo } from "react";
import { History, Pencil, Power } from "lucide-react";
import { useDatabase } from "../../../context/DatabaseContext";
import type { AuditLog } from "../../../types/database.types";
import { MisTable, money, type MisColumn } from "../../mis/MisKit";
import { EmptyState, NoticeBar, Panel, StatusPill } from "../BranchUi";
import type { BranchTabProps } from "./shared";

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <span className="shrink-0 text-[12px] text-slate-500">{label}</span>
    <span className="min-w-0 text-right text-[12px] font-semibold text-slate-900">
      {value || <span className="text-slate-400">Not set</span>}
    </span>
  </div>
);

const stamp = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const BranchSettings: React.FC<
  BranchTabProps & { onEdit: () => void; onDeactivate: () => void; onReactivate: () => void }
> = ({ branch, staff, canManage, onEdit, onDeactivate, onReactivate }) => {
  const { auditLogs } = useDatabase();

  const managerName =
    staff.find((s) => s.id === branch.manager_id)?.full_name || branch.manager_name;
  const assistantName = staff.find((s) => s.id === branch.assistant_manager_id)?.full_name;

  const history = useMemo(
    () =>
      auditLogs
        .filter((log) => log.module === "Branch Management" && log.record_id === branch.id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [auditLogs, branch.id],
  );

  const columns: MisColumn<AuditLog>[] = [
    {
      key: "when",
      label: "Date / Time",
      width: "18%",
      render: (r) => stamp(r.created_at),
      text: (r) => stamp(r.created_at),
    },
    {
      key: "action",
      label: "Action",
      width: "18%",
      render: (r) => <span className="font-semibold text-slate-800">{r.action}</span>,
      text: (r) => r.action,
    },
    {
      key: "user",
      label: "User",
      width: "18%",
      render: (r) => r.user_name,
      text: (r) => r.user_name,
    },
    {
      key: "role",
      label: "Role",
      width: "14%",
      render: (r) => r.user_role,
      text: (r) => r.user_role,
    },
    {
      key: "details",
      label: "Change",
      width: "32%",
      render: (r) => <span className="text-slate-600">{r.details}</span>,
      text: (r) => r.details,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Branch record"
          subtitle="Identity, location and contact"
          right={
            canManage && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )
          }
        >
          <Row label="Branch name" value={branch.branch_name} />
          <Row label="Branch code" value={branch.branch_code} />
          <Row label="Branch type" value={branch.branch_type} />
          <Row label="Status" value={<StatusPill status={branch.status} />} />
          <Row label="Region" value={branch.region} />
          <Row label="District" value={branch.district} />
          <Row label="Town / municipality" value={branch.town} />
          <Row label="Physical address" value={branch.physical_address || branch.location} />
          <Row label="Phone" value={branch.phone} />
          <Row label="Alternative phone" value={branch.alt_phone} />
          <Row label="Email" value={branch.email} />
          <Row
            label="GPS"
            value={
              branch.latitude != null && branch.longitude != null
                ? `${branch.latitude}, ${branch.longitude}`
                : null
            }
          />
        </Panel>

        <div className="space-y-4">
          <Panel title="Management" subtitle="Linked staff accounts">
            <Row label="Branch manager" value={managerName} />
            <Row label="Assistant manager" value={assistantName} />
            <div className="mt-3">
              <NoticeBar tone="blue">
                Assignment here is a record of who runs the branch. Access to its data comes from
                the branch list on each staff account under User Management.
              </NoticeBar>
            </div>
          </Panel>

          <Panel title="Operations">
            <Row
              label="Opening hours"
              value={
                branch.opening_time && branch.closing_time
                  ? `${branch.opening_time.slice(0, 5)} – ${branch.closing_time.slice(0, 5)}`
                  : null
              }
            />
            <Row
              label="Working days"
              value={branch.working_days?.length ? branch.working_days.join(", ") : null}
            />
            <Row label="Default currency" value={branch.currency} />
            <Row
              label="Maximum cash holding"
              value={
                branch.max_cash_holding != null ? `UGX ${money(branch.max_cash_holding)}` : null
              }
            />
            <Row label="Approval level" value={branch.approval_level} />
            <Row label="Created" value={stamp(branch.created_at)} />
            <Row label="Last updated" value={stamp(branch.updated_at)} />
          </Panel>

          {canManage && (
            <Panel title="Status" subtitle="Closing a branch keeps every record it holds">
              {branch.status === "Active" ? (
                <>
                  <p className="text-[12px] leading-relaxed text-slate-600">
                    This branch is open for business. Deactivating it prevents new operations from
                    being processed under it while leaving all existing records intact.
                  </p>
                  <button
                    type="button"
                    onClick={onDeactivate}
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-[12px] font-bold text-chetu-red hover:bg-red-100"
                  >
                    <Power className="h-3.5 w-3.5" /> Deactivate Branch
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <Row label="Deactivated" value={stamp(branch.deactivated_at)} />
                    <Row label="Reason" value={branch.deactivation_reason} />
                  </div>
                  <button
                    type="button"
                    onClick={onReactivate}
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Power className="h-3.5 w-3.5" /> Reactivate Branch
                  </button>
                </>
              )}
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Audit trail" subtitle="Every recorded change to this branch">
        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No changes recorded for this branch"
            message="Creating, editing, deactivating and reactivating a branch are all written to the audit log."
          />
        ) : (
          <MisTable
            columns={columns}
            rows={history}
            rowKey={(r) => r.id}
            emptyMessage="No changes recorded."
            mobileTitle={(r) => r.action}
            mobileSubtitle={(r) => stamp(r.created_at)}
            maxHeight="50vh"
          />
        )}
      </Panel>
    </div>
  );
};
