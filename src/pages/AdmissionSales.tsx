import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import { Receipt, Search } from "lucide-react";
import { TableScroll } from "../components/common/ScrollArea";

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface FeeRow {
  id: string;
  client_id: string;
  admission_fee: number;
  passbook_fee: number;
  crb_fee: number;
  total_amount: number;
  payment_method: string;
  receipt_number: string | null;
  branch_id: string | null;
  created_at: string;
}

interface OfficerRow {
  id: string;
  full_name: string;
  branch_ids: string[] | null;
  status: string;
}

const todayISO = () => new Date().toISOString().split("T")[0];
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
};

export const AdmissionSales: React.FC = () => {
  const { clients, branches, clientGroups, dataVersion } = useDatabase();
  const { user, role } = useAuth();

  const isLoanOfficer = role === "Loan Officer";
  const isBranchManager = role === "Branch Manager";
  const isAdmin = role === "Administrator";
  const isAuditor = role === "Auditor";

  const branchLocked = isBranchManager || isLoanOfficer;
  const officerLocked = isLoanOfficer;

  const [rows, setRows] = useState<FeeRow[]>([]);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const myBranches = user?.branch_ids ?? [];
  const activeBranches = useMemo(() => {
    const list = branches.filter((b) => b.status === "Active");
    if (isAdmin || isAuditor) return list;
    return myBranches.length ? list.filter((b) => myBranches.includes(b.id)) : list;
  }, [branches, isAdmin, isAuditor, myBranches.join(",")]);

  const [branchId, setBranchId] = useState("");
  const [officerId, setOfficerId] = useState(isLoanOfficer ? user?.id || "" : "");
  const [groupId, setGroupId] = useState("");
  const [fromDate, setFromDate] = useState(monthStartISO());
  const [toDate, setToDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Applied filters (only change when Search is pressed)
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: isLoanOfficer ? user?.id || "" : "",
    groupId: "",
    fromDate: monthStartISO(),
    toDate: todayISO(),
    search: "",
  });

  useEffect(() => {
    if (branchLocked) {
      const locked = myBranches[0] || activeBranches[0]?.id || "";
      setBranchId(locked);
      setApplied((p) => ({ ...p, branchId: locked }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLocked, myBranches.join(","), activeBranches.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [feesRes, officersRes] = await Promise.all([
        supabase.from("member_fees").select("*").order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, full_name, branch_ids, status")
          .eq("role", "Loan Officer")
          .order("full_name"),
      ]);
      if (cancelled) return;
      setRows((feesRes.data || []) as FeeRow[]);
      setOfficers(((officersRes.data || []) as OfficerRow[]).filter((o) => o.status === "Active"));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const officerOptions = useMemo(
    () => officers.filter((o) => !branchId || (o.branch_ids || []).includes(branchId)),
    [officers, branchId],
  );

  const groupOptions = useMemo(
    () =>
      clientGroups.filter(
        (g) =>
          (!branchId || g.branch_id === branchId) &&
          (isLoanOfficer
            ? g.loan_officer_id === user?.id
            : !officerId || !g.loan_officer_id || g.loan_officer_id === officerId),
      ),
    [clientGroups, branchId, officerId, isLoanOfficer, user?.id],
  );

  const enriched = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const officerById = new Map(officers.map((o) => [o.id, o]));

    return rows.map((r) => {
      const client = clientById.get(r.client_id);
      const group = client?.group_id ? groupById.get(client.group_id) : undefined;
      const branch = branchById.get(r.branch_id || client?.branch_id || "");
      const officerName =
        group?.loan_officer_name ||
        (group?.loan_officer_id ? officerById.get(group.loan_officer_id)?.full_name : "") ||
        "—";
      return {
        ...r,
        branch_name: branch?.branch_name || "—",
        officer_name: officerName,
        officer_id: group?.loan_officer_id || "",
        group_id: group?.id || "",
        group_code: group?.group_code || "—",
        group_name: group?.group_name || "—",
        member_code: client?.client_number || "—",
        member_name: client?.full_name || "—",
      };
    });
  }, [rows, clients, clientGroups, branches, officers]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (isLoanOfficer && r.officer_id && r.officer_id !== user?.id) return false;
      if (branchLocked && myBranches.length && r.branch_id && !myBranches.includes(r.branch_id))
        return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.groupId && r.group_id !== applied.groupId) return false;
      const date = r.created_at.split("T")[0];
      if (applied.fromDate && date < applied.fromDate) return false;
      if (applied.toDate && date > applied.toDate) return false;
      if (q) {
        const hay =
          `${r.group_name} ${r.group_code} ${r.member_name} ${r.member_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, applied, isLoanOfficer, user?.id, branchLocked, myBranches.join(",")]);

  const totals = useMemo(
    () =>
      (hasSearched ? filtered : []).reduce(
        (acc, r) => ({
          admission: acc.admission + Number(r.admission_fee || 0),
          passbook: acc.passbook + Number(r.passbook_fee || 0),
          crb: acc.crb + Number(r.crb_fee || 0),
          total: acc.total + Number(r.total_amount || 0),
        }),
        { admission: 0, passbook: 0, crb: 0, total: 0 },
      ),
    [filtered, hasSearched],
  );

  const runSearch = () => {
    setHasSearched(true);
    setApplied({ branchId, officerId, groupId, fromDate, toDate, search });
  };

  const results = hasSearched ? filtered : [];

  const lockedBranchName = branches.find((b) => b.id === branchId)?.branch_name || "—";

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
        Admission &amp; Passbook Sale (Member)
      </h1>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
        <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="form-label">Select Branch</label>
            {branchLocked ? (
              <input readOnly value={lockedBranchName} className="form-field bg-slate-100" />
            ) : (
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setOfficerId("");
                  setGroupId("");
                }}
                className="form-field"
              >
                <option value="">-- Select --</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="form-label">Loan Officer</label>
            {officerLocked ? (
              <input readOnly value={user?.full_name || "—"} className="form-field bg-slate-100" />
            ) : (
              <select
                value={officerId}
                onChange={(e) => {
                  setOfficerId(e.target.value);
                  setGroupId("");
                }}
                className="form-field"
              >
                <option value="">-- Select --</option>
                {officerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="form-label">Select Group</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="form-field"
            >
              <option value="">-- Select --</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.group_name} ({g.group_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="form-field"
            />
          </div>
          <div>
            <label className="form-label">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="form-field"
            />
          </div>

          <button
            type="button"
            onClick={runSearch}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-[#0B4394] px-4 text-[12px] font-bold text-white hover:bg-[#093672] sm:h-[34px]"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search by Group name, code / Member name, code"
            className="form-field flex-1"
          />
          <button
            type="button"
            onClick={runSearch}
            aria-label="Search records"
            className="inline-flex h-[34px] w-10 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <TableScroll
          ariaLabel="Admission sales"
          className="rounded-lg border border-slate-200 bg-white shadow-xs"
        >
          <table className="w-full min-w-[900px] table-fixed text-left text-[11px]">
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr className="[&>th]:whitespace-nowrap">
                <th className="px-2 py-2.5">Branch</th>
                <th className="px-2 py-2.5">LO</th>
                <th className="px-2 py-2.5">Product</th>
                <th className="px-2 py-2.5">Group Code</th>
                <th className="px-2 py-2.5">Group Name</th>
                <th className="px-2 py-2.5">Member Code</th>
                <th className="px-2 py-2.5">Member Name</th>
                <th className="px-2 py-2.5">Admission Date</th>
                <th className="px-2 py-2.5 text-right">Admission Fee</th>
                <th className="px-2 py-2.5 text-right">Passbook Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    Loading fee records…
                  </td>
                </tr>
              )}
              {!loading && !hasSearched && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    <Receipt className="mx-auto mb-2 h-6 w-6" />
                    Choose your filters and press Search to view records.
                  </td>
                </tr>
              )}
              {!loading && hasSearched && results.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    <Receipt className="mx-auto mb-2 h-6 w-6" />
                    No admission or passbook sales found.
                  </td>
                </tr>
              )}
              {!loading &&
                results.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 [&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap"
                  >
                    <td className="px-2 py-2.5 text-slate-600" title={r.branch_name}>
                      {r.branch_name}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600" title={r.officer_name}>
                      {r.officer_name}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">Umodzi Micro Loan</td>
                    <td className="px-2 py-2.5 text-slate-600" title={r.group_code}>
                      {r.group_code}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600" title={r.group_name}>
                      {r.group_name}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600" title={r.member_code}>
                      {r.member_code}
                    </td>
                    <td className="px-2 py-2.5 font-semibold text-slate-900" title={r.member_name}>
                      {r.member_name}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-700">
                      {money(r.admission_fee)}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-700">
                      {money(r.passbook_fee)}
                    </td>
                  </tr>
                ))}
            </tbody>
            {!loading && results.length > 0 && (
              <tfoot className="bg-slate-50 text-[11px] font-bold text-slate-800">
                <tr>
                  <td colSpan={8} className="px-2 py-2.5 text-right">
                    Totals (CRB {money(totals.crb)} · Grand {money(totals.total)})
                  </td>
                  <td className="px-2 py-2.5 text-right">{money(totals.admission)}</td>
                  <td className="px-2 py-2.5 text-right">{money(totals.passbook)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableScroll>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {loading && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-400">
            Loading fee records…
          </div>
        )}
        {!loading && !hasSearched && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Receipt className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">No results yet</p>
            <p className="mt-1 text-xs text-slate-400">Choose your filters and press Search.</p>
          </div>
        )}
        {!loading && hasSearched && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Receipt className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              No admission or passbook sales found.
            </p>
          </div>
        )}
        {!loading &&
          results.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold leading-snug text-slate-900">
                    {r.member_name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">{r.member_code}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {[
                  { label: "Branch", value: r.branch_name },
                  { label: "LO", value: r.officer_name },
                  { label: "Group", value: `${r.group_name} (${r.group_code})` },
                  { label: "Product", value: "Umodzi Micro Loan" },
                  { label: "Admission Fee", value: money(r.admission_fee) },
                  { label: "Passbook Fee", value: money(r.passbook_fee) },
                  { label: "CRB Fee", value: money(r.crb_fee) },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="grid grid-cols-[minmax(0,40%)_minmax(0,60%)] items-start gap-3"
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {f.label}
                    </dt>
                    <dd className="break-words text-right text-xs font-semibold text-slate-800">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        {!loading && results.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-800">
            <div className="flex justify-between">
              <span>Admission total</span>
              <span>{money(totals.admission)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Passbook total</span>
              <span>{money(totals.passbook)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>CRB total</span>
              <span>{money(totals.crb)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
              <span>Grand total</span>
              <span>{money(totals.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
