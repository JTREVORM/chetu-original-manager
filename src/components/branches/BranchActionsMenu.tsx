/**
 * The per-branch action list, shared by the grid cards and the table rows.
 *
 * Deletion is not offered as a peer of the other actions. A branch that carries
 * any member, group or ledger entry cannot be deleted at all, and the one that
 * can is a mistyped record created minutes ago — so it appears quietly, at the
 * bottom, only when it is genuinely safe.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Banknote,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  Pencil,
  PiggyBank,
  Power,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import { useNavigate } from "../../lib/router-compat";
import type { Branch } from "../../types/database.types";

export type BranchTab =
  | "overview"
  | "staff"
  | "members"
  | "groups"
  | "loans"
  | "savings"
  | "collections"
  | "cash"
  | "reports"
  | "settings";

export const BranchActionsMenu: React.FC<{
  branch: Branch;
  canManage: boolean;
  linkedRecords: number;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  align?: "left" | "right";
  compact?: boolean;
}> = ({
  branch,
  canManage,
  linkedRecords,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  align = "right",
  compact,
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const go = (tab: BranchTab) => {
    setOpen(false);
    navigate(`/branches/${branch.id}?tab=${tab}`);
  };

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const item =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 ${
          compact ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-[12px]"
        }`}
      >
        Actions
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <button type="button" role="menuitem" className={item} onClick={() => go("overview")}>
            <LayoutDashboard className="h-3.5 w-3.5 text-[#0B4394]" /> View Dashboard
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => go("staff")}>
            <Users className="h-3.5 w-3.5 text-slate-400" /> Manage Staff
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => go("members")}>
            <UsersRound className="h-3.5 w-3.5 text-slate-400" /> View Members
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => go("loans")}>
            <HandCoins className="h-3.5 w-3.5 text-slate-400" /> View Loans
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => go("savings")}>
            <PiggyBank className="h-3.5 w-3.5 text-slate-400" /> View Savings
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => go("collections")}>
            <Banknote className="h-3.5 w-3.5 text-slate-400" /> View Collections
          </button>

          {canManage && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button type="button" role="menuitem" className={item} onClick={() => run(onEdit)}>
                <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit Branch
              </button>
              {branch.status === "Active" ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-amber-700 hover:bg-amber-50`}
                  onClick={() => run(onDeactivate)}
                >
                  <Power className="h-3.5 w-3.5" /> Deactivate Branch
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-emerald-700 hover:bg-emerald-50`}
                  onClick={() => run(onReactivate)}
                >
                  <Power className="h-3.5 w-3.5" /> Reactivate Branch
                </button>
              )}
              {linkedRecords === 0 && (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-slate-500 hover:bg-red-50 hover:text-chetu-red`}
                  onClick={() => run(onDelete)}
                  title="Available only while the branch holds no records"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Empty Branch
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
