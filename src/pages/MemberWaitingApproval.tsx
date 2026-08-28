import React, { useMemo, useState } from "react";
import { TableScroll } from "../components/common/ScrollArea";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { Client } from "../types/database.types";
import { Clock, Search, Pencil, Check, X, Users } from "lucide-react";

const field = "form-field";
const label = "form-label";

export const MemberWaitingApproval: React.FC = () => {
  const { role, user, isAdmin, isBranchManager, isAuditor } = useAuth();
  const { clients, clientGroups, updateClient, approveClient, rejectClient } = useDatabase();
  const { addToast } = useNotifications();

  const isLoanOfficer = role === "Loan Officer";
  const canReview = isAdmin || isBranchManager;

  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [rejectingClient, setRejectingClient] = useState<Client | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    group_id: "",
    phone_number: "",
    nin: "",
    physical_address: "",
    occupation: "",
  });

  const groupById = useMemo(() => new Map(clientGroups.map((g) => [g.id, g])), [clientGroups]);

  const pendingClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients
      .filter((c) => c.approval_status === "Pending")
      .filter((c) => (isLoanOfficer ? c.registered_by === user?.id : true))
      .filter((c) => {
        if (!term) return true;
        const group = c.group_id ? groupById.get(c.group_id) : undefined;
        const hay =
          `${c.full_name} ${c.client_number} ${group?.group_name || ""} ${group?.group_code || ""}`.toLowerCase();
        return hay.includes(term);
      });
  }, [clients, isLoanOfficer, user?.id, search, groupById]);

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      full_name: client.full_name,
      group_id: client.group_id || "",
      phone_number: client.phone_number,
      nin: client.nin,
      physical_address: client.physical_address,
      occupation: client.occupation,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    try {
      await updateClient(editingClient.id, formData);
      addToast("success", "Member Updated", `Updated ${formData.full_name}`);
      setEditingClient(null);
    } catch {
      addToast("error", "Update Failed", "Could not update the member.");
    }
  };

  const handleApprove = async (client: Client) => {
    setBusyId(client.id);
    try {
      await approveClient(client.id);
      addToast("success", "Member Approved", `${client.full_name} is now active.`);
    } catch (err: any) {
      addToast("error", "Approval Failed", err?.message || "Could not approve the member.");
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (client: Client) => {
    setRejectingClient(client);
    setRejectReason("");
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingClient || !rejectReason.trim()) return;
    setBusyId(rejectingClient.id);
    try {
      await rejectClient(rejectingClient.id, rejectReason.trim());
      addToast("info", "Member Rejected", `${rejectingClient.full_name} was rejected.`);
      setRejectingClient(null);
    } catch (err: any) {
      addToast("error", "Rejection Failed", err?.message || "Could not reject the member.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="page-banner p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Member Approvals
        </div>
        <h1 className="text-2xl font-black tracking-tight">Waiting for Approval Member</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          {canReview
            ? "Members awaiting your review before their admission is confirmed."
            : "Members you registered that are awaiting Branch Manager approval."}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Member name, code / Group name, code"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4394]/40"
          />
          <span className="flex items-center justify-center rounded-lg bg-[#0B4394] px-4 text-white">
            <Search className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="hidden md:block">
          <TableScroll>
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-tight text-slate-600">
                  <th className="px-2 py-3">Group</th>
                  <th className="px-2 py-3">Member Code</th>
                  <th className="px-2 py-3">Member Name</th>
                  <th className="px-2 py-3">Phone Number</th>
                  <th className="px-2 py-3">Admission Date</th>
                  <th className="px-2 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {pendingClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      No members waiting for approval.
                    </td>
                  </tr>
                )}
                {pendingClients.map((c) => {
                  const group = c.group_id ? groupById.get(c.group_id) : undefined;
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50">
                      <td className="truncate px-2 py-3 text-slate-700">
                        {group ? `${group.group_name} (${group.group_code})` : "—"}
                      </td>
                      <td className="truncate px-2 py-3 font-bold text-[#0B4394]">
                        {c.client_number}
                      </td>
                      <td className="truncate px-2 py-3 font-bold text-slate-900">{c.full_name}</td>
                      <td className="truncate px-2 py-3 text-slate-700">{c.phone_number}</td>
                      <td className="truncate px-2 py-3 text-slate-700">{c.date_registered}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isLoanOfficer && (
                            <button
                              onClick={() => openEdit(c)}
                              className="rounded-lg bg-blue-50 p-1 text-[#0B4394] transition-colors hover:bg-blue-100"
                              title="Edit member"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canReview && (
                            <>
                              <button
                                disabled={busyId === c.id}
                                onClick={() => handleApprove(c)}
                                className="rounded-lg bg-green-100 p-1 text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50"
                                title="Approve member"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                disabled={busyId === c.id}
                                onClick={() => openReject(c)}
                                className="rounded-lg bg-red-100 p-1 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                                title="Reject member"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {isAuditor && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              View only
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {pendingClients.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-400">
              No members waiting for approval.
            </p>
          )}
          {pendingClients.map((c) => {
            const group = c.group_id ? groupById.get(c.group_id) : undefined;
            return (
              <div key={c.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">{c.full_name}</p>
                    <p className="text-[11px] font-bold text-[#0B4394]">{c.client_number}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                    Pending
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <p>
                    Group: <strong className="text-slate-900">{group?.group_name || "—"}</strong>
                  </p>
                  <p>
                    Phone: <strong className="text-slate-900">{c.phone_number}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {isLoanOfficer && (
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg bg-blue-50 p-1.5 text-[#0B4394]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canReview && (
                    <>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => handleApprove(c)}
                        className="rounded-lg bg-green-100 p-1.5 text-green-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => openReject(c)}
                        className="rounded-lg bg-red-100 p-1.5 text-red-700 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit modal (Loan Officer resubmission) */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between brand-gradient p-5 text-white">
              <h3 className="text-base font-bold">Edit Member Submission</h3>
              <button
                onClick={() => setEditingClient(null)}
                className="text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3.5 p-4 text-xs md:p-6">
              <div>
                <label className={label}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className={field}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={label}>Group</label>
                  <select
                    value={formData.group_id}
                    onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                    className={field}
                  >
                    <option value="">-- Select --</option>
                    {clientGroups
                      .filter((g) => g.status === "Active")
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name} ({g.group_code})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Contact Number</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    className={field}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={label}>National ID</label>
                  <input
                    type="text"
                    value={formData.nin}
                    onChange={(e) => setFormData({ ...formData, nin: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Occupation</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    className={field}
                  />
                </div>
              </div>
              <div>
                <label className={label}>Address</label>
                <input
                  type="text"
                  value={formData.physical_address}
                  onChange={(e) => setFormData({ ...formData, physical_address: e.target.value })}
                  className={field}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B4394] px-5 py-2 font-bold text-white shadow-md hover:bg-blue-900"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal (Branch Manager / Administrator) */}
      {rejectingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl md:w-full">
            <div className="flex items-center justify-between bg-red-600 p-5 text-white">
              <h3 className="flex items-center gap-2 text-base font-black">
                <Users className="h-5 w-5" />
                Reject Member
              </h3>
              <button
                onClick={() => setRejectingClient(null)}
                className="text-white/80 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit} className="space-y-4 p-6 text-xs">
              <p className="text-slate-600">
                Rejecting <strong className="text-slate-900">{rejectingClient.full_name}</strong> (
                {rejectingClient.client_number}). The Loan Officer will be able to edit and
                resubmit.
              </p>
              <div>
                <label className={label}>Reason for rejection *</label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full resize-none rounded-xl border px-3 py-2 font-medium"
                  placeholder="Explain what needs to change before this member can be approved"
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setRejectingClient(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === rejectingClient.id}
                  className="rounded-xl bg-red-600 px-5 py-2 font-black text-white shadow-md hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
