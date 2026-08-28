/**
 * Searchable staff picker.
 *
 * A branch manager is a person with an account, not a name typed into a box, so
 * this writes a `profiles.id`. Filtering is by name, role or phone because that
 * is what an administrator actually remembers about a colleague.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { StaffMember } from "./useStaffDirectory";

export const StaffSelect: React.FC<{
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  staff: StaffMember[];
  placeholder?: string;
  disabled?: boolean;
  /** Roles offered first; everyone else is still selectable further down. */
  preferredRoles?: string[];
  id?: string;
}> = ({
  value,
  onChange,
  staff,
  placeholder = "Search staff by name, role or phone",
  disabled,
  preferredRoles = [],
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = staff.find((s) => s.id === value) || null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false);
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

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = staff.filter((member) => {
      if (member.status !== "Active") return false;
      if (!term) return true;
      return (
        member.full_name.toLowerCase().includes(term) ||
        member.role.toLowerCase().includes(term) ||
        (member.phone_number || "").includes(term)
      );
    });
    const rank = (member: StaffMember) => {
      const index = preferredRoles.indexOf(member.role);
      return index === -1 ? preferredRoles.length : index;
    };
    return matches
      .sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name))
      .slice(0, 50);
  }, [staff, query, preferredRoles]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="form-field flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed"
      >
        <span className={`min-w-0 truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
          {selected ? `${selected.full_name} — ${selected.role}` : "Not assigned"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-chetu-red"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="w-full border-0 p-0 text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-3 text-center text-[12px] text-slate-500">
                No matching active staff.
              </li>
            )}
            {options.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={member.id === value}
                  onClick={() => {
                    onChange(member.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-800">
                      {member.full_name}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {member.role}
                      {member.phone_number ? ` · ${member.phone_number}` : ""}
                    </span>
                  </span>
                  {member.id === value && <Check className="h-4 w-4 shrink-0 text-[#0B4394]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
