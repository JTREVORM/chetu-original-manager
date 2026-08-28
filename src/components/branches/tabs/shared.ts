/** What every branch dashboard tab receives. */
import type { Branch } from "../../../types/database.types";
import type { BranchMetrics, BranchSlice } from "../../../lib/branchMetrics";
import type { StaffMember } from "../useStaffDirectory";

export interface BranchTabProps {
  branch: Branch;
  slice: BranchSlice;
  metrics: BranchMetrics;
  staff: StaffMember[];
  branchStaff: StaffMember[];
  canReadDirectory: boolean;
  canManage: boolean;
}

/** Resolve a profile id to a name, for rows that store `recorded_by` and friends. */
export const staffName = (staff: StaffMember[], id?: string | null) =>
  (id && staff.find((s) => s.id === id)?.full_name) || "";
