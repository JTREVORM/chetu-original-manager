import React, { useMemo, useState } from "react";
import {
  Field,
  MisFilters,
  MisPageTitle,
  MisTable,
  ScopeFields,
  SearchButton,
  money,
  shortDate,
  useMisScope,
  type MisColumn,
} from "../../components/mis/MisKit";
import { ReportExportButtons } from "../../components/mis/ReportExport";
import { useDatabase } from "../../context/DatabaseContext";
import { useStaffNames } from "./reportData";

type Kind = "Group" | "Member" | "Loan Application";
type State = "Pending" | "Rejected";

const KIND_ROUTE: Record<Kind, Record<State, string>> = {
  Group: { Pending: "/groups/waiting-approval", Rejected: "/groups/rejected" },
  Member: { Pending: "/member-waiting-approval", Rejected: "/member-rejected" },
  "Loan Application": { Pending: "/loan-waiting-approval", Rejected: "/loan-rejected" },
};

interface Row {
  id: string;
  kind: Kind;
  state: State;
  reference: string;
  name: string;
  branch_id: string;
  branch_name: string;
  officer_id: string;
  officer_name: string;
  group_name: string;
  amount: number | null;
  submitted_on: string;
  submitted_by: string;
  reason: string;
}

/**
 * Approval Pipeline — everything currently waiting on a decision, or bounced
 * back for correction, across all three approval queues in one list. The
 * individual queues are where work gets done; this is the management view of
 * how much is stuck and where.
 */
