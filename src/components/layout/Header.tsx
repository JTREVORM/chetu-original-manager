import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useNotifications } from '../../context/NotificationContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationDrawer } from './NotificationDrawer';
import { UserProfileModal } from '../common/UserProfileModal';
import { BusinessDayModal } from './BusinessDayModal';
import { useBusinessDay } from '../../lib/businessDay';
import { formatUGX } from '../../lib/loanCalculations';
import { Search, Bell, Wallet, Menu, Building, CalendarDays, UserCircle2, RefreshCw, LogOut } from 'lucide-react';
import { UgandaFlag } from '../common/UgandaFlag';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, role, isAdmin, isAuditor, isBranchManager, logout, refreshProfile } = useAuth();
  const { currentBankBalance, branches, selectedBranchId, setSelectedBranchId, refetch } = useDatabase();
  const { unreadCount } = useNotifications();
  const { dayName, isOpen: isBusinessOpen, statusLabel, timeLabel } = useBusinessDay();

  const isLoanOfficer = role === 'Loan Officer';
  // A Loan Officer is fixed to the branch(es) they are attached to — `branches`
  // from the database context is already scoped to those branches.
  const lockedBranch = (isLoanOfficer || isBranchManager) && branches.length === 1 ? branches[0] : null;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBusinessDayOpen, setIsBusinessDayOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([refreshProfile(), refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };


  return (
    <>
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
            <button onClick={() => setIsProfileOpen(true)} className="p-1 text-slate-800" aria-label="Profile">
              <UserCircle2 className="w-6 h-6" />
            </button>
            <span className="leading-none" title="Uganda" role="img" aria-label="Uganda">
              <UgandaFlag className="w-6 h-4 rounded-sm shadow-sm" />
            </span>
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative p-1 text-slate-800"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-chetu-red rounded-full" />
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 text-chetu-red disabled:opacity-60"
              aria-label="Refresh data"
              title="Refresh data"
            >
              <RefreshCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => logout()} className="p-1 text-slate-800" aria-label="Sign out" title="Sign out">
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Left: Hamburger menu + Branch selector + Business days + Search trigger */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors md:hidden"
            aria-label="Toggle Sidebar"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>

          {/* Branch Dropdown */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <Building className="w-4 h-4 text-chetu-blue" />
            <span className="font-semibold text-slate-500">Branch:</span>
            {lockedBranch ? (
              <span className="font-bold text-slate-900" title="Fixed to your attached branch">
                {lockedBranch.branch_name}
              </span>
            ) : (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="">
                    {branches.length ? ((isLoanOfficer || isBranchManager) ? 'My Branches' : 'All Branches') : 'No branches yet'}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Live business day - always visible on desktop, no click needed */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border ${
              isBusinessOpen
                ? 'bg-emerald-50/80 border-emerald-200/70'
                : 'bg-red-50/80 border-red-200/70'
            }`}
            title="Business day"
          >
            <CalendarDays className={`w-4 h-4 ${isBusinessOpen ? 'text-emerald-600' : 'text-chetu-red'}`} />
            <span className="font-bold text-slate-900">
              {dayName} {statusLabel}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-bold text-slate-500 tabular-nums">{timeLabel}</span>
          </div>


          {/* Search Trigger for desktop */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="hidden sm:flex items-center gap-2.5 px-3.5 py-2 bg-slate-100/80 hover:bg-slate-100 text-slate-500 rounded-xl text-xs font-medium transition-all w-48 md:w-64 border border-slate-200/60"
          >
            <Search className="w-4 h-4 text-chetu-blue" />
            <span className="flex-1 text-left truncate">Search Member, NIN, Loan...</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-400">
              Ctrl+K
            </kbd>
          </button>

          {/* Search Trigger for mobile */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex sm:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Search"
          >
            <Search className="w-5 h-5 text-slate-700" />
          </button>
        </div>

        {/* Right: Quick Stats, Notifications & User Badge */}
        <div className="hidden md:flex items-center gap-3 sm:gap-4">
          {/* Bank Liquidity Quick Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200/70 rounded-xl">
            <Wallet className="w-4 h-4 text-chetu-blue" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase leading-none">Bank Liquidity</p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{formatUGX(currentBankBalance)}</p>
            </div>
          </div>

          {/* Refresh data */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-chetu-red hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-60"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Notifications"
          >
            <Bell className="w-5 h-5 text-slate-700" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-chetu-red text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* User Profile - clickable */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex shrink-0 items-center gap-2.5 pl-2 border-l border-slate-200 hover:bg-slate-50 rounded-r-xl transition-colors"
            title="My Profile"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user?.full_name}
                className="w-9 h-9 shrink-0 rounded-full object-cover ring-2 ring-chetu-blue/20"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chetu-blue text-[11px] font-black text-white ring-2 ring-chetu-blue/20">
                {(user?.full_name || '?')
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
            )}
            <div className="hidden lg:block min-w-0 text-left">
              <h4 className="text-xs font-bold text-slate-900 leading-tight truncate">{user?.full_name}</h4>
              <p className="text-[10px] text-slate-500 truncate">{user?.role}</p>
            </div>
          </button>

        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Notification Drawer */}
      <NotificationDrawer isOpen={isNotificationOpen} onClose={() => setIsNotificationOpen(false)} />

      {/* User Profile Modal */}
      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Business Days Modal */}
      <BusinessDayModal isOpen={isBusinessDayOpen} onClose={() => setIsBusinessDayOpen(false)} />
    </>
  );
};
