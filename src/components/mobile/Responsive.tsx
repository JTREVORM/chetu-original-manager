import React from "react";

/**
 * Mobile-first page header.
 * Phones: icon + title, wrapped subtitle, full-width stacked actions (min 44px tall).
 * md and up: original single-row layout with right aligned actions.
 */
export const PageHeader: React.FC<{
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
    <div className="min-w-0">
      <h1 className="flex items-start gap-2 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
        {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-chetu-blue sm:h-6 sm:w-6" />}
        <span className="min-w-0 break-word">{title}</span>
      </h1>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </div>
);

/**
 * Search + filters shell. Search is always full width and sits above the
 * filters on phones; filters stay on one horizontal, scrollable line.
 */
export const FilterBar: React.FC<{ search?: React.ReactNode; children?: React.ReactNode }> = ({
  search,
  children,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
    {/*
      Every level carries min-w-0. A flex item defaults to min-width:auto, so
      without it the chip row below refuses to shrink, renders at its full
      content width and is clipped by the page shell instead of scrolling
      inside its own box.
    */}
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {search && <div className="w-full min-w-0 md:max-w-96">{search}</div>}
      {children && (
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-2">
          {children}
        </div>
      )}
    </div>
  </div>
);

/** Labelled group of filter controls: label above on phones, inline on desktop. */
export const FilterGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:text-xs md:normal-case md:tracking-normal">
      {label}
    </span>
    {children}
  </div>
);

/** Never-wrap, never-squeeze chip row. Scrolls horizontally inside its own box. */
export const ChipRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => <div className={`chip-row min-w-0 ${className}`}>{children}</div>;

export const Chip: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}> = ({ active, onClick, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`chip ${active ? "bg-chetu-blue text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
  >
    {children}
  </button>
);

/** Desktop-only wrapper: tables never render on phones. */
export const DesktopOnly: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => <div className={`hidden md:block ${className}`}>{children}</div>;

/** Phone/tablet-only wrapper for the card view that replaces a table. */
export const MobileOnly: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => <div className={`md:hidden ${className}`}>{children}</div>;

export type CardField = { label: string; value: React.ReactNode };

/**
 * The mobile replacement for one table row: a stacked, readable record card.
 */
export const RecordCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields: CardField[];
  actions?: React.ReactNode;
  onClick?: () => void;
}> = ({ title, subtitle, badge, fields, actions, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xs ${onClick ? "cursor-pointer active:bg-slate-50" : ""}`}
  >
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0">
        <h3 className="break-word text-sm font-bold leading-snug text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 break-word text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>

    {fields.length > 0 && (
      <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {fields.map((f, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,40%)_minmax(0,60%)] items-start gap-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {f.label}
            </dt>
            <dd className="break-word text-right text-xs font-semibold text-slate-800">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    )}

    {actions && (
      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">{actions}</div>
    )}
  </div>
);

/** Vertical stack of record cards with comfortable spacing. */
export const CardList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-3">{children}</div>
);

export const EmptyState: React.FC<{ icon?: React.ElementType; title: string; hint?: string }> = ({
  icon: Icon,
  title,
  hint,
}) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
    {Icon && <Icon className="mx-auto mb-2 h-6 w-6 text-slate-300" />}
    <p className="text-sm font-bold text-slate-600">{title}</p>
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
);
