/**
 * The staff directory, as far as the signed-in user is allowed to see it.
 *
 * DatabaseContext deliberately does not hold profiles, so the Branch Network
 * screens fetch them here — the same approach `useMisScope` takes for its
 * officer picker.
 *
 * Row level security on `profiles` is `id = auth.uid() OR is_admin_or_auditor()`.
 * A Branch Manager therefore reads only their own row, and `canReadDirectory`
 * reports that honestly so the Staff tab can say so rather than render an empty
 * table that looks like a branch with no staff.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useDatabase } from "../../context/DatabaseContext";

export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone_number: string | null;
  avatar_url: string | null;
  branch_ids: string[];
  status: string;
  created_at: string;
}

export function useStaffDirectory() {
  const { isAdmin, isAuditor } = useAuth();
  const { dataVersion } = useDatabase();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, role, phone_number, avatar_url, branch_ids, status, created_at",
        )
        .order("full_name");
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      else setError(null);
      setStaff((data || []) as StaffMember[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const byBranch = useMemo(() => {
    const map = new Map<string, StaffMember[]>();
    for (const member of staff) {
      for (const branchId of member.branch_ids || []) {
        const list = map.get(branchId);
        if (list) list.push(member);
        else map.set(branchId, [member]);
      }
    }
    return map;
  }, [staff]);

  const nameOf = (id?: string | null) =>
    id ? staff.find((s) => s.id === id)?.full_name || "" : "";

  return {
    staff,
    byBranch,
    nameOf,
    loading,
    error,
    /** False for Branch Managers and Loan Officers, whose RLS hides colleagues. */
    canReadDirectory: isAdmin || isAuditor,
  };
}
