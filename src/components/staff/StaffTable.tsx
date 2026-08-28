/**
 * The staff register as a table.
 *
 * Dense on a desktop, because an administrator's first question is usually
 * "who is on this list?" and scrolling past oversized cards to answer it is a
 * waste of the screen. On a tablet the two columns that carry the least
 * decision weight — the contact block and the joining branch code — drop out;
 * on a phone each row becomes the pale-blue "Label : Value" card the rest of
 * this system uses, so the layout is one the staff already recognise.
 *
 * Selecting rows drives the bulk actions, so the checkbox column only appears
 * for someone who is actually allowed to perform one.
 */
import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from "lucide-react";
import { TableScroll } from "../common/ScrollArea";
import { Avatar } from "../common/Avatar";
import { DayBadge, RoleBadge, StatusBadge, loginStamp } from "./StaffUi";
import { StaffActionsMenu, type StaffActionHandlers } from "./StaffActionsMenu";
import type { StaffDirectoryRow } from "./useStaffRegister";

export type StaffSortKey = "name" | "role" | "branch" | "status" | "lastLogin" | "joined";

export const sortStaff = (
  rows: StaffDirectoryRow[],
  key: StaffSortKey,
  direction: "asc" | "desc",
): StaffDirectoryRow[] => {
  const value = (row: StaffDirectoryRow): string | number => {
    switch (key) {
      case "name":
        return row.full_name.toLowerCase();
      case "role":
        return row.role;
      case "branch":
        return (row.primary_branch_name || "").toLowerCase();
      case "status":
        return row.status;
      case "lastLogin":
        // Never signed in sorts as the oldest possible login, not as "now".
        return row.last_login_at ? new Date(row.last_login_at).getTime() : 0;
      case "joined":
        return row.date_joined ? new Date(row.date_joined).getTime() : 0;
      default:
        return 0;
    }
  };
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
};