export const ApprovalPipeline: React.FC = () => {
  const scope = useMisScope();
  const { clientGroups, clients, loanApplications } = useDatabase();
  const staffName = useStaffNames();

  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    branchId: "",
    officerId: "",
    groupId: "",
    search: "",
    kind: "",
    state: "",
  });

  const runSearch = () => {
    setHasSearched(true);
    setApplied({
      branchId: scope.branchId,
      officerId: scope.officerId,
      groupId: scope.groupId,
      search,
      kind,
      state,
    });
  };

  const rows = useMemo<Row[]>(() => {
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const out: Row[] = [];

    for (const g of clientGroups) {
      if (g.approval_status !== "Pending" && g.approval_status !== "Rejected") continue;
      out.push({
        id: `group-${g.id}`,
        kind: "Group",
        state: g.approval_status,
        reference: g.group_code,
        name: g.group_name,
        branch_id: g.branch_id || "",
        branch_name: scope.branchName(g.branch_id),
        officer_id: g.loan_officer_id || "",
        officer_name: g.loan_officer_name || scope.officerName(g.loan_officer_id),
        group_name: g.group_name,
        amount: null,
        submitted_on: g.created_at.split("T")[0]!,
        submitted_by: staffName(g.created_by),
        reason: g.rejection_reason || "—",
      });
    }

    for (const c of clients) {
      if (c.approval_status !== "Pending" && c.approval_status !== "Rejected") continue;
      const group = c.group_id ? groupById.get(c.group_id) : undefined;
      out.push({
        id: `member-${c.id}`,
        kind: "Member",
        state: c.approval_status,
        reference: c.client_number,
        name: c.full_name,
        branch_id: c.branch_id || "",
        branch_name: scope.branchName(c.branch_id),
        officer_id: c.loan_officer_id || group?.loan_officer_id || "",
        officer_name: group?.loan_officer_name || scope.officerName(c.loan_officer_id),
        group_name: group?.group_name || "—",
        amount: null,
        submitted_on: (c.date_registered || c.created_at).split("T")[0]!,
        submitted_by: staffName(c.registered_by),
        reason: c.rejection_reason || "—",
      });
    }

    for (const a of loanApplications) {
      if (a.status !== "Pending" && a.status !== "Rejected") continue;
      const client = clientById.get(a.client_id);
      if (!client) continue;
      const group = client.group_id ? groupById.get(client.group_id) : undefined;
      out.push({
        id: `application-${a.id}`,
        kind: "Loan Application",
        state: a.status,
        reference: a.application_number,
        name: client.full_name,
        branch_id: client.branch_id || "",
        branch_name: scope.branchName(client.branch_id),
        officer_id: client.loan_officer_id || group?.loan_officer_id || "",
        officer_name: group?.loan_officer_name || scope.officerName(client.loan_officer_id),
        group_name: group?.group_name || "—",
        amount: Number(a.requested_amount),
        submitted_on: a.created_at.split("T")[0]!,
        submitted_by: staffName(a.submitted_by),
        reason: a.rejection_reason || "—",
      });
    }

    return out.sort((x, y) => (x.submitted_on < y.submitted_on ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGroups, clients, loanApplications, scope.officers, scope.activeBranches]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    return rows.filter((r) => {
      // An officer sees only what they themselves submitted.
      if (scope.isLoanOfficer && r.officer_id && r.officer_id !== scope.user?.id) return false;
      if (applied.branchId && r.branch_id !== applied.branchId) return false;
      if (applied.officerId && r.officer_id !== applied.officerId) return false;
      if (applied.kind && r.kind !== applied.kind) return false;
      if (applied.state && r.state !== applied.state) return false;
      if (q && !`${r.reference} ${r.name} ${r.group_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, applied, scope.isLoanOfficer, scope.user?.id]);

  const counts = useMemo(() => {
    const c = { pending: 0, rejected: 0, oldest: 0 };
    const today = Date.now();
    for (const r of filtered) {
      if (r.state === "Pending") {
        c.pending += 1;
        const age = Math.floor((today - new Date(r.submitted_on).getTime()) / 86400000);
        if (age > c.oldest) c.oldest = age;
      } else c.rejected += 1;
    }
    return c;
  }, [filtered]);

  const columns: MisColumn<Row>[] = [
    { key: "kind", label: "Type", width: "11%", render: (r) => r.kind, text: (r) => r.kind },
    {
      key: "state",
      label: "Status",
      width: "8%",
      render: (r) => (
        <span
          className={`font-bold ${r.state === "Pending" ? "text-amber-600" : "text-chetu-red"}`}
        >
          {r.state}
        </span>
      ),
      text: (r) => r.state,
    },
    {
      key: "ref",
      label: "Reference",
      width: "11%",
      render: (r) => r.reference,
      text: (r) => r.reference,
    },
    {
      key: "name",
      label: "Name",
      width: "14%",
      render: (r) => <span className="font-semibold text-slate-900">{r.name}</span>,
      text: (r) => r.name,
    },
    {
      key: "group",
      label: "Group",
      width: "11%",
      render: (r) => r.group_name,
      text: (r) => r.group_name,
    },
    {
      key: "branch",
      label: "Branch",
      width: "9%",
      render: (r) => r.branch_name,
      text: (r) => r.branch_name,
    },
    {
      key: "lo",
      label: "LO",
      width: "9%",
      render: (r) => r.officer_name,
      text: (r) => r.officer_name,
    },
    {
      key: "amt",
      label: "Amount",
      width: "8%",
      align: "right",
      render: (r) => (r.amount === null ? "—" : money(r.amount)),
      text: (r) => (r.amount === null ? "—" : money(r.amount)),
    },
    { key: "on", label: "Submitted", width: "8%", render: (r) => shortDate(r.submitted_on) },
    {
      key: "by",
      label: "Submitted By",
      width: "11%",
      render: (r) => r.submitted_by,
      text: (r) => r.submitted_by,
    },
  ];

  return (
    <div className="space-y-4 pb-16">
      <MisPageTitle
        right={<ReportExportButtons title="Approval Pipeline" columns={columns} rows={filtered} />}
      >
        Approval Pipeline
      </MisPageTitle>

      <MisFilters
        title="Approval Pipeline"
        cols={5}
        searchValue={search}
        onSearchChange={setSearch}
        onSubmit={runSearch}
        searchPlaceholder="Search by Name / Reference / Group"
      >
        <ScopeFields scope={scope} withGroup={false} />
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="form-field">
            <option value="">All</option>
            <option value="Group">Group</option>
            <option value="Member">Member</option>
            <option value="Loan Application">Loan Application</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={state} onChange={(e) => setState(e.target.value)} className="form-field">
            <option value="">All</option>
            <option value="Pending">Waiting for approval</option>
            <option value="Rejected">Rejected</option>
          </select>
        </Field>
        <SearchButton onClick={runSearch} />
      </MisFilters>

      <MisTable
        columns={columns}
        rows={hasSearched ? filtered : []}
        rowKey={(r) => r.id}
        hasSearched={hasSearched}
        emptyMessage="Nothing is waiting for approval."
        idleMessage="Choose the scope, then press Search."
        mobileTitle={(r) => r.name}
        mobileSubtitle={(r) => `${r.kind} • ${r.state} • ${r.reference}`}
        footer={
          filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-xs font-bold text-slate-700">
              <span className="font-normal text-slate-400">
                Act on these in{" "}
                {applied.kind
                  ? KIND_ROUTE[applied.kind as Kind][(applied.state as State) || "Pending"]
                  : "the Groups, Members and Loan queues"}
              </span>
              <span className="flex flex-wrap gap-6">
                <span className="text-amber-600">Waiting: {counts.pending}</span>
                <span className="text-chetu-red">Rejected: {counts.rejected}</span>
                {counts.oldest > 0 && <span>Oldest waiting: {counts.oldest} days</span>}
              </span>
            </div>
          )
        }
      />
    </div>
  );
};
