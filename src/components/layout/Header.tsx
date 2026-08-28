import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { NotificationDrawer } from "./NotificationDrawer";
import { NavLink } from "../../lib/router-compat";
import { BusinessDayModal } from "./BusinessDayModal";
import { useBusinessDay } from "../../lib/businessDay";
import { Search, Menu, CalendarDays, UserCircle2, RefreshCw, LogOut } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { LoaderOverlay } from "../common/Loader";
import { UgandaFlag } from "../common/UgandaFlag";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, role, isBranchManager, logout, refreshProfile } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId, refetch } = useDatabase();
  const { unreadCount, refreshNotifications, addToast } = useNotifications();
  const { isOpen: isBusinessOpen, statusLabel, timeLabel, dateLabel } = useBusinessDay();

  const isLoanOfficer = role === "Loan Officer";
  // A Loan Officer is fixed to the branch(es) they are attached to — `branches`
  // from the database context is already scoped to those branches.
  const lockedBranch =
    (isLoanOfficer || isBranchManager) && branches.length === 1 ? branches[0] : null;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isBusinessDayOpen, setIsBusinessDayOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Re-pull everything the user can currently see.
   *
   * `refetch` bumps `dataVersion`, which is what re-runs the screens that fetch
   * their own data (reports, member lists, the officer pickers) — without it
   * this button only reloaded the tables DatabaseContext happens to own, so on
   * most screens it visibly did nothing.
   *
   * `allSettled` rather than `all`: one failing call must not stop the others,
   * and a rejection here previously escaped as an unhandled promise.
   */
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const startedAt = Date.now();
    try {
      const results = await Promise.allSettled([
        refreshProfile(),
        refetch(),
        refreshNotifications(),
      ]);
      const failed = results.filter((r) => r.status === "rejected").length;
      // A fast refresh finishes before the loader is legible; hold it briefly
      // so the overlay reads as a reload rather than a flicker.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) await new Promise((r) => setTimeout(r, 650 - elapsed));

      if (failed === results.length) {
        addToast(
          "error",
          "Refresh failed",
          "Could not reach the server. Check your connection and try again.",
        );
      } else if (failed > 0) {
        addToast(
          "warning",
          "Partly refreshed",
          "Some data could not be reloaded. Try again in a moment.",
        );
      } else {
        addToast("success", "Data refreshed", "This screen is now showing the latest records.");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      {/* The refresh takes over the page while it runs, so the click reads as
          reloading the screen rather than only spinning an icon. */}
      {isRefreshing && <LoaderOverlay />}

      <header className="h-16 bg-white border-b border-slate-200 fixed top-0 right-0 left-0 md:left-64 z-20 flex items-center justify-between px-4 md:px-6 shadow-xs transition-all duration-300">
        {/* Mobile compact icon bar */}
        <div className="flex md:hidden w-full items-center justify-between">
          {/* Business days - first symbol */}
          <button
            onClick={() => setIsBusinessDayOpen(true)}
            className="p-1.5 text-slate-800"
            title="Business days"
            aria-label="Business days"
          >
            <CalendarDays className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-2.5">
            <button onClick={onToggleSidebar} className="p-1 text-slate-800" aria-label="Menu">
              <Menu className="w-6 h-6" />
            </button>
            <NavLink to="/profile" className="p-1 text-slate-800" aria-label="My profile">
              <UserCircle2 className="w-6 h-6" />
            </NavLink>
            <span className="leading-none" title="Uganda" role="img" aria-label="Uganda">
              <UgandaFlag className="w-6 h-4 rounded-sm shadow-sm" />
            </span>
            <NotificationBell
              count={unreadCount}
              onClick={() => setIsNotificationOpen(true)}
              size="lg"
            />
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 text-chetu-red disabled:opacity-60"
              aria-label="Refresh data"
              title="Refresh data"
            >
              <RefreshCw className={`w-6 h-6 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => logout()}
              className="p-1 text-slate-800"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/*
          Desktop bar.

          Left: the business day, stated in full, with the branch beneath it.
          Right: live status, who is signed in, then the action icons.
          Everything is shrink-0 except the spacer, and the labels drop away by
          breakpoint, so the row cannot overflow the space beside the sidebar.
        */}
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-4">
          {/* Business day + branch */}
          <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <CalendarDays
              className={`h-5 w-5 shrink-0 ${isBusinessOpen ? "text-slate-700" : "text-chetu-red"}`}
            />
            <div className="min-w-0 leading-tight">
              <p className="whitespace-nowrap text-[12px] font-bold text-slate-900">
                Business Day : {dateLabel}{" "}
                <span className={isBusinessOpen ? "text-emerald-600" : "text-chetu-red"}>
                  ({statusLabel})
                </span>
              </p>
              {lockedBranch ? (
                <p
                  className="truncate text-[12px] font-bold text-slate-900"
                  title="Fixed to your attached branch"
                >
                  {lockedBranch.branch_name}
                </p>
              ) : (
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  aria-label="Select branch"
                  className="-ml-0.5 max-w-44 cursor-pointer truncate bg-transparent text-[12px] font-bold text-slate-900 focus:outline-none"
                >
                  <option value="">
                    {branches.length
                      ? isLoanOfficer || isBranchManager
                        ? "My Branches"
                        : "All Branches"
                      : "No branches yet"}
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1" />

          {/* Live status — the clock doubles as proof the session is alive. */}
          <div
            className="hidden shrink-0 items-center gap-2 lg:flex"
            title={`Server time ${timeLabel}`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[15px] font-black text-emerald-600">Live Server</span>
          </div>

          {/* Who is signed in */}
          <NavLink
            to="/profile"
            title="My Profile"
            className="hidden shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 leading-tight transition-colors hover:bg-slate-100 lg:flex"
          >
            <div className="max-w-40 text-right">
              <p className="truncate text-[12px] font-bold text-slate-900">{user?.full_name}</p>
              <p className="truncate text-[11px] text-slate-500">({user?.role})</p>
            </div>
          </NavLink>

          <span className="hidden shrink-0 xl:block" title="Uganda" role="img" aria-label="Uganda">
            <UgandaFlag className="h-4 w-6 rounded-sm shadow-sm" />
          </span>

          {/* Actions — only the symbols this system actually has. */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="shrink-0 rounded-lg p-1.5 text-slate-700 transition-colors hover:bg-slate-100"
            title="Search (Ctrl+K)"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <NotificationBell count={unreadCount} onClick={() => setIsNotificationOpen(true)} />

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 rounded-full p-1 text-chetu-red transition-colors hover:bg-red-50 disabled:opacity-60"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`h-6 w-6 ${isRefreshing ? "animate-spin" : ""}`}
              strokeWidth={2.5}
            />
          </button>

          <button
            onClick={() => logout()}
            className="shrink-0 rounded-lg p-1.5 text-slate-700 transition-colors hover:bg-slate-100"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* User Profile Modal */}

      {/* Business Days Modal */}
      <BusinessDayModal isOpen={isBusinessDayOpen} onClose={() => setIsBusinessDayOpen(false)} />
    </>
  );
};
