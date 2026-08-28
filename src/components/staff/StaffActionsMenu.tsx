/**
 * The per-staff action list behind the three-dot control.
 *
 * The destructive entries sit below a rule, and the two that end someone's
 * access — suspend and deactivate — never fire straight from the menu: each
 * opens a dialog that says what will happen and, for a suspension, insists on
 * a reason. An account holder cannot act on their own account here at all;
 * the database refuses it too, but the menu should not offer it.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Ban,
  Eye,
  FileClock,
  History,
  KeyRound,
  MoreVertical,
  Pencil,
  Power,
  ShieldCheck,
} from "lucide-react";
import type { StaffDirectoryRow } from "./useStaffRegister";

export interface StaffActionHandlers {
  onView: () => void;
  onEdit: () => void;
  onResetPassword: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onViewActivity: () => void;
  onViewAudit: () => void;
}

export const StaffActionsMenu: React.FC<
  StaffActionHandlers & {
    staff: StaffDirectoryRow;
    canManage: boolean;
    isSelf: boolean;
  }
> = ({
  staff,
  canManage,
  isSelf,
  onView,
  onEdit,
  onResetPassword,
  onSuspend,
  onReinstate,
  onDeactivate,
  onActivate,
  onViewActivity,
  onViewAudit,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Rows near the foot of a long register would otherwise open their menu off
  // the bottom of the viewport, where it cannot be reached.
  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setDropUp(window.innerHeight - rect.bottom < 280);
    setOpen((o) => !o);
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
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${staff.full_name}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-40 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            dropUp ? "bottom-full mb-1" : "mt-1"
          }`}
        >
          <button type="button" role="menuitem" className={item} onClick={() => run(onView)}>
            <Eye className="h-3.5 w-3.5 text-[#0B4394]" /> View Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => run(onViewActivity)}
          >
            <History className="h-3.5 w-3.5 text-slate-400" /> View Activity
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => run(onViewAudit)}>
            <FileClock className="h-3.5 w-3.5 text-slate-400" /> View Audit Log
          </button>

          {canManage && !isSelf && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button type="button" role="menuitem" className={item} onClick={() => run(onEdit)}>
                <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit Staff
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => run(onResetPassword)}
              >
                <KeyRound className="h-3.5 w-3.5 text-slate-400" /> Reset Password
              </button>

              <div className="my-1 border-t border-slate-100" />
              {staff.status === "Suspended" ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-emerald-700 hover:bg-emerald-50`}
                  onClick={() => run(onReinstate)}
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Lift Suspension
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-amber-700 hover:bg-amber-50`}
                  onClick={() => run(onSuspend)}
                >
                  <Ban className="h-3.5 w-3.5" /> Suspend Account
                </button>
              )}
              {staff.status === "Inactive" ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-emerald-700 hover:bg-emerald-50`}
                  onClick={() => run(onActivate)}
                >
                  <Power className="h-3.5 w-3.5" /> Reactivate Account
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-chetu-red hover:bg-red-50`}
                  onClick={() => run(onDeactivate)}
                >
                  <Power className="h-3.5 w-3.5" /> Deactivate Account
                </button>
              )}
            </>
          )}

          {isSelf && (
            <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
              Your own role and status cannot be changed from here.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
