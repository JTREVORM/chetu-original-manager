import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDatabase } from "../../context/DatabaseContext";
import { useMisScope } from "../../components/mis/MisKit";
import { fetchAllRows } from "../../lib/fetchAll";
import type {
  Client,
  ClientGroup,
  Loan,
  LoanProduct,
  WeeklyScheduleRow,
} from "../../types/database.types";

export interface ScheduleRow extends WeeklyScheduleRow {
  loan_id: string;
}

/** All weekly instalment rows, grouped by loan. Reports need them for overdue maths. */
export function useSchedules() {
  const { dataVersion } = useDatabase();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Paged: this is the same table, and the same silent row cap, that cost
      // every loan its later weeks on the collection screens. A report reading
      // a truncated schedule understates arrears without saying so.
      const { data } = await fetchAllRows<ScheduleRow>(
        () =>
          supabase
            .from("loan_repayment_schedule")
            .select(
              "id, loan_id, week_number, due_date, installment_amount, principal_portion, interest_portion, paid_amount, remaining_balance, status, paid_at",
            )
            .order("week_number")
            .order("id"),
        "loan_repayment_schedule",
      );
      if (!cancelled) {
        setRows((data || []) as unknown as ScheduleRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const byLoan = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const r of rows) {
      const list = map.get(r.loan_id);
      if (list) list.push(r);
      else map.set(r.loan_id, [r]);
    }
    return map;
  }, [rows]);

  return { schedules: rows, byLoan, loading };
}

export interface LoanRow {
  loan: Loan;
  client: Client;
  group?: ClientGroup;
  product?: LoanProduct;
  group_id: string;
  group_name: string;
  group_code: string;
  meeting_day: string;
  branch_id: string;
  branch_name: string;
  officer_id: string;
  officer_name: string;
  product_name: string;
  schedule: ScheduleRow[];
}

/** Loans joined to member / group / branch / officer / product for every report screen. */
export function useLoanRows(scope: ReturnType<typeof useMisScope>) {
  const { loans, clients, clientGroups, loanProducts } = useDatabase();
  const { byLoan, loading } = useSchedules();

  const rows = useMemo<LoanRow[]>(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const groupById = new Map(clientGroups.map((g) => [g.id, g]));
    const productById = new Map(loanProducts.map((p) => [p.id, p]));

    return loans
      .map<LoanRow | null>((loan) => {
        const client = clientById.get(loan.client_id);
        if (!client) return null;
        const group = client.group_id ? groupById.get(client.group_id) : undefined;
        const product = productById.get(loan.product_id);
        const officerId = client.loan_officer_id || group?.loan_officer_id || "";
        const branchId = client.branch_id || group?.branch_id || "";
        return {
          loan,
          client,
          group,
          product,
          group_id: group?.id || "",
          group_name: group?.group_name || "—",
          group_code: group?.group_code || "—",
          meeting_day: group?.meeting_day || "—",
          branch_id: branchId,
          branch_name: scope.branchName(branchId),
          officer_id: officerId,
          officer_name: group?.loan_officer_name || scope.officerName(officerId),
          product_name: product?.product_name || "—",
          schedule: byLoan.get(loan.id) || [],
        };
      })
      .filter((r): r is LoanRow => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, clients, clientGroups, loanProducts, byLoan, scope.officers, scope.activeBranches]);

  return { rows, loading };
}

