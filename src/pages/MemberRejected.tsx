import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { MemberListBase, type MemberRow } from "./MemberList";
import { ActionButton, Field, MisModal } from "../components/mis/MisKit";

/** Member Rejected — admissions the Branch Manager turned down. */
export const MemberRejected: React.FC = () => {
  const { role } = useAuth();
  const { clientGroups, updateClient } = useDatabase();
  const { addToast } = useNotifications();

  const isLoanOfficer = role === "Loan Officer";
  const [resubmitFor, setResubmitFor] = useState<MemberRow | null>(null);

  return (
    <>
      <MemberListBase
        title="Member Rejected"
        statuses={["Active", "Inactive", "Blacklisted"]}
        approvalStatuses={["Rejected"]}
        extraColumns={[
          {
            key: "reason",
            label: "Reason",
            width: "14%",
            render: (r) => (
              <span className="text-chetu-red">{r.client.rejection_reason || "—"}</span>
            ),
            text: (r) => r.client.rejection_reason || "—",
          },
        ]}
        extraActions={(r) =>
          isLoanOfficer ? (
            <ActionButton tone="blue" title="Edit and resubmit" onClick={() => setResubmitFor(r)}>
              <Pencil className="h-3 w-3" />
            </ActionButton>
          ) : (
            <span className="text-[10px] font-semibold text-slate-400">View only</span>
          )
        }
      />

      <ResubmitModal
        row={resubmitFor}
        groups={clientGroups.filter(
          (g) => g.status === "Active" && g.approval_status === "Approved",
        )}
        onClose={() => setResubmitFor(null)}
        onSave={async (patch) => {
          if (!resubmitFor) return;
          await updateClient(resubmitFor.client.id, {
            ...patch,
            approval_status: "Pending",
            rejection_reason: null,
          });
          addToast(
            "success",
            "Resubmitted",
            `${resubmitFor.client.full_name} was sent back for review.`,
          );
          setResubmitFor(null);
        }}
      />
    </>
  );
};

const ResubmitModal: React.FC<{
  row: MemberRow | null;
  groups: { id: string; group_name: string; group_code: string }[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}> = ({ row, groups, onClose, onSave }) => {
  const [form, setForm] = useState({
    full_name: "",
    group_id: "",
    phone_number: "",
    physical_address: "",
  });
  const [loadedFor, setLoadedFor] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!row || loadedFor === row.client.id) return;
    setLoadedFor(row.client.id);
    setForm({
      full_name: row.client.full_name,
      group_id: row.client.group_id || "",
      phone_number: row.client.phone_number,
      physical_address: row.client.physical_address,
    });
  }, [row, loadedFor]);

  if (!row) return null;

  return (
    <MisModal
      open
      onClose={onClose}
      title={`Edit & Resubmit — ${row.client.full_name}`}
      width="max-w-xl"
    >
      <p className="mb-3 rounded bg-red-50 px-3 py-2 text-[11px] font-semibold text-chetu-red">
        Rejected: {row.client.rejection_reason || "—"}
      </p>

      <Field label="Full Name">
        <input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="form-field"
        />
      </Field>
      <div className="mt-3">
        <Field label="Group">
          <select
            value={form.group_id}
            onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            className="form-field"
          >
            <option value="">-- Select --</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_name} ({g.group_code})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Contact Number">
          <input
            value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            className="form-field"
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Address">
          <input
            value={form.physical_address}
            onChange={(e) => setForm({ ...form, physical_address: e.target.value })}
            className="form-field"
          />
        </Field>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(form);
          } finally {
            setSaving(false);
          }
        }}
        className="btn-save mt-5"
      >
        {saving ? "Saving…" : "Resubmit for Approval"}
      </button>
    </MisModal>
  );
};
