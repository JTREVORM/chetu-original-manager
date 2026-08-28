import React, { useState } from 'react';
import { NavLink, useLocation } from '../../lib/router-compat';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { Avatar } from '../common/Avatar';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileSpreadsheet,
  CheckCircle,
  Receipt,
  PiggyBank,
  CreditCard,
  Building2,
  BarChart3,
  Calculator,
  UserCog,
  Settings as SettingsIcon,
  ShieldAlert,
  LogOut,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  UserPlus,
  Clock,
  CheckSquare,
  Building,
  Banknote,
  Ban,
  Undo2,
  TrendingDown,
  ClipboardList,
  ArrowLeftRight,
  Send,
  Coins,
  CalendarCheck
} from 'lucide-react';

interface SubMenuItem {
  name: string;
  path: string;
  icon?: React.ElementType;
  adminOnly?: boolean;
  branchManagerHidden?: boolean;
}

interface NavGroup {
  id: string;
  name: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  managementOnly?: boolean;
  officerOnly?: boolean;
  subItems: SubMenuItem[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { role, isAdmin, isAuditor, isBranchManager, user, logout } = useAuth();
  const { logAudit } = useDatabase();
  const location = useLocation();


  // Accordion state - default active expanded sections
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const navGroups: NavGroup[] = [
    {
      id: 'businessday',
      name: 'Business Day',
      icon: CalendarCheck,
      subItems: [
        { name: 'Business Day Control', path: '/business-day', icon: CalendarCheck }
      ]
    },
    {
      id: 'groups',
      name: 'Groups',
      icon: Building,
      subItems: [
        { name: 'Group Create', path: '/group-create', icon: UserPlus },
        { name: 'Waiting for Approval Group', path: '/groups/waiting-approval', icon: Clock },
        { name: 'Group List', path: '/client-groups', icon: Building },
        { name: 'Group Rejected List', path: '/groups/rejected', icon: ShieldAlert }
      ]
    },
    {
      id: 'members',
      name: 'Members',
      icon: Users,
      subItems: [
        { name: 'Member Admission', path: '/member-admission', icon: UserPlus },
        { name: 'Waiting for Approval Member', path: '/member-waiting-approval', icon: Clock },
        { name: 'Admission & Passbook Sale', path: '/admission-sales', icon: Receipt },
        { name: 'Member List', path: '/member-list', icon: Users },
        { name: 'Member Death Application', path: '/member-death-application', icon: ShieldAlert },
        { name: 'Member Death List', path: '/member-death-list', icon: FileText },
        { name: 'Member Inactive List', path: '/member-inactive', icon: Users },
        { name: 'Member Rejected', path: '/member-rejected', icon: ShieldAlert },
        { name: 'Member Records', path: '/clients', icon: FileText }
      ]
    },
    {
      id: 'loans',
      name: 'Loan - Management',
      icon: Briefcase,
      subItems: [
        { name: 'Loan Products', path: '/loan-products', icon: Briefcase },
        { name: 'Loan Applications', path: '/loan-applications', icon: FileSpreadsheet },
        // The three states an application moves through, in order.
        { name: 'Waiting for Approval', path: '/loan-waiting-approval', icon: Clock },
        { name: 'Waiting for Disburse', path: '/loan-waiting-disburse', icon: CheckSquare },
        { name: 'Loan Rejected List', path: '/loan-rejected', icon: ShieldAlert },
        { name: 'Weekly Repayments', path: '/repayments', icon: Receipt },
        { name: 'Loan Settlement', path: '/loan-settlement', icon: Banknote },
        { name: 'Loan Calculator', path: '/calculator', icon: Calculator }
      ]
    },
    {
      id: 'collections',
      name: 'Collections',
      icon: Receipt,
      subItems: [
        { name: 'Group Wise Collection', path: '/group-collection', icon: Users },
        { name: 'Overdue Collection', path: '/overdue-collection', icon: Clock },
        { name: 'Advance Collection', path: '/advance-collection', icon: CheckSquare },
        { name: 'BadDebts Collection', path: '/bad-debts-collection', icon: ShieldAlert }
      ]
    },
    {
      id: 'debt',
      name: 'Debt & Security',
      icon: ShieldAlert,
      subItems: [
        { name: 'Bad Loans List', path: '/bad-loans', icon: ShieldAlert },
        { name: 'Loan Writeoff', path: '/loan-writeoff', icon: Ban },
        { name: 'Loan Security Return', path: '/security-returns', icon: CreditCard },
        // Only an Administrator can actually reverse a posting; everyone else
        // (Auditors especially) still needs to read what was rolled back.
        { name: 'Loan Rollback', path: '/loan-rollback', icon: Undo2 }
      ]
    },

    {
      id: 'transfers',
      name: 'Transfers',
      icon: ArrowLeftRight,
      subItems: [
        { name: 'Member Branch Transfer', path: '/transfers/member', icon: Send },
        { name: 'Receive Member', path: '/transfers/receive', icon: CheckSquare },
        { name: 'Group Interchange', path: '/transfers/group-interchange', icon: ArrowLeftRight },
        { name: 'Group LO Transfer', path: '/transfers/group-officer', icon: UserCog }
      ]
    },
    {
      id: 'savings',
      name: 'Savings - Management',
      icon: PiggyBank,
      subItems: [
        { name: 'Savings Dashboard', path: '/savings', icon: PiggyBank },
        { name: 'Savings Accounts', path: '/savings-accounts', icon: PiggyBank },
        { name: 'Savings Report', path: '/reports/savings', icon: FileText }
      ]
    },
    {
      id: 'ledger',
      name: 'Financial Ledger',
      icon: Building2,
      managementOnly: true,
      subItems: [
        { name: 'Expense Management', path: '/expenses', icon: CreditCard },
        { name: 'Bank Management', path: '/bank-management', icon: Building2 }
      ]
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: BarChart3,
      subItems: [
        { name: 'Master Reports & PDFs', path: '/reports', icon: BarChart3 },
        { name: 'Master Roll', path: '/reports/master-roll', icon: FileText },
        { name: 'Daily Overdue Report', path: '/reports/daily-overdue', icon: Clock },
        { name: 'Day Collection List', path: '/reports/day-collection-list', icon: FileSpreadsheet },
        { name: 'Overdue Collection List', path: '/reports/overdue-collection-list', icon: FileSpreadsheet },
        { name: 'Outstanding Report', path: '/reports/outstanding', icon: FileText },
        { name: 'LO Wise Group Realizable', path: '/reports/lo-wise-group-realizable', icon: Users },
        { name: 'Portfolio at Risk', path: '/reports/par', icon: TrendingDown },
        { name: 'Loan Closure Report', path: '/reports/loan-closure', icon: CheckCircle },
        { name: 'Approval Pipeline', path: '/reports/approvals', icon: ClipboardList },
        { name: 'Reversal Register', path: '/reports/reversals', icon: Undo2 },
        { name: 'Fee Collection Report', path: '/reports/fee-collection', icon: Coins },
        // Auditor Dashboard is management-only; Loan Officers get reports scoped to their own portfolio.
        ...(isAdmin || isAuditor
          ? [{ name: 'Auditor Dashboard', path: '/audit', icon: ShieldAlert }]
          : [])
      ]
    },
    {
      id: 'admin',
      name: 'System Settings',
      icon: SettingsIcon,
      adminOnly: true,
      subItems: [
        { name: 'User Management', path: '/users', icon: UserCog },
        { name: 'Branch Network', path: '/branches', icon: Building2 },
        { name: 'System Settings', path: '/settings', icon: SettingsIcon },
        { name: 'Audit Logs', path: '/audit-logs', icon: FileText }
      ]
    }
  ];

  return (
    <>
      <aside className={`w-64 sidebar-gradient text-white min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 shadow-2xl border-r border-blue-900/60 font-sans transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        {/* Brand Header */}
        <div className="p-4 border-b border-blue-800/80 bg-[#083475] flex items-center gap-3">
          <img src="/logo.svg" alt="Chetu Microfinance Logo" className="h-9 w-auto bg-white p-1 rounded shadow-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-xs font-black tracking-wider text-chetu-red uppercase leading-none">CHETU</h1>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-amber-500 text-blue-950 rounded uppercase">CHETU V1</span>
            </div>
            <p className="text-[10px] font-bold tracking-widest text-blue-200 uppercase mt-0.5">MICROFINANCE LTD</p>
          </div>
        </div>

        {/* Role Indicator */}
        <div className="px-3.5 py-2 bg-[#06295E] border-b border-blue-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isAdmin ? 'bg-amber-400 animate-pulse' : (isAuditor ? 'bg-purple-400' : 'bg-emerald-400')}`}></span>
            <span className="text-xs font-bold text-blue-100">{role}</span>
          </div>
        </div>

        {/* Navigation Items (UMIS V2 Accordion Style) */}
        <div className="flex-1 min-h-0 scroll-area scroll-y py-2 px-2.5 space-y-1.5 text-xs">
          {/* Top Main Dashboard Link */}
          <NavLink
            to="/"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-amber-500 text-blue-950 font-black shadow-md'
                  : 'text-blue-100 hover:bg-blue-800/60 hover:text-white'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          {/* Accordion Groups */}
          {navGroups.map((group) => {
            if (group.adminOnly && !isAdmin && !isAuditor) return null;
            if (group.managementOnly && !isAdmin && !isAuditor && !isBranchManager) return null;
            const isExpanded = expandedGroups[group.id];
            const GroupIcon = group.icon;
            const isGroupActive = group.subItems.some(sub => location.pathname === sub.path.split('?')[0]);

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Header Button */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-3 py-3 md:py-2 rounded-lg text-[15px] md:text-xs font-bold transition-all text-left ${
                    isGroupActive || isExpanded
                      ? 'bg-[#F5A623] text-white shadow-sm'
                      : 'text-white hover:bg-blue-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 md:gap-2.5">
                    <GroupIcon className="w-5 h-5 md:w-4 md:h-4 shrink-0" />
                    <span>{group.name}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  ) : (
                    <ChevronRight className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  )}
                </button>

                {/* Sub Items Tree */}
                {isExpanded && (
                  <div className="pl-4 pr-1 py-1 space-y-0.5 border-l-2 border-amber-500/40 ml-4">
                    {group.subItems.map((sub) => {
                      if (sub.adminOnly && !isAdmin) return null;
                      if (sub.branchManagerHidden && isBranchManager) return null;
                      const SubIcon = sub.icon || Circle;
                      const basePath = sub.path.split('?')[0];
                      const isSubActive = location.pathname === basePath && (
                        !sub.path.includes('?') || location.search === `?${sub.path.split('?')[1]}`
                      );

                      return (
                        <NavLink
                          key={sub.path}
                          to={sub.path}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `flex items-center gap-3 md:gap-2 px-2.5 py-2.5 md:py-1.5 rounded-md text-[14px] md:text-[11px] font-normal md:font-medium transition-all ${
                              isSubActive || (isActive && !sub.path.includes('?'))
                                ? 'bg-white/20 text-white font-semibold md:font-bold'
                                : 'text-white hover:bg-white/10'
                            }`
                          }
                        >
                          <SubIcon className="w-[18px] h-[18px] md:w-3 md:h-3 text-white/90 md:text-amber-300 shrink-0" />
                          <span className="leading-snug md:truncate">{sub.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* User Footer Profile & Logout */}
        <div className="p-2.5 border-t border-blue-800/80 bg-[#06295E]">
          <div className="flex items-center justify-between p-2 rounded-lg bg-blue-950/60 border border-blue-800/80">
            <NavLink
              to="/profile"
              onClick={onClose}
              className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
              title="My Profile"
            >
              <Avatar
                src={user?.avatar_url}
                name={user?.full_name}
                className="w-7 h-7 shrink-0 rounded-full ring-2 ring-amber-400"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white truncate">{user?.full_name || 'System User'}</p>
                <p className="text-[9px] text-blue-200 truncate">{user?.role} ({user?.phone_number || 'Internal'})</p>
              </div>
            </NavLink>

            <button
              onClick={() => {
                logAudit('System Logout', 'Authentication', `${user?.full_name || 'User'} signed out of system.`);
                logout();
              }}
              title="Sign Out"
              className="p-1.5 text-blue-200 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

    </>
  );
};