const SortHeader: React.FC<{
  label: string;
  sortKey: StaffSortKey;
  active: StaffSortKey;
  direction: "asc" | "desc";
  onSort: (key: StaffSortKey) => void;
}> = ({ label, sortKey, active, direction, onSort }) => {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 transition hover:text-slate-800 ${isActive ? "text-slate-800" : ""}`}
    >
      {label}
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
};

/**
 * The business-day line, which only means anything for a Loan Officer: nobody
 * else has an officer day, so stating one for an Administrator would invent a
 * fact. Where a day exists it names both halves — the branch's day and the
 * officer's own — because "OPEN" alone does not say whether they may work.
 */
const DayCell: React.FC<{ staff: StaffDirectoryRow }> = ({ staff }) => {
  if (staff.role !== "Loan Officer") return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <DayBadge status={staff.business_day_status || "NOT_OPENED"} />
      <DayBadge status={staff.officer_day_status || "LOCKED"} />
    </span>
  );
};

export const StaffTable: React.FC<{
  rows: StaffDirectoryRow[];
  sortKey: StaffSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: StaffSortKey) => void;
  selectable: boolean;
  selected: string[];
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  currentUserId?: string;
  canManage: (row: StaffDirectoryRow) => boolean;
  onOpen: (row: StaffDirectoryRow) => void;
  handlers: (row: StaffDirectoryRow) => StaffActionHandlers;
}> = ({
  rows,
  sortKey,
  sortDirection,
  onSort,
  selectable,
  selected,
  onToggleRow,
  onToggleAll,
  currentUserId,
  canManage,
  onOpen,
  handlers,
}) => {
  const selectableRows = rows.filter((r) => r.id !== currentUserId);
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r.id));

  const header = (label: string, key: StaffSortKey) => (
    <SortHeader
      label={label}
      sortKey={key}
      active={sortKey}
      direction={sortDirection}
      onSort={onSort}
    />
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center">
        <Inbox className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-[13px] font-bold text-slate-700">No staff members found</p>
        <p className="mt-1 text-[12px] text-slate-500">Try changing your search or filters.</p>
      </div>
    );
  }

  return (
    <>
      {/* ------------------------------------------------------- desktop --- */}
      <div className="hidden md:block">
        <TableScroll
          ariaLabel="Staff register"
          className="rounded-lg border border-slate-200 bg-white shadow-xs"
        >
          <table className="w-full table-auto text-left text-[11px]">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2.5">
                {selectable && (
                  <th className="w-9">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleAll}
                      aria-label="Select every staff member in view"
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B4394]"
                    />
                  </th>
                )}
                <th>{header("Staff", "name")}</th>
                <th>{header("Role", "role")}</th>
                <th>{header("Branch", "branch")}</th>
                <th className="hidden lg:table-cell">Contact</th>
                <th>{header("Status", "status")}</th>
                <th>{header("Last Login", "lastLogin")}</th>
                <th className="hidden xl:table-cell">Business Day</th>
                <th className="w-12 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const login = loginStamp(row.last_login_at);
                const isSelf = row.id === currentUserId;
                return (
                  <tr
                    key={row.id}
                    className={`transition hover:bg-slate-50 ${selected.includes(row.id) ? "bg-blue-50/60" : ""}`}
                  >
                    {selectable && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.includes(row.id)}
                          disabled={isSelf}
                          onChange={() => onToggleRow(row.id)}
                          aria-label={`Select ${row.full_name}`}
                          className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B4394] disabled:opacity-40"
                        />
                      </td>
                    )}

                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <Avatar
                          src={row.avatar_url}
                          name={row.full_name}
                          className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-slate-200"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold text-slate-900 hover:text-[#0B4394]">
                            {row.full_name}
                          </span>
                          <span className="block text-[10px] font-semibold text-slate-400">
                            {row.staff_code || "—"}
                            {isSelf && <span className="ml-1.5 text-amber-600">· You</span>}
                          </span>
                        </span>
                      </button>
                    </td>

                    <td className="px-3 py-2.5">
                      <RoleBadge role={row.role} />
                    </td>

                    <td className="px-3 py-2.5">
                      {row.primary_branch_name ? (
                        <span className="block">
                          <span className="block truncate font-semibold text-slate-800">
                            {row.primary_branch_name}
                          </span>
                          {(row.branch_ids || []).length > 1 && (
                            <span className="block text-[10px] text-slate-400">
                              +{(row.branch_ids || []).length - 1} more
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">Institution-wide</span>
                      )}
                    </td>

                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      <span className="block truncate text-slate-700">
                        {row.phone_number || "—"}
                      </span>
                      <span className="block truncate text-[10px] text-slate-400">
                        {row.email || "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="block whitespace-nowrap text-slate-700">
                        {login.primary}
                      </span>
                      {login.secondary && (
                        <span className="block text-[10px] text-slate-400">{login.secondary}</span>
                      )}
                    </td>

                    <td className="hidden px-3 py-2.5 xl:table-cell">
                      <DayCell staff={row} />
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <StaffActionsMenu
                          staff={row}
                          canManage={canManage(row)}
                          isSelf={isSelf}
                          {...handlers(row)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {/* -------------------------------------------------------- mobile --- */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => {
          const login = loginStamp(row.last_login_at);
          const isSelf = row.id === currentUserId;
          return (
            <div key={row.id} className="rounded-lg bg-[#eaf1f8] px-4 py-3">
              <div className="flex items-start gap-3">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    disabled={isSelf}
                    onChange={() => onToggleRow(row.id)}
                    aria-label={`Select ${row.full_name}`}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0B4394] disabled:opacity-40"
                  />
                )}
                <Avatar
                  src={row.avatar_url}
                  name={row.full_name}
                  className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-white"
                />
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[14px] font-bold text-slate-900">
                    {row.full_name}
                  </span>
                  <span className="block text-[11px] font-semibold text-slate-500">
                    {row.staff_code || "—"}
                  </span>
                </button>
                <StaffActionsMenu
                  staff={row}
                  canManage={canManage(row)}
                  isSelf={isSelf}
                  {...handlers(row)}
                />
              </div>

              <div className="mt-2 space-y-[3px]">
                <p className="text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">Role :</span>{" "}
                  <RoleBadge role={row.role} className="ml-1" />
                </p>
                <p className="text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">Branch :</span>
                  <span className="ml-1">{row.primary_branch_name || "Institution-wide"}</span>
                </p>
                <p className="text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">Contact :</span>
                  <span className="ml-1 break-words">{row.phone_number || "—"}</span>
                </p>
                <p className="text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">Status :</span>{" "}
                  <StatusBadge status={row.status} className="ml-1" />
                </p>
                <p className="text-[13px] leading-snug text-slate-900">
                  <span className="font-bold">Last Login :</span>
                  <span className="ml-1">{login.primary}</span>
                </p>
                {row.role === "Loan Officer" && (
                  <p className="text-[13px] leading-snug text-slate-900">
                    <span className="font-bold">Business Day :</span>{" "}
                    <span className="ml-1">
                      <DayCell staff={row} />
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