/** Standard branch / officer / group / free-text scope filter shared by all reports. */
export function matchScope(
  row: LoanRow,
  applied: { branchId?: string; officerId?: string; groupId?: string; search?: string },
  scope: ReturnType<typeof useMisScope>,
) {
  if (scope.isLoanOfficer && row.officer_id && row.officer_id !== scope.user?.id) return false;
  if (applied.branchId && row.branch_id !== applied.branchId) return false;
  if (applied.officerId && row.officer_id !== applied.officerId) return false;
  if (applied.groupId && row.group_id !== applied.groupId) return false;
  const q = (applied.search || "").trim().toLowerCase();
  if (q) {
    const hay =
      `${row.group_name} ${row.group_code} ${row.client.full_name} ${row.client.client_number} ${row.loan.loan_number}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export interface ReversalRow {
  id: string;
  loan_id: string;
  reversal_type: string;
  reference_number: string | null;
  amount: number;
  reason: string;
  reversed_by: string | null;
  created_at: string;
}

/**
 * The rollback ledger. Reversing a posted disbursement or receipt is the
 * highest-risk action in the system, so the register is read straight from the
 * table rather than derived — the source rows are deleted by the rollback.
 */
export function useLoanReversals() {
  const { dataVersion } = useDatabase();
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("loan_reversals")
        .select(
          "id, loan_id, reversal_type, reference_number, amount, reason, reversed_by, created_at",
        )
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows((data || []) as unknown as ReversalRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return { reversals: rows, loading };
}

/**
 * Every staff member by id. `useMisScope` only knows Loan Officers, but
 * approvals and reversals are performed by managers and administrators too.
 */
export function useStaffNames() {
  const { dataVersion } = useDatabase();
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, role");
      if (!cancelled) {
        setNames(
          new Map((data || []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return (id?: string | null) => (id ? names.get(id) || "—" : "—");
}

export interface MemberFeeRow {
  id: string;
  client_id: string;
  admission_fee: number;
  passbook_fee: number;
  crb_fee: number;
  total_amount: number;
  payment_method: string;
  receipt_number: string | null;
  branch_id: string | null;
  collected_by: string | null;
  created_at: string;
}

/** Admission and passbook charges taken when members were admitted. */
export function useMemberFees() {
  const { dataVersion } = useDatabase();
  const [rows, setRows] = useState<MemberFeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("member_fees")
        .select(
          "id, client_id, admission_fee, passbook_fee, crb_fee, total_amount, payment_method, receipt_number, branch_id, collected_by, created_at",
        )
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows((data || []) as unknown as MemberFeeRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return { memberFees: rows, loading };
}

export const paidTotal = (schedule: ScheduleRow[]) =>
  schedule.reduce((s, r) => s + Number(r.paid_amount || 0), 0);

/** Days past due of the oldest unpaid instalment as at `asOn`; 0 if current. */
export function daysPastDue(schedule: ScheduleRow[], asOn: string) {
  const unpaid = schedule
    .filter(
      (r) =>
        r.due_date <= asOn && Number(r.installment_amount || 0) - Number(r.paid_amount || 0) > 0,
    )
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const oldest = unpaid[0];
  if (!oldest) return 0;
  return Math.max(
    0,
    Math.floor((new Date(asOn).getTime() - new Date(oldest.due_date).getTime()) / 86400000),
  );
}

/** Standard microfinance arrears buckets. */
export const PAR_BUCKETS = [
  { key: "current", label: "Current", min: 0, max: 0 },
  { key: "par1", label: "PAR 1-30", min: 1, max: 30 },
  { key: "par31", label: "PAR 31-60", min: 31, max: 60 },
  { key: "par61", label: "PAR 61-90", min: 61, max: 90 },
  { key: "par90", label: "PAR 90+", min: 91, max: Number.MAX_SAFE_INTEGER },
] as const;

export const bucketFor = (days: number) =>
  PAR_BUCKETS.find((b) => days >= b.min && days <= b.max) || PAR_BUCKETS[0];

/** Amount that should have been collected on or before `asOn` and is still unpaid. */
export function overdueAsOf(schedule: ScheduleRow[], asOn: string) {
  return schedule
    .filter((r) => r.due_date <= asOn)
    .reduce(
      (s, r) => s + Math.max(0, Number(r.installment_amount || 0) - Number(r.paid_amount || 0)),
      0,
    );
}

/** Instalments falling exactly on `asOn` that are still unpaid — today's realizable. */
export function realizableOn(schedule: ScheduleRow[], asOn: string) {
  return schedule
    .filter((r) => r.due_date === asOn)
    .reduce(
      (s, r) => s + Math.max(0, Number(r.installment_amount || 0) - Number(r.paid_amount || 0)),
      0,
    );
}
