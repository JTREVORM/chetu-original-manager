import React, { useState, useRef, useEffect } from "react";
import { TableScroll } from "../components/common/ScrollArea";
import { Link } from "../lib/router-compat";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { useNotifications } from "../context/NotificationContext";
import { Client } from "../types/database.types";
import { generateClientRegistrationPDF } from "../lib/pdfGenerator";
import { formatUGX } from "../lib/loanCalculations";
import { Avatar } from "../components/common/Avatar";
import {
  Users,
  Search,
  X,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Printer,
  ChevronRight,
  UserCheck,
  Building,
  Check,
  Camera,
  Pencil,
  ShieldCheck,
  PiggyBank,
  Briefcase,
  Mail,
} from "lucide-react";
import { PageHeader, FilterBar, FilterGroup, ChipRow, Chip } from "../components/mobile/Responsive";

export const Clients: React.FC = () => {
  const { isAuditor } = useAuth();
  const { clients, clientGroups, branches, updateClient, loans, repayments, savingsAccounts } =
    useDatabase();
  const { addToast } = useNotifications();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [groupFilter, setGroupFilter] = useState<string>("All");
  const [branchFilter, setBranchFilter] = useState<string>("All");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "loans" | "savings" | "repayments">("info");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [editFormData, setEditFormData] = useState({
    full_name: "",
    nin: "",
    gender: "Male" as "Male" | "Female" | "Other",
    date_of_birth: "1990-01-01",
    occupation: "",
    employer: "",
    phone_number: "",
    alt_phone_number: "",
    email: "",
    physical_address: "",
    village: "",
    parish: "",
    sub_county: "",
    district: "Kampala",
    group_id: "",
    branch_id: "",
    passport_photo: "",
    national_id_front: "",
    national_id_back: "",
  });

  const [editPhotoPreview, setEditPhotoPreview] = useState<string>("");
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const filteredClients = clients.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      c.full_name.toLowerCase().includes(term) ||
      c.client_number.toLowerCase().includes(term) ||
      c.nin.toLowerCase().includes(term) ||
      c.phone_number.includes(searchTerm);
    const matchesStatus = statusFilter === "All" || c.status === statusFilter;
    const matchesGroup = groupFilter === "All" || c.group_id === groupFilter;
    const matchesBranch = branchFilter === "All" || c.branch_id === branchFilter;
    return matchesSearch && matchesStatus && matchesGroup && matchesBranch;
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    await updateClient(selectedClient.id, {
      ...editFormData,
      passport_photo: editPhotoPreview || selectedClient.passport_photo,
    });
    addToast("success", "Client Updated", `Updated profile for ${editFormData.full_name}`);
    setSelectedClient((prev) =>
      prev
        ? { ...prev, ...editFormData, passport_photo: editPhotoPreview || prev.passport_photo }
        : null,
    );
    setIsEditModalOpen(false);
    setEditPhotoPreview("");
  };

  const openEditModal = (client: Client) => {
    setSelectedClient(client);
    setEditFormData({
      full_name: client.full_name,
      nin: client.nin,
      gender: client.gender,
      date_of_birth: client.date_of_birth,
      occupation: client.occupation,
      employer: client.employer || "",
      phone_number: client.phone_number,
      alt_phone_number: client.alt_phone_number || "",
      email: client.email || "",
      physical_address: client.physical_address,
      village: client.village,
      parish: client.parish,
      sub_county: client.sub_county,
      district: client.district,
      group_id: client.group_id || "",
      branch_id: client.branch_id || "",
      passport_photo: client.passport_photo || "",
      national_id_front: client.national_id_front || "",
      national_id_back: client.national_id_back || "",
    });
    setEditPhotoPreview(client.passport_photo || "");
    setIsEditModalOpen(true);
  };

  const handleEditPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clientLoans = selectedClient ? loans.filter((l) => l.client_id === selectedClient.id) : [];
  const clientRepayments = selectedClient
    ? repayments.filter((r) => r.client_id === selectedClient.id)
    : [];
  const clientSavings = selectedClient
    ? savingsAccounts.find((s) => s.client_id === selectedClient.id)
    : null;

  const statusPill = (status: string) =>
    status === "Active"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : status === "Blacklisted"
        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";

  return (
    <div className="space-y-5 pb-12 sm:space-y-6">
      {/* Header */}
      <div className="page-banner p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-200">
          <Users className="h-3.5 w-3.5 text-amber-400" />
          Member Register
        </div>
        <h1 className="text-2xl font-black tracking-tight">Member List</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">
          Registered members, their lending group, savings passbook and credit position.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Members", value: String(filteredClients.length), icon: Users },
          {
            label: "Active",
            value: String(filteredClients.filter((c) => c.status === "Active").length),
            icon: UserCheck,
          },
          {
            label: "Savings Held",
            value: formatUGX(
              savingsAccounts
                .filter((s) => filteredClients.some((c) => c.id === s.client_id))
                .reduce((sum, s) => sum + Number(s.balance), 0),
            ),
            icon: PiggyBank,
          },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B4394]/10 text-[#0B4394]">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="text-base font-black text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, member #, NIN or phone..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4394]/40"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
        >
          <option value="All">All Groups</option>
          {clientGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.group_name}
            </option>
          ))}
        </select>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
        >
          <option value="All">All Branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branch_name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
        >
          {["All", "Active", "Inactive", "Blacklisted"].map((s) => (
            <option key={s} value={s}>
              {s === "All" ? "All Statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {/* Members table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="hidden md:block">
          <TableScroll>
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  <th className="p-3.5">Member</th>
                  <th className="p-3.5">Group</th>
                  <th className="p-3.5">Branch</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Location</th>
                  <th className="p-3.5">Registered</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400">
                      No members found. Use{" "}
                      <Link to="/member-admission" className="font-bold text-[#0B4394]">
                        Members &rsaquo; Member Admission
                      </Link>{" "}
                      to admit one.
                    </td>
                  </tr>
                )}
                {filteredClients.map((client) => (
                  <tr key={client.id} className="transition-colors hover:bg-slate-50">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={client.passport_photo}
                          name={client.full_name}
                          className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-slate-100"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{client.full_name}</p>
                          <p className="text-[11px] font-bold text-[#0B4394]">
                            {client.client_number}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700">
                      {clientGroups.find((g) => g.id === client.group_id)?.group_name || "—"}
                    </td>
                    <td className="p-3.5 text-slate-700">
                      {branches.find((b) => b.id === client.branch_id)?.branch_name || "—"}
                    </td>
                    <td className="p-3.5 text-slate-700">
                      <p className="font-semibold">{client.phone_number}</p>
                      <p className="text-[11px] text-slate-500">{client.occupation}</p>
                    </td>
                    <td className="p-3.5 text-slate-700">
                      {client.village}, {client.district}
                    </td>
                    <td className="p-3.5 text-slate-700">{client.date_registered}</td>
                    <td className="p-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusPill(client.status)}`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#0B4394] hover:bg-blue-100"
                        >
                          View Passbook
                        </button>
                        {!isAuditor && (
                          <button
                            onClick={() => openEditModal(client)}
                            className="rounded-lg bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                            title="Edit Member"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredClients.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-400">No members found.</p>
          )}
          {filteredClients.map((client) => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <Avatar
                src={client.passport_photo}
                name={client.full_name}
                className="h-10 w-10 shrink-0 rounded-xl ring-2 ring-slate-100"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{client.full_name}</p>
                <p className="text-[11px] text-slate-500">
                  {client.client_number} • {client.phone_number}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(client.status)}`}
              >
                {client.status}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Client Detail Drawer Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar
                  src={selectedClient.passport_photo}
                  name={selectedClient.full_name}
                  className="w-12 h-12 shrink-0 rounded-xl ring-2 ring-white/30"
                />
                <div>
                  <h2 className="text-base font-bold">{selectedClient.full_name}</h2>
                  <p className="text-xs text-blue-200">
                    {selectedClient.client_number} • NIN: {selectedClient.nin}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isAuditor && (
                  <button
                    onClick={() => openEditModal(selectedClient)}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    title="Edit Profile"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Profile
                  </button>
                )}
                <button
                  onClick={() => generateClientRegistrationPDF(selectedClient)}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  title="Print Profile PDF"
                >
                  <Printer className="w-4 h-4" />
                  PDF
                </button>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-2 text-blue-200 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex border-b border-slate-200 bg-slate-50 px-5">
              <button
                onClick={() => setActiveTab("info")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === "info"
                    ? "border-[#0B4394] text-[#0B4394]"
                    : "border-transparent text-slate-500"
                }`}
              >
                Personal Info
              </button>
              <button
                onClick={() => setActiveTab("loans")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === "loans"
                    ? "border-[#0B4394] text-[#0B4394]"
                    : "border-transparent text-slate-500"
                }`}
              >
                Loans ({clientLoans.length})
              </button>
              <button
                onClick={() => setActiveTab("savings")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === "savings"
                    ? "border-[#0B4394] text-[#0B4394]"
                    : "border-transparent text-slate-500"
                }`}
              >
                Savings Vault
              </button>
              <button
                onClick={() => setActiveTab("repayments")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === "repayments"
                    ? "border-[#0B4394] text-[#0B4394]"
                    : "border-transparent text-slate-500"
                }`}
              >
                Repayments ({clientRepayments.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeTab === "info" && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Gender / DOB</p>
                      <p className="font-semibold text-slate-900">
                        {selectedClient.gender} ({selectedClient.date_of_birth})
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Occupation / Employer
                      </p>
                      <p className="font-semibold text-slate-900">
                        {selectedClient.occupation} ({selectedClient.employer || "Self"})
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Primary Phone
                      </p>
                      <p className="font-semibold text-slate-900">{selectedClient.phone_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Alternative Phone
                      </p>
                      <p className="font-semibold text-slate-900">
                        {selectedClient.alt_phone_number || "N/A"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Email Address
                      </p>
                      <p className="font-semibold text-slate-900">
                        {selectedClient.email || "N/A"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Client Group</p>
                      <p className="font-semibold text-[#0B4394]">
                        {clientGroups.find((g) => g.id === selectedClient.group_id)?.group_name ||
                          "Unassigned"}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#0B4394]" />
                      Location & Demographic Address
                    </h4>
                    <p>
                      <strong>Physical Address:</strong> {selectedClient.physical_address}
                    </p>
                    <p>
                      <strong>Village / LC1:</strong> {selectedClient.village}
                    </p>
                    <p>
                      <strong>Parish / Sub County:</strong> {selectedClient.parish},{" "}
                      {selectedClient.sub_county}
                    </p>
                    <p>
                      <strong>District:</strong> {selectedClient.district}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "loans" && (
                <div className="space-y-3">
                  {clientLoans.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      No loan records for this client.
                    </p>
                  ) : (
                    clientLoans.map((loan) => (
                      <div
                        key={loan.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">
                            {loan.loan_number}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                            {loan.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Principal: {formatUGX(loan.principal_amount)}
                        </p>
                        <p className="text-xs text-slate-600">
                          Outstanding Balance: {formatUGX(loan.outstanding_balance)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "savings" && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
                  {clientSavings ? (
                    <div>
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="font-bold text-slate-700">Savings Passbook Account</span>
                        <span className="font-black text-[#0B4394]">
                          {clientSavings.account_number}
                        </span>
                      </div>
                      <div className="pt-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Vault Balance
                        </p>
                        <h3 className="text-2xl font-black text-slate-900 mt-1">
                          {formatUGX(clientSavings.balance)}
                        </h3>
                        <p className="text-slate-500 mt-1">
                          Status: Active Individual Savings Account
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-6">No savings account linked.</p>
                  )}
                </div>
              )}

              {activeTab === "repayments" && (
                <div className="space-y-3">
                  {clientRepayments.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      No repayment transactions logged.
                    </p>
                  ) : (
                    clientRepayments.map((rep) => (
                      <div
                        key={rep.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{rep.receipt_number}</p>
                          <p className="text-slate-500">
                            {rep.payment_date} • {rep.payment_method}
                          </p>
                        </div>
                        <span className="font-bold text-emerald-600 text-sm">
                          {formatUGX(rep.amount_paid)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {isEditModalOpen && selectedClient && (
        <div
          data-testid="client-edit-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[calc(100vw-1.5rem)] max-w-2xl md:w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 brand-gradient text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Edit Client Profile</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.full_name}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, full_name: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">National ID (NIN) *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.nin}
                    onChange={(e) => setEditFormData({ ...editFormData, nin: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Gender *</label>
                  <select
                    value={editFormData.gender}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, gender: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.date_of_birth}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, date_of_birth: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Occupation *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.occupation}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, occupation: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Employer</label>
                  <input
                    type="text"
                    value={editFormData.employer}
                    onChange={(e) => setEditFormData({ ...editFormData, employer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.phone_number}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, phone_number: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Alternative Phone</label>
                  <input
                    type="text"
                    value={editFormData.alt_phone_number}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, alt_phone_number: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="form-label">Branch *</label>
                  <select
                    required
                    value={editFormData.branch_id}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, branch_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  >
                    <option value="">
                      {branches.length ? "Select Branch" : "No branches available"}
                    </option>
                    {branches
                      .filter((b) => b.status === "Active")
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.branch_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Client Group</label>
                  <select
                    value={editFormData.group_id}
                    onChange={(e) => setEditFormData({ ...editFormData, group_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                  >
                    <option value="">Select Group</option>
                    {clientGroups
                      .filter((g) => g.status === "Active")
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name} ({g.group_code})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Physical Address *</label>
                <input
                  type="text"
                  required
                  value={editFormData.physical_address}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, physical_address: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["village", "parish", "sub_county", "district"] as const).map((field) => (
                  <div key={field}>
                    <label className="form-label">{field.replace("_", " ")} *</label>
                    <input
                      type="text"
                      required
                      value={editFormData[field]}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, [field]: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-xl text-xs font-medium"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2 pt-4 border-t border-slate-100 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#0B4394] text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-900"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
