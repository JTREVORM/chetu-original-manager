import React, { useState } from "react";
import { Navigate } from "../../lib/router-compat";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastContainer } from "../common/ToastContainer";
import { InstallAppPrompt } from "../common/InstallAppPrompt";
import { NotificationPermissionPrompt } from "../common/NotificationPermissionPrompt";

export const ProtectedLayout: React.FC<{ children: React.ReactNode; adminOnly?: boolean; managementOnly?: boolean }> = ({
  children,
  adminOnly,
  managementOnly,
}) => {
  const { user, isAdmin, isAuditor, isBranchManager } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin and Auditor can access admin-flagged view routes; Loan officers are redirected to dashboard
  if (adminOnly && !isAdmin && !isAuditor) {
    return <Navigate to="/" replace />;
  }

  if (managementOnly && !isAdmin && !isAuditor && !isBranchManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell min-h-screen flex selection:bg-chetu-blue selection:text-white overflow-x-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-25 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <main className="flex-1 min-w-0 w-full ml-0 md:ml-64 pt-16 sm:pt-20 px-3 sm:px-4 md:px-6 lg:px-8 min-h-screen transition-all duration-300">
        {children}
      </main>
      <ToastContainer />
      <InstallAppPrompt />
      <NotificationPermissionPrompt />
    </div>
  );
};
